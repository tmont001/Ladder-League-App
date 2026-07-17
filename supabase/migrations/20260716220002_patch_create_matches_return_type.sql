-- ══════════════════════════════════════════════════════════════════
-- PATCH: fix create_matches_for_organizer return-type ambiguity (42702)
-- File: supabase/migrations/20260716220002_patch_create_matches_return_type.sql
--
-- Apply to any database where
-- 20260716220000_secure_organizer_operations.sql has already been
-- executed.  Fresh installations get the corrected definition from
-- the updated 20260716220000 file and do not need this patch.
--
-- Root cause:
--   RETURNS TABLE declared output parameters named league_id, type,
--   status, id, created_at — identical to column names in ladder.matches.
--   PL/pgSQL raised error 42702 "column reference is ambiguous" at
--   runtime for every unqualified reference to those names inside
--   WHERE clauses (e.g. WHERE league_id = p_league_id AND type =
--   'scheduled').  The bug was detected during league launch (HTTP 400).
--
-- Fix:
--   Replace RETURNS TABLE (...) with RETURNS SETOF ladder.matches.
--   This eliminates all OUT parameter names, resolving every ambiguity.
--   RETURNING * fills the row type naturally.
--   Table aliases (m / t / p) are added throughout WHERE clauses as an
--   additional layer of clarity, matching the corrected original file.
--
-- Deployment note:
--   Changing the return type requires DROP FUNCTION + CREATE FUNCTION
--   because PostgreSQL rejects CREATE OR REPLACE for a different return
--   type.  Both statements are wrapped in a single transaction so the
--   function is never absent to concurrent callers.  The EXECUTE grant
--   must be re-applied after the DROP; this migration does so.
--
-- Frontend impact: none.  RETURNS SETOF ladder.matches and the
--   previous RETURNS TABLE both produce an array of objects with the
--   same column names in the Supabase JS response.  db.js and App.js
--   require no changes.
--
-- Rollback: apply 20260716220002_patch_create_matches_return_type_rollback.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- DROP required: PostgreSQL cannot change a function's return type via
-- CREATE OR REPLACE.  Transaction atomicity means no gap is visible to
-- concurrent callers.
DROP FUNCTION IF EXISTS ladder.create_matches_for_organizer(uuid, jsonb);

