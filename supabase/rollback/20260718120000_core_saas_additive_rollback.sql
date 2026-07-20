-- ══════════════════════════════════════════════════════════════════
-- CORE SAAS COMPLETION — ADDITIVE ROLLBACK
-- File: supabase/rollback/20260718120000_core_saas_additive_rollback.sql
--
-- Reverts 20260718120000_core_saas_additive.sql.
--
-- Steps:
--   1. Restore the four match lifecycle RPCs to their pre-notification
--      forms (identical to the versions deployed in
--      20260717140000_secure_player_match_lifecycle.sql).
--   2. Drop the new notification and challenge RPCs.
--   3. Drop list_my_leagues.
--   4. Drop create_notification_internal.
--
-- ⚠  DO NOT RUN if 20260718130000_core_saas_lockdown.sql has been applied.
--    The lockdown revokes direct challenge/notification INSERT/UPDATE.
--    Restoring the old RPCs without the direct-write privileges will leave
--    the product with no working challenge or notification path.
--    Always roll back the lockdown first.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Restore submit_match_result_secure (no notification) ──────────────

CREATE OR REPLACE FUNCTION ladder.submit_match_result_secure(
  p_token    text,
  p_match_id uuid,
  p_result   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id uuid;
  v_status    text;
  v_is_bye    boolean;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  SELECT status, is_bye
    INTO v_status, v_is_bye
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_is_bye        THEN RAISE EXCEPTION 'bye_match';        END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'match_not_pending'; END IF;

  PERFORM ladder.get_match_participant_side(v_player_id, p_match_id);
  PERFORM ladder.validate_match_result_payload(p_match_id, p_result);

  UPDATE ladder.matches
     SET status             = 'awaiting_confirmation',
         result             = p_result,
         submitted_by       = v_player_id,
         submitted_at       = now(),
         auto_confirm_after = now() + interval '48 hours'
   WHERE id = p_match_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.submit_match_result_secure(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.submit_match_result_secure(text, uuid, jsonb)
  TO anon, authenticated;

-- ── 2. Restore confirm_match_result_secure (no notification) ─────────────

CREATE OR REPLACE FUNCTION ladder.confirm_match_result_secure(
  p_token    text,
  p_match_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id      uuid;
  v_status         text;
  v_submitted_by   uuid;
  v_submitter_side int;
  v_confirmer_side int;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  SELECT status, submitted_by
    INTO v_status, v_submitted_by
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  IF v_status <> 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'match_not_awaiting_confirmation';
  END IF;

  IF v_submitted_by IS NULL THEN
    RAISE EXCEPTION 'invalid_match_state';
  END IF;

  v_confirmer_side := ladder.get_match_participant_side(v_player_id, p_match_id);
  v_submitter_side := ladder.get_match_participant_side(v_submitted_by, p_match_id);

  IF v_submitter_side = v_confirmer_side THEN
    RAISE EXCEPTION 'cannot_confirm_own_submission';
  END IF;

  UPDATE ladder.matches
     SET status       = 'confirmed',
         confirmed_by = v_player_id,
         confirmed_at = now()
   WHERE id = p_match_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.confirm_match_result_secure(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.confirm_match_result_secure(text, uuid)
  TO anon, authenticated;

-- ── 3. Restore open_match_dispute_secure (no notification) ───────────────

CREATE OR REPLACE FUNCTION ladder.open_match_dispute_secure(
  p_token         text,
  p_match_id      uuid,
  p_reason        text,
  p_counter_score jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id      uuid;
  v_status         text;
  v_submitted_by   uuid;
  v_submitter_side int;
  v_disputer_side  int;
  v_trimmed_reason text;
BEGIN
  v_player_id      := ladder.resolve_player_from_token(p_token);
  v_trimmed_reason := trim(p_reason);

  IF v_trimmed_reason IS NULL OR v_trimmed_reason = '' THEN
    RAISE EXCEPTION 'reason_empty';
  END IF;

  IF length(v_trimmed_reason) > 1000 THEN
    RAISE EXCEPTION 'reason_too_long';
  END IF;

  SELECT status, submitted_by
    INTO v_status, v_submitted_by
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  IF v_status <> 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'match_not_awaiting_confirmation';
  END IF;

  IF v_submitted_by IS NULL THEN
    RAISE EXCEPTION 'invalid_match_state';
  END IF;

  v_disputer_side  := ladder.get_match_participant_side(v_player_id, p_match_id);
  v_submitter_side := ladder.get_match_participant_side(v_submitted_by, p_match_id);

  IF v_submitter_side = v_disputer_side THEN
    RAISE EXCEPTION 'cannot_dispute_own_submission';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ladder.disputes
     WHERE match_id = p_match_id
       AND status   <> 'resolved'
  ) THEN
    RAISE EXCEPTION 'dispute_already_open';
  END IF;

  UPDATE ladder.matches
     SET status = 'disputed'
   WHERE id = p_match_id;

  INSERT INTO ladder.disputes (
    match_id, opened_by, reason, counter_score, status, auto_escalate_after
  ) VALUES (
    p_match_id, v_player_id, v_trimmed_reason, p_counter_score, 'open',
    now() + interval '24 hours'
  );
END;
$$;

REVOKE ALL ON FUNCTION ladder.open_match_dispute_secure(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.open_match_dispute_secure(text, uuid, text, jsonb)
  TO anon, authenticated;

-- ── 4. Restore resolve_dispute_for_organizer (no notification) ───────────

CREATE OR REPLACE FUNCTION ladder.resolve_dispute_for_organizer(
  p_match_id   uuid,
  p_resolution text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_league_id uuid;
  v_status    text;
BEGIN
  SELECT league_id, status
    INTO v_league_id, v_status
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  PERFORM ladder.assert_league_organizer(v_league_id);

  IF v_status NOT IN ('disputed', 'awaiting_confirmation') THEN
    RAISE EXCEPTION 'match_not_resolvable';
  END IF;

  UPDATE ladder.matches
     SET status       = 'confirmed',
         confirmed_by = NULL,
         confirmed_at = now()
   WHERE id = p_match_id;

  UPDATE ladder.disputes
     SET status      = 'resolved',
         resolution  = p_resolution,
         resolved_by = NULL,
         resolved_at = now()
   WHERE match_id = p_match_id
     AND status   <> 'resolved';
END;
$$;

REVOKE ALL ON FUNCTION ladder.resolve_dispute_for_organizer(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.resolve_dispute_for_organizer(uuid, text)
  TO authenticated;

-- ── 5. Drop new RPCs (in reverse dependency order) ───────────────────────

DROP FUNCTION IF EXISTS ladder.mark_my_notifications_read(text, uuid[]);
DROP FUNCTION IF EXISTS ladder.fetch_my_notifications(text);
DROP FUNCTION IF EXISTS ladder.respond_to_challenge_secure(text, uuid, boolean);
DROP FUNCTION IF EXISTS ladder.create_challenge_for_organizer(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS ladder.create_challenge_secure(text, uuid, uuid);
DROP FUNCTION IF EXISTS ladder.validate_challenge_rules_internal(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS ladder.list_my_leagues();
DROP FUNCTION IF EXISTS ladder.create_notification_internal(uuid, uuid, text, text, uuid, uuid);

COMMIT;
