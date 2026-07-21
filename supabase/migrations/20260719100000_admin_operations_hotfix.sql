-- ══════════════════════════════════════════════════════════════════
-- ADMIN OPERATIONS HOTFIX
-- File: supabase/migrations/20260719100000_admin_operations_hotfix.sql
--
-- Adds two organizer-only RPCs:
--
--   record_match_result_for_organizer — organizer records an official
--     confirmed result without requiring a player session token.
--     Bypasses the submit → confirm two-step flow.
--
--   delete_league_for_organizer — permanently deletes a league and all
--     child rows (via CASCADE) after verifying ownership and requiring
--     the organizer to type the exact league name as confirmation.
--
-- Prerequisites: 20260718120000_core_saas_additive.sql must be applied.
--
-- Rollback: supabase/rollback/20260719100000_admin_operations_hotfix_rollback.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ── C-1. record_match_result_for_organizer ───────────────────────────────────
--
-- Uses auth.uid() — no browser-supplied user ID.
--
-- Errors raised:
--   match_not_found      — p_match_id does not exist
--   not_authenticated    — caller has no JWT (via assert_league_organizer)
--   not_league_organizer — caller does not own the match's league
--   bye_match            — bye matches cannot have a result recorded
--   match_already_final  — match status is already 'confirmed' or 'skipped'
--   invalid_result       — result JSONB fails validate_match_result_payload

CREATE OR REPLACE FUNCTION ladder.record_match_result_for_organizer(
  p_match_id uuid,
  p_result   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_league_id  uuid;
  v_status     text;
  v_is_bye     boolean;
  v_p1_player  uuid;
  v_p2_player  uuid;
  v_p1_team    uuid;
  v_p2_team    uuid;
  v_member     record;
BEGIN
  SELECT league_id, status, is_bye,
         p1_player_id, p2_player_id,
         p1_team_id,   p2_team_id
    INTO v_league_id, v_status, v_is_bye,
         v_p1_player, v_p2_player,
         v_p1_team,   v_p2_team
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  PERFORM ladder.assert_league_organizer(v_league_id);

  IF v_is_bye THEN
    RAISE EXCEPTION 'bye_match';
  END IF;

  IF v_status IN ('confirmed', 'skipped') THEN
    RAISE EXCEPTION 'match_already_final';
  END IF;

  PERFORM ladder.validate_match_result_payload(p_match_id, p_result);

  UPDATE ladder.matches
     SET status        = 'confirmed',
         result        = p_result,
         submitted_by  = NULL,
         submitted_at  = now(),
         confirmed_by  = NULL,
         confirmed_at  = now()
   WHERE id = p_match_id;

  IF v_p1_player IS NOT NULL OR v_p2_player IS NOT NULL THEN
    IF v_p1_player IS NOT NULL THEN
      PERFORM ladder.create_notification_internal(
        v_p1_player, v_league_id, 'score_confirmed',
        'The organizer has recorded the official result for your match.',
        p_match_id, NULL
      );
    END IF;
    IF v_p2_player IS NOT NULL THEN
      PERFORM ladder.create_notification_internal(
        v_p2_player, v_league_id, 'score_confirmed',
        'The organizer has recorded the official result for your match.',
        p_match_id, NULL
      );
    END IF;
  ELSE
    FOR v_member IN
      SELECT tm.player_id
        FROM ladder.team_members tm
       WHERE tm.team_id IN (v_p1_team, v_p2_team)
    LOOP
      PERFORM ladder.create_notification_internal(
        v_member.player_id, v_league_id, 'score_confirmed',
        'The organizer has recorded the official result for your match.',
        p_match_id, NULL
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.record_match_result_for_organizer(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.record_match_result_for_organizer(uuid, jsonb)
  TO authenticated;

-- ── C-2. delete_league_for_organizer ────────────────────────────────────────
--
-- Uses auth.uid() — no browser-supplied user ID.
-- ON DELETE CASCADE on all child tables propagates the delete automatically.
--
-- Errors raised:
--   not_authenticated    — caller has no JWT (via assert_league_organizer)
--   not_league_organizer — caller does not own this league (or it doesn't exist)
--   confirmation_required — p_confirmation_name is blank or NULL
--   name_mismatch        — p_confirmation_name does not match the league name exactly

CREATE OR REPLACE FUNCTION ladder.delete_league_for_organizer(
  p_league_id         uuid,
  p_confirmation_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_league_name text;
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  SELECT name INTO v_league_name
    FROM ladder.leagues
   WHERE id = p_league_id;

  IF trim(p_confirmation_name) IS NULL OR trim(p_confirmation_name) = '' THEN
    RAISE EXCEPTION 'confirmation_required';
  END IF;

  IF trim(p_confirmation_name) <> v_league_name THEN
    RAISE EXCEPTION 'name_mismatch';
  END IF;

  DELETE FROM ladder.leagues WHERE id = p_league_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.delete_league_for_organizer(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.delete_league_for_organizer(uuid, text)
  TO authenticated;

COMMIT;