CREATE FUNCTION ladder.create_matches_for_organizer(
  p_league_id uuid,
  p_matches   jsonb
)
RETURNS SETOF ladder.matches
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_mode         text;
  v_is_doubles   boolean;
  v_elem         jsonb;
  v_round_number int;
  v_type         text;
  v_is_bye       boolean;
  v_p1_player    uuid;
  v_p2_player    uuid;
  v_p1_team      uuid;
  v_p2_team      uuid;
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  IF jsonb_typeof(p_matches) <> 'array' OR jsonb_array_length(p_matches) = 0 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'p_matches must be a nonempty JSON array.';
  END IF;

  -- Alias 'm' ensures league_id and type are unambiguously table columns,
  -- not OUT parameters (which no longer exist with RETURNS SETOF).
  IF EXISTS (
    SELECT 1 FROM ladder.matches m
    WHERE  m.league_id = p_league_id
      AND  m.type = 'scheduled'
  ) THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = 'This league already has a scheduled match set. '
                   'create_matches_for_organizer is for initial schedule creation only.';
  END IF;

  SELECT singles_or_doubles INTO v_mode
  FROM   ladder.leagues
  WHERE  id = p_league_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input' USING HINT = 'League not found.';
  END IF;

  v_is_doubles := (v_mode = 'doubles');

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_matches)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object' THEN
      RAISE EXCEPTION 'invalid_input'
        USING HINT = 'Each element of p_matches must be a JSON object.';
    END IF;

    v_round_number := (v_elem->>'round_number')::int;
    IF v_round_number IS NULL OR v_round_number < 1 THEN
      RAISE EXCEPTION 'invalid_input'
        USING HINT = 'round_number must be a positive integer (≥ 1).';
    END IF;

    v_type := v_elem->>'type';
    IF COALESCE(v_type, '') <> 'scheduled' THEN
      RAISE EXCEPTION 'invalid_input'
        USING HINT = 'Initial schedule matches must have type = ''scheduled''.';
    END IF;

    v_is_bye    := COALESCE((v_elem->>'is_bye')::boolean, false);
    v_p1_player := (v_elem->>'p1_player_id')::uuid;
    v_p2_player := (v_elem->>'p2_player_id')::uuid;
    v_p1_team   := (v_elem->>'p1_team_id')::uuid;
    v_p2_team   := (v_elem->>'p2_team_id')::uuid;

    IF v_is_doubles THEN
      IF v_p1_player IS NOT NULL OR v_p2_player IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'Doubles matches must not include player IDs.';
      END IF;
      IF v_p1_team IS NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p1_team_id is required for doubles matches.';
      END IF;
      IF NOT v_is_bye THEN
        IF v_p2_team IS NULL THEN
          RAISE EXCEPTION 'invalid_input'
            USING HINT = 'p2_team_id is required for non-bye doubles matches.';
        END IF;
        IF v_p1_team = v_p2_team THEN
          RAISE EXCEPTION 'invalid_input'
            USING HINT = 'p1_team_id and p2_team_id must be different.';
        END IF;
      END IF;
      IF v_is_bye AND v_p2_team IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'Bye rows must not supply a second participant (p2_team_id must be null).';
      END IF;
      -- Aliases t/p prevent 42702 for id and league_id column references.
      IF NOT EXISTS (
        SELECT 1 FROM ladder.teams t WHERE t.id = v_p1_team AND t.league_id = p_league_id
      ) THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p1_team_id does not belong to this league.';
      END IF;
      IF NOT v_is_bye AND NOT EXISTS (
        SELECT 1 FROM ladder.teams t WHERE t.id = v_p2_team AND t.league_id = p_league_id
      ) THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p2_team_id does not belong to this league.';
      END IF;

    ELSE
      IF v_p1_team IS NOT NULL OR v_p2_team IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'Singles matches must not include team IDs.';
      END IF;
      IF v_p1_player IS NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p1_player_id is required for singles matches.';
      END IF;
      IF NOT v_is_bye THEN
        IF v_p2_player IS NULL THEN
          RAISE EXCEPTION 'invalid_input'
            USING HINT = 'p2_player_id is required for non-bye singles matches.';
        END IF;
        IF v_p1_player = v_p2_player THEN
          RAISE EXCEPTION 'invalid_input'
            USING HINT = 'p1_player_id and p2_player_id must be different.';
        END IF;
      END IF;
      IF v_is_bye AND v_p2_player IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'Bye rows must not supply a second participant (p2_player_id must be null).';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM ladder.players p WHERE p.id = v_p1_player AND p.league_id = p_league_id
      ) THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p1_player_id does not belong to this league.';
      END IF;
      IF NOT v_is_bye AND NOT EXISTS (
        SELECT 1 FROM ladder.players p WHERE p.id = v_p2_player AND p.league_id = p_league_id
      ) THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p2_player_id does not belong to this league.';
      END IF;
    END IF;
  END LOOP;

  -- RETURNING * is safe: RETURNS SETOF ladder.matches expects all columns.
  RETURN QUERY
  INSERT INTO ladder.matches (
    league_id, round_number, type, is_bye,
    p1_player_id, p2_player_id, p1_team_id, p2_team_id,
    status, result
  )
  SELECT
    p_league_id,
    (elem->>'round_number')::int,
    'scheduled',
    COALESCE((elem->>'is_bye')::boolean, false),
    (elem->>'p1_player_id')::uuid,
    (elem->>'p2_player_id')::uuid,
    (elem->>'p1_team_id')::uuid,
    (elem->>'p2_team_id')::uuid,
    'pending',
    NULL::jsonb
  FROM jsonb_array_elements(p_matches) AS elem
  RETURNING *;
END;
$$;

-- Re-apply grant after DROP (DROP removed the previous grant).
REVOKE ALL ON FUNCTION ladder.create_matches_for_organizer(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_matches_for_organizer(uuid, jsonb)
  TO authenticated;

COMMIT;
