-- ─────────────────────────────────────────────────────────────────────────────
-- Migration : 20260717140000_secure_player_match_lifecycle
-- Purpose   : Additive — add secure player RPCs for match result submission,
--             confirmation, and dispute, plus an organizer dispute-resolution
--             RPC.  No existing grants or table definitions are altered here.
-- Depends on: 20260716220000_secure_organizer_operations.sql
--               (assert_league_organizer helper must exist)
-- Rollback  : supabase/rollback/20260717140000_secure_player_match_lifecycle_rollback.sql
-- DO NOT RUN the consolidated lock-down migration until these RPCs are
-- verified end-to-end in the live environment.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- INTERNAL HELPER: validate_match_result_payload
-- Validates the result JSONB shape and checks format-consistency rules
-- against the league settings stored in the DB.
-- SECURITY DEFINER so it can JOIN ladder.leagues (which requires no special
-- privilege in practice, but DEFINER keeps the security boundary consistent
-- with the other helpers it is called from).
-- No browser EXECUTE grant — internal use only.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.validate_match_result_payload(
  p_match_id uuid,
  p_result   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p1_id           text;
  v_p2_id           text;
  v_format          text;
  v_winner_id       text;
  v_p1_sets         int;
  v_p2_sets         int;
  v_p1_games        int;
  v_p2_games        int;
  v_set_scores      jsonb;
  v_num_sets        int;
  v_sets_needed     int;
  v_entry           jsonb;
  v_sp1             int;
  v_sp2             int;
  v_calc_p1_sets    int := 0;
  v_calc_p2_sets    int := 0;
  v_calc_p1_games   int := 0;
  v_calc_p2_games   int := 0;
  v_i               int;
BEGIN
  -- Must be a non-null JSON object (not array, scalar, or null literal)
  IF p_result IS NULL OR jsonb_typeof(p_result) <> 'object' THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  v_winner_id  := p_result->>'winnerId';
  v_set_scores := p_result->'setScores';

  IF v_winner_id IS NULL THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  IF v_set_scores IS NULL OR jsonb_typeof(v_set_scores) <> 'array' THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  v_num_sets := jsonb_array_length(v_set_scores);
  IF v_num_sets = 0 THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  -- p1Sets / p2Sets must be JSON integers (missing key, null, string, bool,
  -- array, object, and non-integer float are all rejected)
  IF jsonb_typeof(p_result->'p1Sets') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_result->'p2Sets') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  IF mod((p_result->>'p1Sets')::numeric, 1) <> 0
  OR mod((p_result->>'p2Sets')::numeric, 1) <> 0 THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  v_p1_sets := (p_result->>'p1Sets')::int;
  v_p2_sets := (p_result->>'p2Sets')::int;

  IF v_p1_sets < 0 OR v_p2_sets < 0 THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  -- A match must have a winner; ties are not allowed
  IF v_p1_sets = v_p2_sets THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  -- p1Games / p2Games must be JSON integers (same null-safety as above)
  IF jsonb_typeof(p_result->'p1Games') IS DISTINCT FROM 'number'
  OR jsonb_typeof(p_result->'p2Games') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;
  IF mod((p_result->>'p1Games')::numeric, 1) <> 0
  OR mod((p_result->>'p2Games')::numeric, 1) <> 0 THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  v_p1_games := (p_result->>'p1Games')::int;
  v_p2_games := (p_result->>'p2Games')::int;

  IF v_p1_games < 0 OR v_p2_games < 0 THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  -- Validate each setScore entry; accumulate set wins and game totals
  FOR v_i IN 0 .. v_num_sets - 1 LOOP
    v_entry := v_set_scores->v_i;

    IF v_entry IS NULL OR jsonb_typeof(v_entry) <> 'object' THEN
      RAISE EXCEPTION 'invalid_result';
    END IF;

    IF jsonb_typeof(v_entry->'p1') IS DISTINCT FROM 'number'
    OR jsonb_typeof(v_entry->'p2') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'invalid_result';
    END IF;
    IF mod((v_entry->>'p1')::numeric, 1) <> 0
    OR mod((v_entry->>'p2')::numeric, 1) <> 0 THEN
      RAISE EXCEPTION 'invalid_result';
    END IF;

    v_sp1 := (v_entry->>'p1')::int;
    v_sp2 := (v_entry->>'p2')::int;

    IF v_sp1 < 0 OR v_sp2 < 0 THEN
      RAISE EXCEPTION 'invalid_result';
    END IF;

    -- A set cannot end in a draw
    IF v_sp1 = v_sp2 THEN
      RAISE EXCEPTION 'invalid_result';
    END IF;

    IF v_sp1 > v_sp2 THEN
      v_calc_p1_sets  := v_calc_p1_sets  + 1;
    ELSE
      v_calc_p2_sets  := v_calc_p2_sets  + 1;
    END IF;

    v_calc_p1_games := v_calc_p1_games + v_sp1;
    v_calc_p2_games := v_calc_p2_games + v_sp2;
  END LOOP;

  -- Declared set counts must agree with the setScores array
  IF v_calc_p1_sets <> v_p1_sets OR v_calc_p2_sets <> v_p2_sets THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  -- Declared game totals must agree with the setScores sums
  IF v_calc_p1_games <> v_p1_games OR v_calc_p2_games <> v_p2_games THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  -- Fetch match participant IDs and league format
  -- Singles: use p1_player_id / p2_player_id; doubles: p1_team_id / p2_team_id
  SELECT
    COALESCE(m.p1_player_id::text, m.p1_team_id::text),
    COALESCE(m.p2_player_id::text, m.p2_team_id::text),
    l.format
  INTO v_p1_id, v_p2_id, v_format
  FROM ladder.matches  m
  JOIN ladder.leagues  l ON l.id = m.league_id
  WHERE m.id = p_match_id;

  -- winnerId must identify p1 or p2
  IF v_winner_id <> v_p1_id AND v_winner_id <> v_p2_id THEN
    RAISE EXCEPTION 'invalid_winner';
  END IF;

  -- Reject unsupported or null league format — no silent default
  IF v_format IS NULL OR v_format NOT IN ('best_of_1', 'best_of_3', 'best_of_5') THEN
    RAISE EXCEPTION 'invalid_result';
  END IF;

  v_sets_needed := CASE v_format
    WHEN 'best_of_1' THEN 1
    WHEN 'best_of_3' THEN 2
    WHEN 'best_of_5' THEN 3
  END;

  -- Winner must have exactly sets_needed sets; loser must have strictly fewer.
  -- This rejects e.g. best_of_3 ending 3–2, 3–1, or any result where neither
  -- side has exactly the required winning set count.
  IF v_winner_id = v_p1_id THEN
    IF v_p1_sets <> v_sets_needed OR v_p2_sets >= v_sets_needed THEN
      RAISE EXCEPTION 'invalid_result';
    END IF;
  ELSE
    IF v_p2_sets <> v_sets_needed OR v_p1_sets >= v_sets_needed THEN
      RAISE EXCEPTION 'invalid_result';
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.validate_match_result_payload(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- INTERNAL HELPER: resolve_player_from_token
-- Validates a player session token and returns the player UUID.
-- SECURITY DEFINER is required because the session_token column is excluded
-- from the column-level grants on ladder.players for anon / authenticated.
-- No browser EXECUTE grant — internal use only.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.resolve_player_from_token(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id uuid;
  v_status    text;
BEGIN
  -- Reject NULL, empty, or whitespace-only tokens before hitting the table
  IF p_token IS NULL OR trim(p_token) = '' THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  SELECT id, status
    INTO v_player_id, v_status
    FROM ladder.players
   WHERE session_token = p_token;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'player_inactive';
  END IF;

  RETURN v_player_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.resolve_player_from_token(text)
  FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- INTERNAL HELPER: get_match_participant_side
-- Returns 1 if the player is on side p1, 2 if on side p2.
-- Handles both singles (direct player_id) and doubles (team_members join).
-- Cross-league replay guard: verifies the player belongs to the match league.
-- SECURITY DEFINER for consistent security context with the calling RPCs.
-- No browser EXECUTE grant — internal use only.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.get_match_participant_side(
  p_player_id uuid,
  p_match_id  uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_p1_player uuid;
  v_p2_player uuid;
  v_p1_team   uuid;
  v_p2_team   uuid;
  v_league_id uuid;
BEGIN
  SELECT p1_player_id, p2_player_id, p1_team_id, p2_team_id, league_id
    INTO v_p1_player, v_p2_player, v_p1_team, v_p2_team, v_league_id
    FROM ladder.matches
   WHERE id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  -- Cross-league replay guard: player must belong to the match's league
  IF NOT EXISTS (
    SELECT 1 FROM ladder.players
     WHERE id = p_player_id AND league_id = v_league_id
  ) THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  -- Singles: direct player UUID match
  IF v_p1_player IS NOT NULL THEN
    IF v_p1_player = p_player_id THEN RETURN 1; END IF;
    IF v_p2_player = p_player_id THEN RETURN 2; END IF;
  END IF;

  -- Doubles: check team membership
  IF v_p1_team IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM ladder.team_members
       WHERE team_id = v_p1_team AND player_id = p_player_id
    ) THEN
      RETURN 1;
    END IF;
    IF EXISTS (
      SELECT 1 FROM ladder.team_members
       WHERE team_id = v_p2_team AND player_id = p_player_id
    ) THEN
      RETURN 2;
    END IF;
  END IF;

  RAISE EXCEPTION 'not_participant';
END;
$$;

REVOKE ALL ON FUNCTION ladder.get_match_participant_side(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PLAYER RPC: submit_match_result_secure
-- Authenticated via player session token.
-- Validates token → locks match row → checks status/bye → checks participant
-- → validates result payload → updates match.
-- FOR UPDATE prevents concurrent double-submission.
-- ═════════════════════════════════════════════════════════════════════════════

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

  -- Lock the row to prevent concurrent submissions on the same match
  SELECT status, is_bye
    INTO v_status, v_is_bye
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_is_bye THEN
    RAISE EXCEPTION 'bye_match';
  END IF;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'match_not_pending';
  END IF;

  -- Verify the caller is a participant in this match
  PERFORM ladder.get_match_participant_side(v_player_id, p_match_id);

  -- Comprehensive result validation (shape, consistency, format rules)
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
GRANT  EXECUTE ON FUNCTION ladder.submit_match_result_secure(text, uuid, jsonb)
  TO anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PLAYER RPC: confirm_match_result_secure
-- Authenticated via player session token.
-- Enforces: status=awaiting_confirmation, caller is a participant, caller is
-- NOT on the same side as the submitter (the opposing side must confirm).
-- Same-side errors from the helper propagate — they are not caught or muted.
-- ═════════════════════════════════════════════════════════════════════════════

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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_status <> 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'match_not_awaiting_confirmation';
  END IF;

  -- An awaiting_confirmation match must have a submitter on record
  IF v_submitted_by IS NULL THEN
    RAISE EXCEPTION 'invalid_match_state';
  END IF;

  -- Caller must be a participant; propagate helper errors
  v_confirmer_side := ladder.get_match_participant_side(v_player_id, p_match_id);

  -- Same-side check: always enforced (submitted_by guaranteed non-null above)
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
GRANT  EXECUTE ON FUNCTION ladder.confirm_match_result_secure(text, uuid)
  TO anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- PLAYER RPC: open_match_dispute_secure
-- Authenticated via player session token.
-- Enforces: status=awaiting_confirmation, caller is on the opposing side of
-- the submitter, no existing unresolved dispute, trimmed non-empty reason
-- ≤ 1000 chars.  Atomically updates match status and inserts the dispute row.
-- ═════════════════════════════════════════════════════════════════════════════

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
  v_player_id := ladder.resolve_player_from_token(p_token);

  -- Trim reason early so length enforcement applies to the stored value
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;

  IF v_status <> 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'match_not_awaiting_confirmation';
  END IF;

  -- An awaiting_confirmation match must have a submitter on record
  IF v_submitted_by IS NULL THEN
    RAISE EXCEPTION 'invalid_match_state';
  END IF;

  -- Caller must be a participant; propagate helper errors
  v_disputer_side := ladder.get_match_participant_side(v_player_id, p_match_id);

  -- Same-side check: always enforced (submitted_by guaranteed non-null above)
  v_submitter_side := ladder.get_match_participant_side(v_submitted_by, p_match_id);
  IF v_submitter_side = v_disputer_side THEN
    RAISE EXCEPTION 'cannot_dispute_own_submission';
  END IF;

  -- Guard against duplicate unresolved disputes
  IF EXISTS (
    SELECT 1 FROM ladder.disputes
     WHERE match_id = p_match_id
       AND status   <> 'resolved'
  ) THEN
    RAISE EXCEPTION 'dispute_already_open';
  END IF;

  -- Atomic: update match + insert dispute row in this transaction
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
GRANT  EXECUTE ON FUNCTION ladder.open_match_dispute_secure(text, uuid, text, jsonb)
  TO anon, authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- ORGANIZER RPC: resolve_dispute_for_organizer
-- Authenticated via Supabase Auth JWT.
-- Uses the existing assert_league_organizer helper (deployed in
-- 20260716220000_secure_organizer_operations.sql) which verifies
-- auth.uid() against ladder.league_organizers.user_id.
-- Accepts matches in 'disputed' OR 'awaiting_confirmation' status so the
-- organizer can override both disputed and stuck-awaiting matches.
-- Sets confirmed_by = NULL because the organizer is not a ladder player.
-- Resolves any unresolved dispute record atomically.
-- disputes.resolved_by is left NULL for the same reason.
-- ═════════════════════════════════════════════════════════════════════════════

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

  -- Raises 'not_authenticated' or 'not_league_organizer' if checks fail
  PERFORM ladder.assert_league_organizer(v_league_id);

  IF v_status NOT IN ('disputed', 'awaiting_confirmation') THEN
    RAISE EXCEPTION 'match_not_resolvable';
  END IF;

  -- confirmed_by stays NULL: organizer has no row in ladder.players
  UPDATE ladder.matches
     SET status       = 'confirmed',
         confirmed_by = NULL,
         confirmed_at = now()
   WHERE id = p_match_id;

  -- Resolve any unresolved dispute row
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
GRANT  EXECUTE ON FUNCTION ladder.resolve_dispute_for_organizer(uuid, text)
  TO authenticated;

COMMIT;
