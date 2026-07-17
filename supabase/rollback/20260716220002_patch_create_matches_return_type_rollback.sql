-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK: patch create_matches_for_organizer return-type fix
-- File: supabase/rollback/20260716220002_patch_create_matches_return_type_rollback.sql
--
-- Restores the pre-patch RETURNS TABLE (...) definition.
--
-- ⚠  WARNING: the restored definition contains error 42702 and will
--    fail at runtime for any league launch.  This rollback is only
--    useful when reverting to a known state before re-applying a
--    corrected patch.  After applying this rollback the frontend
--    create_matches_for_organizer call will fail with HTTP 400 until
--    a corrected patch is re-applied.
--
-- ⚠  FRONTEND DEPLOYMENT NOTE: If you are rolling back the entire
--    20260716220000 migration, you must simultaneously deploy the
--    prior frontend version — see the main rollback file.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- DROP required: the patch changed the return type from RETURNS TABLE
-- to RETURNS SETOF; reverting requires DROP + CREATE again.
DROP FUNCTION IF EXISTS ladder.create_matches_for_organizer(uuid, jsonb);

-- Restores the original (broken) RETURNS TABLE definition from
-- 20260716220000_secure_organizer_operations.sql as first applied.
CREATE FUNCTION ladder.create_matches_for_organizer(
  p_league_id uuid,
  p_matches   jsonb
)
RETURNS TABLE (
  id           uuid,
  league_id    uuid,
  round_number int,
  type         text,
  is_bye       boolean,
  p1_player_id uuid,
  p2_player_id uuid,
  p1_team_id   uuid,
  p2_team_id   uuid,
  status       text,
  result       jsonb,
  created_at   timestamptz
)
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

  -- BUG: league_id and type are ambiguous here (42702 at runtime).
  IF EXISTS (
    SELECT 1 FROM ladder.matches
    WHERE  league_id = p_league_id
      AND  type = 'scheduled'
  ) THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = 'This league already has a scheduled match set.';
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
      -- BUG: id and league_id are ambiguous here (42702 at runtime).
      IF NOT EXISTS (
        SELECT 1 FROM ladder.teams WHERE id = v_p1_team AND league_id = p_league_id
      ) THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p1_team_id does not belong to this league.';
      END IF;
      IF NOT v_is_bye AND NOT EXISTS (
        SELECT 1 FROM ladder.teams WHERE id = v_p2_team AND league_id = p_league_id
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
      -- BUG: id and league_id are ambiguous here (42702 at runtime).
      IF NOT EXISTS (
        SELECT 1 FROM ladder.players WHERE id = v_p1_player AND league_id = p_league_id
      ) THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p1_player_id does not belong to this league.';
      END IF;
      IF NOT v_is_bye AND NOT EXISTS (
        SELECT 1 FROM ladder.players WHERE id = v_p2_player AND league_id = p_league_id
      ) THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p2_player_id does not belong to this league.';
      END IF;
    END IF;
  END LOOP;

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
  RETURNING
    matches.id, matches.league_id, matches.round_number, matches.type,
    matches.is_bye, matches.p1_player_id, matches.p2_player_id,
    matches.p1_team_id, matches.p2_team_id, matches.status,
    matches.result, matches.created_at;
END;
$$;

REVOKE ALL ON FUNCTION ladder.create_matches_for_organizer(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_matches_for_organizer(uuid, jsonb)
  TO authenticated;

COMMIT;
