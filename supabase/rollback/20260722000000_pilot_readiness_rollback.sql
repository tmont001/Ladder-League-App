-- ══════════════════════════════════════════════════════════════════
-- PILOT READINESS — ROLLBACK
-- File: supabase/rollback/20260722000000_pilot_readiness_rollback.sql
--
-- Reverses 20260722000000_pilot_readiness_additive.sql in reverse order:
--
--   G-11–14. Restore 4 organizer-mutation RPCs to their pre-patch bodies
--      (remove assert_league_active calls):
--      add_player_for_organizer, add_team_with_members_for_organizer,
--      create_matches_for_organizer, seed_rankings_for_organizer.
--
--   G. Restore 10 competition-mutating RPCs to their pre-patch bodies
--      (remove assert_league_active calls).
--
--   F. Drop lifecycle RPCs created by the additive migration:
--      end_league_for_organizer, archive_league_for_organizer,
--      restore_league_for_organizer, duplicate_league_for_organizer.
--
--   D. Drop create_league_atomic (jsonb return) and restore the original
--      version that returns uuid.
--
--   B-2+C+B-1. Drop validate_league_payload, create_league_core_internal,
--      and assert_league_active.
--
--   B. Restore list_my_leagues to its pre-pilot-readiness signature
--      (no status / ended_at / archived_at columns).
--
--   A. Drop lifecycle columns (status, ended_at, archived_at).
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════
-- G-11–14. Restore 4 organizer-mutation RPCs (remove assert_league_active)
-- ═════════════════════════════════════════════════════════════════

-- G-11. add_player_for_organizer — restore to pre-patch body (no assert_league_active)
CREATE OR REPLACE FUNCTION ladder.add_player_for_organizer(
  p_league_id   uuid,
  p_name        text,
  p_rating      text    DEFAULT NULL,
  p_rating_type text    DEFAULT NULL,
  p_utr_url     text    DEFAULT NULL,
  p_role        text    DEFAULT 'player'
)
RETURNS uuid
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_id uuid;
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'Player name must not be empty.';
  END IF;

  IF p_role NOT IN ('player', 'admin') THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'role must be ''player'' or ''admin''.';
  END IF;

  IF p_rating_type IS NOT NULL AND p_rating_type NOT IN ('USTA', 'UTR') THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'rating_type must be ''USTA'', ''UTR'', or NULL.';
  END IF;

  INSERT INTO ladder.players (league_id, name, rating, rating_type, utr_url, role)
  VALUES (
    p_league_id,
    btrim(p_name),
    NULLIF(btrim(COALESCE(p_rating, '')), ''),
    p_rating_type,
    NULLIF(btrim(COALESCE(p_utr_url, '')), ''),
    p_role
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.add_player_for_organizer(uuid, text, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.add_player_for_organizer(uuid, text, text, text, text, text)
  TO authenticated;

-- G-12. add_team_with_members_for_organizer — restore to pre-patch body
CREATE OR REPLACE FUNCTION ladder.add_team_with_members_for_organizer(
  p_league_id  uuid,
  p_player_ids uuid[]
)
RETURNS uuid
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_team_id uuid;
  v_count   int;
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  IF array_length(p_player_ids, 1) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'Doubles teams must have exactly 2 members.';
  END IF;

  IF p_player_ids[1] = p_player_ids[2] THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'A player cannot appear twice on the same team.';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM   ladder.players
  WHERE  id = ANY(p_player_ids)
    AND  league_id = p_league_id;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'One or more player IDs do not belong to this league.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM   ladder.team_members tm
    JOIN   ladder.teams t ON t.id = tm.team_id
    WHERE  tm.player_id = ANY(p_player_ids)
      AND  t.league_id = p_league_id
  ) THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'One or more players are already assigned to a team in this league.';
  END IF;

  INSERT INTO ladder.teams (league_id)
  VALUES (p_league_id)
  RETURNING id INTO v_team_id;

  INSERT INTO ladder.team_members (team_id, player_id)
  SELECT v_team_id, unnest(p_player_ids);

  RETURN v_team_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.add_team_with_members_for_organizer(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.add_team_with_members_for_organizer(uuid, uuid[])
  TO authenticated;

-- G-13. create_matches_for_organizer — restore to pre-patch body
CREATE OR REPLACE FUNCTION ladder.create_matches_for_organizer(
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

  IF EXISTS (
    SELECT 1 FROM ladder.matches m
    WHERE  m.league_id = p_league_id
      AND  m.type = 'scheduled'
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
        USING HINT = 'round_number must be a positive integer (>= 1).';
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

REVOKE ALL ON FUNCTION ladder.create_matches_for_organizer(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_matches_for_organizer(uuid, jsonb)
  TO authenticated;

-- G-14. seed_rankings_for_organizer — restore to pre-patch body
CREATE OR REPLACE FUNCTION ladder.seed_rankings_for_organizer(
  p_league_id    uuid,
  p_participants jsonb
)
RETURNS void
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_mode           text;
  v_is_doubles     boolean;
  v_elem           jsonb;
  v_participant_id uuid;
  v_seen           uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  IF jsonb_typeof(p_participants) <> 'array' OR jsonb_array_length(p_participants) = 0 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'p_participants must be a nonempty JSON array.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ladder.rankings WHERE league_id = p_league_id
  ) THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = 'Rankings already exist for this league.';
  END IF;

  SELECT singles_or_doubles INTO v_mode
  FROM   ladder.leagues
  WHERE  id = p_league_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input' USING HINT = 'League not found.';
  END IF;

  v_is_doubles := (v_mode = 'doubles');

  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_participants)
  LOOP
    v_participant_id := (v_elem->>'id')::uuid;

    IF v_participant_id IS NULL THEN
      RAISE EXCEPTION 'invalid_input'
        USING HINT = 'Each participant must have a non-null ''id'' field.';
    END IF;

    IF v_participant_id = ANY(v_seen) THEN
      RAISE EXCEPTION 'invalid_input'
        USING HINT = 'Duplicate participant ID in p_participants.';
    END IF;
    v_seen := array_append(v_seen, v_participant_id);

    IF v_is_doubles THEN
      IF NOT EXISTS (
        SELECT 1 FROM ladder.teams
        WHERE id = v_participant_id AND league_id = p_league_id
      ) THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'Team does not belong to this league.';
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM ladder.players
        WHERE id = v_participant_id AND league_id = p_league_id
      ) THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'Player does not belong to this league.';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO ladder.rankings (league_id, player_id, team_id, rank)
  SELECT
    p_league_id,
    CASE WHEN NOT v_is_doubles THEN (t.elem->>'id')::uuid ELSE NULL END,
    CASE WHEN     v_is_doubles THEN (t.elem->>'id')::uuid ELSE NULL END,
    t.rn::int
  FROM jsonb_array_elements(p_participants) WITH ORDINALITY AS t(elem, rn);

  INSERT INTO ladder.rank_history (league_id, player_id, team_id, rank, previous_rank, reason)
  SELECT
    p_league_id,
    CASE WHEN NOT v_is_doubles THEN (t.elem->>'id')::uuid ELSE NULL END,
    CASE WHEN     v_is_doubles THEN (t.elem->>'id')::uuid ELSE NULL END,
    t.rn::int,
    NULL,
    'initial_seeding'
  FROM jsonb_array_elements(p_participants) WITH ORDINALITY AS t(elem, rn);
END;
$$;

REVOKE ALL ON FUNCTION ladder.seed_rankings_for_organizer(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.seed_rankings_for_organizer(uuid, jsonb)
  TO authenticated;

-- ═════════════════════════════════════════════════════════════════
-- G. Restore 10 competition-mutating RPCs (no assert_league_active)
-- ═════════════════════════════════════════════════════════════════

-- G-1. update_league_settings_secure
CREATE OR REPLACE FUNCTION ladder.update_league_settings_secure(
  p_league_id        uuid,
  p_name             text,
  p_format           text,
  p_third_set_format text,
  p_challenge_spots  int,
  p_auto_advance     boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'League name must not be empty.';
  END IF;

  IF p_format IS NULL OR btrim(p_format) = '' THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'format must not be empty.';
  END IF;

  IF p_format NOT IN ('best_of_1', 'best_of_3', 'best_of_5') THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'format must be ''best_of_1'', ''best_of_3'', or ''best_of_5''.';
  END IF;

  IF p_third_set_format IS NULL OR btrim(p_third_set_format) = '' THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'third_set_format must not be empty.';
  END IF;

  IF p_third_set_format NOT IN ('full_set', 'super_tiebreak', 'match_tiebreak') THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'third_set_format must be ''full_set'', ''super_tiebreak'', or ''match_tiebreak''.';
  END IF;

  IF p_challenge_spots IS NULL OR p_challenge_spots < 1 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'challenge_spots must be at least 1.';
  END IF;

  IF p_auto_advance IS NULL THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'auto_advance must not be null.';
  END IF;

  UPDATE ladder.leagues
  SET
    name             = btrim(p_name),
    format           = p_format,
    third_set_format = p_third_set_format,
    challenge_spots  = p_challenge_spots,
    auto_advance     = p_auto_advance
  WHERE id = p_league_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.update_league_settings_secure(uuid, text, text, text, int, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.update_league_settings_secure(uuid, text, text, text, int, boolean)
  TO authenticated;

-- G-2. skip_match_secure
CREATE OR REPLACE FUNCTION ladder.skip_match_secure(p_match_id uuid)
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
  INTO   v_league_id, v_status
  FROM   ladder.matches
  WHERE  id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found'
      USING HINT = 'Match not found.';
  END IF;

  PERFORM ladder.assert_league_organizer(v_league_id);

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = 'Only pending matches can be skipped. Current status: ' || v_status;
  END IF;

  UPDATE ladder.matches
  SET    status = 'skipped'
  WHERE  id = p_match_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.skip_match_secure(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.skip_match_secure(uuid)
  TO authenticated;

-- G-3. submit_match_result_secure (notification-enabled version from core_saas_additive)
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
  v_player_id      uuid;
  v_status         text;
  v_is_bye         boolean;
  v_p1_player      uuid;
  v_p2_player      uuid;
  v_p1_team        uuid;
  v_p2_team        uuid;
  v_league_id      uuid;
  v_submitter_side int;
  v_opp_player     uuid;
  v_opp_team       uuid;
  v_member         record;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  SELECT status, is_bye,
         p1_player_id, p2_player_id,
         p1_team_id,   p2_team_id,
         league_id
    INTO v_status, v_is_bye,
         v_p1_player, v_p2_player,
         v_p1_team,   v_p2_team,
         v_league_id
    FROM ladder.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF v_is_bye        THEN RAISE EXCEPTION 'bye_match';        END IF;
  IF v_status <> 'pending' THEN RAISE EXCEPTION 'match_not_pending'; END IF;

  v_submitter_side := ladder.get_match_participant_side(v_player_id, p_match_id);

  PERFORM ladder.validate_match_result_payload(p_match_id, p_result);

  UPDATE ladder.matches
     SET status             = 'awaiting_confirmation',
         result             = p_result,
         submitted_by       = v_player_id,
         submitted_at       = now(),
         auto_confirm_after = now() + interval '48 hours'
   WHERE id = p_match_id;

  IF v_p1_player IS NOT NULL OR v_p2_player IS NOT NULL THEN
    v_opp_player := CASE WHEN v_submitter_side = 1 THEN v_p2_player ELSE v_p1_player END;
    IF v_opp_player IS NOT NULL THEN
      PERFORM ladder.create_notification_internal(
        v_opp_player, v_league_id, 'score_submitted',
        'A score was submitted for your match. Please confirm or dispute.',
        p_match_id, NULL
      );
    END IF;
  ELSE
    v_opp_team := CASE WHEN v_submitter_side = 1 THEN v_p2_team ELSE v_p1_team END;
    IF v_opp_team IS NOT NULL THEN
      FOR v_member IN
        SELECT player_id FROM ladder.team_members WHERE team_id = v_opp_team
      LOOP
        PERFORM ladder.create_notification_internal(
          v_member.player_id, v_league_id, 'score_submitted',
          'A score was submitted for your match. Please confirm or dispute.',
          p_match_id, NULL
        );
      END LOOP;
    END IF;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.submit_match_result_secure(text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.submit_match_result_secure(text, uuid, jsonb)
  TO anon, authenticated;

-- G-4. confirm_match_result_secure (notification-enabled version)
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
  v_p1_team        uuid;
  v_p2_team        uuid;
  v_league_id      uuid;
  v_submitter_team uuid;
  v_member         record;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  SELECT status, submitted_by, p1_team_id, p2_team_id, league_id
    INTO v_status, v_submitted_by, v_p1_team, v_p2_team, v_league_id
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

  IF v_p1_team IS NULL AND v_p2_team IS NULL THEN
    PERFORM ladder.create_notification_internal(
      v_submitted_by, v_league_id, 'score_confirmed',
      'Your submitted score has been confirmed.',
      p_match_id, NULL
    );
  ELSE
    v_submitter_team := CASE WHEN v_submitter_side = 1 THEN v_p1_team ELSE v_p2_team END;
    FOR v_member IN
      SELECT player_id FROM ladder.team_members WHERE team_id = v_submitter_team
    LOOP
      PERFORM ladder.create_notification_internal(
        v_member.player_id, v_league_id, 'score_confirmed',
        'Your submitted score has been confirmed.',
        p_match_id, NULL
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.confirm_match_result_secure(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.confirm_match_result_secure(text, uuid)
  TO anon, authenticated;

-- G-5. open_match_dispute_secure (notification-enabled version)
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
  v_p1_team        uuid;
  v_p2_team        uuid;
  v_league_id      uuid;
  v_submitter_team uuid;
  v_member         record;
BEGIN
  v_player_id      := ladder.resolve_player_from_token(p_token);
  v_trimmed_reason := trim(p_reason);

  IF v_trimmed_reason IS NULL OR v_trimmed_reason = '' THEN
    RAISE EXCEPTION 'reason_empty';
  END IF;

  IF length(v_trimmed_reason) > 1000 THEN
    RAISE EXCEPTION 'reason_too_long';
  END IF;

  SELECT status, submitted_by, p1_team_id, p2_team_id, league_id
    INTO v_status, v_submitted_by, v_p1_team, v_p2_team, v_league_id
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

  IF v_p1_team IS NULL AND v_p2_team IS NULL THEN
    PERFORM ladder.create_notification_internal(
      v_submitted_by, v_league_id, 'score_disputed',
      'Your submitted score has been disputed. The organizer will review.',
      p_match_id, NULL
    );
  ELSE
    v_submitter_team := CASE WHEN v_submitter_side = 1 THEN v_p1_team ELSE v_p2_team END;
    FOR v_member IN
      SELECT player_id FROM ladder.team_members WHERE team_id = v_submitter_team
    LOOP
      PERFORM ladder.create_notification_internal(
        v_member.player_id, v_league_id, 'score_disputed',
        'Your submitted score has been disputed. The organizer will review.',
        p_match_id, NULL
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.open_match_dispute_secure(text, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.open_match_dispute_secure(text, uuid, text, jsonb)
  TO anon, authenticated;

-- G-6. resolve_dispute_for_organizer (notification-enabled version)
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
  v_p1_player uuid;
  v_p2_player uuid;
  v_p1_team   uuid;
  v_p2_team   uuid;
  v_member    record;
BEGIN
  SELECT league_id, status,
         p1_player_id, p2_player_id,
         p1_team_id,   p2_team_id
    INTO v_league_id, v_status,
         v_p1_player, v_p2_player,
         v_p1_team,   v_p2_team
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

  IF v_p1_player IS NOT NULL OR v_p2_player IS NOT NULL THEN
    IF v_p1_player IS NOT NULL THEN
      PERFORM ladder.create_notification_internal(
        v_p1_player, v_league_id, 'dispute_resolved',
        'The organizer has resolved the dispute for your match.',
        p_match_id, NULL
      );
    END IF;
    IF v_p2_player IS NOT NULL THEN
      PERFORM ladder.create_notification_internal(
        v_p2_player, v_league_id, 'dispute_resolved',
        'The organizer has resolved the dispute for your match.',
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
        v_member.player_id, v_league_id, 'dispute_resolved',
        'The organizer has resolved the dispute for your match.',
        p_match_id, NULL
      );
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.resolve_dispute_for_organizer(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.resolve_dispute_for_organizer(uuid, text)
  TO authenticated;

-- G-7. record_match_result_for_organizer
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

-- G-8. create_challenge_secure
CREATE OR REPLACE FUNCTION ladder.create_challenge_secure(
  p_token         text,
  p_challenged_id uuid,
  p_league_id     uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenger_id    uuid;
  v_challenger_name  text;
  v_no_response_days int;
  v_challenge_id     uuid;
BEGIN
  v_challenger_id := ladder.resolve_player_from_token(p_token);

  v_no_response_days := ladder.validate_challenge_rules_internal(
    v_challenger_id, p_challenged_id, p_league_id
  );

  SELECT name INTO v_challenger_name
    FROM ladder.players
   WHERE id = v_challenger_id;

  INSERT INTO ladder.challenges (
    league_id, challenger_player_id, challenged_player_id,
    status, expires_at
  )
  VALUES (
    p_league_id, v_challenger_id, p_challenged_id,
    'pending', now() + (v_no_response_days || ' days')::interval
  )
  RETURNING id INTO v_challenge_id;

  PERFORM ladder.create_notification_internal(
    p_challenged_id,
    p_league_id,
    'challenge_received',
    v_challenger_name || ' has challenged you. You have '
      || v_no_response_days || ' days to respond.',
    NULL,
    v_challenge_id
  );

  RETURN v_challenge_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.create_challenge_secure(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_challenge_secure(text, uuid, uuid)
  TO anon, authenticated;

-- G-9. create_challenge_for_organizer
CREATE OR REPLACE FUNCTION ladder.create_challenge_for_organizer(
  p_league_id     uuid,
  p_challenger_id uuid,
  p_challenged_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_challenger_name  text;
  v_no_response_days int;
  v_challenge_id     uuid;
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  v_no_response_days := ladder.validate_challenge_rules_internal(
    p_challenger_id, p_challenged_id, p_league_id
  );

  SELECT name INTO v_challenger_name
    FROM ladder.players
   WHERE id = p_challenger_id;

  INSERT INTO ladder.challenges (
    league_id, challenger_player_id, challenged_player_id,
    status, expires_at
  )
  VALUES (
    p_league_id, p_challenger_id, p_challenged_id,
    'pending', now() + (v_no_response_days || ' days')::interval
  )
  RETURNING id INTO v_challenge_id;

  PERFORM ladder.create_notification_internal(
    p_challenged_id,
    p_league_id,
    'challenge_received',
    v_challenger_name || ' has challenged you. You have '
      || v_no_response_days || ' days to respond.',
    NULL,
    v_challenge_id
  );

  RETURN v_challenge_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.create_challenge_for_organizer(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_challenge_for_organizer(uuid, uuid, uuid)
  TO authenticated;

-- G-10. respond_to_challenge_secure
CREATE OR REPLACE FUNCTION ladder.respond_to_challenge_secure(
  p_token        text,
  p_challenge_id uuid,
  p_accept       boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_player_id        uuid;
  v_player_league    uuid;
  v_challenger_id    uuid;
  v_challenged_id    uuid;
  v_challenge_league uuid;
  v_challenge_status text;
  v_expires_at       timestamptz;
  v_current_round    int;
  v_match_id         uuid;
  v_challenged_name  text;
BEGIN
  v_player_id := ladder.resolve_player_from_token(p_token);

  SELECT league_id INTO v_player_league
    FROM ladder.players
   WHERE id = v_player_id;

  SELECT challenger_player_id, challenged_player_id,
         league_id, status, expires_at
    INTO v_challenger_id, v_challenged_id,
         v_challenge_league, v_challenge_status, v_expires_at
    FROM ladder.challenges
   WHERE id = p_challenge_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'challenge_not_found';
  END IF;

  IF v_player_league IS DISTINCT FROM v_challenge_league THEN
    RAISE EXCEPTION 'not_participant';
  END IF;

  IF v_player_id <> v_challenged_id THEN
    RAISE EXCEPTION 'not_challenged_player';
  END IF;

  IF v_challenge_status <> 'pending' THEN
    RAISE EXCEPTION 'challenge_not_pending';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    RAISE EXCEPTION 'challenge_expired';
  END IF;

  SELECT name INTO v_challenged_name
    FROM ladder.players
   WHERE id = v_challenged_id;

  IF p_accept THEN
    SELECT COALESCE(MAX(round_number), 1)
      INTO v_current_round
      FROM ladder.matches
     WHERE league_id = v_challenge_league;

    INSERT INTO ladder.matches (
      league_id, round_number, type, is_bye,
      p1_player_id, p2_player_id, status
    )
    VALUES (
      v_challenge_league, v_current_round, 'challenge', false,
      v_challenger_id, v_challenged_id, 'pending'
    )
    RETURNING id INTO v_match_id;

    UPDATE ladder.challenges
       SET status   = 'accepted',
           match_id = v_match_id
     WHERE id = p_challenge_id;

    PERFORM ladder.create_notification_internal(
      v_challenger_id, v_challenge_league, 'challenge_accepted',
      v_challenged_name || ' accepted your challenge. Your match is ready.',
      v_match_id, p_challenge_id
    );

    RETURN v_match_id;

  ELSE
    UPDATE ladder.challenges
       SET status = 'declined'
     WHERE id = p_challenge_id;

    PERFORM ladder.create_notification_internal(
      v_challenger_id, v_challenge_league, 'challenge_declined',
      v_challenged_name || ' declined your challenge.',
      NULL, p_challenge_id
    );

    RETURN NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.respond_to_challenge_secure(text, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.respond_to_challenge_secure(text, uuid, boolean)
  TO anon, authenticated;

-- ═════════════════════════════════════════════════════════════════
-- F. Drop lifecycle RPCs (all were created by the additive migration)
-- ═════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS ladder.duplicate_league_for_organizer(uuid, text, jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS ladder.restore_league_for_organizer(uuid);
DROP FUNCTION IF EXISTS ladder.archive_league_for_organizer(uuid);
DROP FUNCTION IF EXISTS ladder.end_league_for_organizer(uuid);

-- ═════════════════════════════════════════════════════════════════
-- D. Restore create_league_atomic (returns uuid, original body)
-- ═════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS ladder.create_league_atomic(
  text, text, text, text, text, text, int, int, boolean, jsonb, jsonb, jsonb, jsonb
);

CREATE FUNCTION ladder.create_league_atomic(
  p_name               text,
  p_sport              text,
  p_mode               text,
  p_singles_or_doubles text,
  p_format             text,
  p_third_set_format   text,
  p_rounds             int,
  p_challenge_spots    int,
  p_auto_advance       boolean,
  p_players            jsonb,
  p_teams              jsonb,
  p_matches            jsonb,
  p_seeded_order       jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organizer_id  uuid;
  v_league_id     uuid;
  v_player_map    jsonb    := '{}'::jsonb;
  v_team_map      jsonb    := '{}'::jsonb;
  v_is_doubles    boolean;
  v_new_id        uuid;
  v_rank          int;
  v_db_p1         uuid;
  v_db_p2         uuid;
  v_prec          record;
  v_trec          record;
  v_mrec          record;
  v_srec          record;
  v_memrec        record;
BEGIN
  v_organizer_id := auth.uid();
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  p_name := btrim(COALESCE(p_name, ''));
  IF p_name = '' THEN RAISE EXCEPTION 'empty_league_name'; END IF;
  IF p_sport NOT IN ('tennis', 'pickleball') THEN RAISE EXCEPTION 'invalid_sport'; END IF;
  IF p_mode NOT IN ('round_robin', 'ladder') THEN RAISE EXCEPTION 'invalid_mode'; END IF;
  IF p_singles_or_doubles NOT IN ('singles', 'doubles') THEN RAISE EXCEPTION 'invalid_format'; END IF;
  IF p_players IS NULL OR jsonb_array_length(p_players) = 0 THEN RAISE EXCEPTION 'no_players'; END IF;

  v_is_doubles := (p_singles_or_doubles = 'doubles');

  INSERT INTO ladder.leagues (
    name, sport, mode, singles_or_doubles,
    format, third_set_format, rounds, challenge_spots, auto_advance
  ) VALUES (
    p_name, p_sport, p_mode, p_singles_or_doubles,
    COALESCE(p_format,           'best_of_3'),
    COALESCE(p_third_set_format, 'full_set'),
    COALESCE(p_rounds,           6),
    COALESCE(p_challenge_spots,  2),
    COALESCE(p_auto_advance,     true)
  )
  RETURNING id INTO v_league_id;

  INSERT INTO ladder.league_organizers (league_id, user_id)
  VALUES (v_league_id, v_organizer_id);

  FOR v_prec IN
    SELECT
      (elem->>'local_id')                       AS local_id,
      btrim(COALESCE(elem->>'name', ''))        AS pname,
      NULLIF(elem->>'rating',      '')          AS rating,
      NULLIF(elem->>'rating_type', '')          AS rating_type,
      NULLIF(elem->>'utr_url',     '')          AS utr_url
    FROM jsonb_array_elements(p_players) AS elem
  LOOP
    IF v_prec.pname = '' THEN RAISE EXCEPTION 'empty_player_name'; END IF;

    INSERT INTO ladder.players (
      league_id, name, rating, rating_type, utr_url, role
    ) VALUES (
      v_league_id,
      v_prec.pname,
      v_prec.rating,
      CASE WHEN v_prec.rating_type IN ('USTA', 'UTR') THEN v_prec.rating_type ELSE NULL END,
      v_prec.utr_url,
      'player'
    )
    RETURNING id INTO v_new_id;

    v_player_map := v_player_map || jsonb_build_object(v_prec.local_id, v_new_id::text);
  END LOOP;

  IF v_is_doubles AND p_teams IS NOT NULL AND jsonb_array_length(p_teams) > 0 THEN
    FOR v_trec IN
      SELECT
        (elem->>'local_id')         AS local_id,
        (elem->'player_local_ids')  AS player_local_ids
      FROM jsonb_array_elements(p_teams) AS elem
    LOOP
      INSERT INTO ladder.teams (league_id) VALUES (v_league_id) RETURNING id INTO v_new_id;
      v_team_map := v_team_map || jsonb_build_object(v_trec.local_id, v_new_id::text);

      FOR v_memrec IN
        SELECT pid FROM jsonb_array_elements_text(v_trec.player_local_ids) AS pid
      LOOP
        INSERT INTO ladder.team_members (team_id, player_id)
        VALUES (v_new_id, (v_player_map->>v_memrec.pid)::uuid);
      END LOOP;
    END LOOP;
  END IF;

  IF p_matches IS NOT NULL AND jsonb_array_length(p_matches) > 0 THEN
    FOR v_mrec IN
      SELECT
        (elem->>'local_p1_id')                       AS p1_local,
        (elem->>'local_p2_id')                       AS p2_local,
        (elem->>'round_number')::int                 AS round_number,
        COALESCE(elem->>'type', 'scheduled')         AS match_type,
        COALESCE((elem->>'is_bye')::boolean, false)  AS is_bye
      FROM jsonb_array_elements(p_matches) AS elem
    LOOP
      IF v_is_doubles THEN
        v_db_p1 := CASE WHEN v_mrec.p1_local IS NOT NULL
                        THEN (v_team_map->>v_mrec.p1_local)::uuid ELSE NULL END;
        v_db_p2 := CASE WHEN v_mrec.is_bye OR v_mrec.p2_local IS NULL
                        THEN NULL ELSE (v_team_map->>v_mrec.p2_local)::uuid END;
        INSERT INTO ladder.matches (
          league_id, round_number, type, is_bye, p1_team_id, p2_team_id, status
        ) VALUES (
          v_league_id, v_mrec.round_number, v_mrec.match_type, v_mrec.is_bye,
          v_db_p1, v_db_p2, 'pending'
        );
      ELSE
        v_db_p1 := CASE WHEN v_mrec.p1_local IS NOT NULL
                        THEN (v_player_map->>v_mrec.p1_local)::uuid ELSE NULL END;
        v_db_p2 := CASE WHEN v_mrec.is_bye OR v_mrec.p2_local IS NULL
                        THEN NULL ELSE (v_player_map->>v_mrec.p2_local)::uuid END;
        INSERT INTO ladder.matches (
          league_id, round_number, type, is_bye, p1_player_id, p2_player_id, status
        ) VALUES (
          v_league_id, v_mrec.round_number, v_mrec.match_type, v_mrec.is_bye,
          v_db_p1, v_db_p2, 'pending'
        );
      END IF;
    END LOOP;
  END IF;

  v_rank := 1;
  FOR v_srec IN
    SELECT lid FROM jsonb_array_elements_text(p_seeded_order) AS lid
  LOOP
    IF v_is_doubles THEN
      INSERT INTO ladder.rankings (league_id, team_id, rank)
      VALUES (v_league_id, (v_team_map->>v_srec.lid)::uuid, v_rank);
    ELSE
      INSERT INTO ladder.rankings (league_id, player_id, rank)
      VALUES (v_league_id, (v_player_map->>v_srec.lid)::uuid, v_rank);
    END IF;
    v_rank := v_rank + 1;
  END LOOP;

  RETURN v_league_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.create_league_atomic(
  text, text, text, text, text, text, int, int, boolean, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_league_atomic(
  text, text, text, text, text, text, int, int, boolean, jsonb, jsonb, jsonb, jsonb
) TO authenticated;

-- ═════════════════════════════════════════════════════════════════
-- B-2 + C + B-1. Drop internal helpers created by the additive migration
-- ═════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS ladder.validate_league_payload(text, text, jsonb, jsonb, jsonb, jsonb);

DROP FUNCTION IF EXISTS ladder.create_league_core_internal(
  uuid, text, text, text, text, text, text, int, int, boolean,
  int, int, int, int, int, boolean, int, text, int, int,
  jsonb, jsonb, jsonb, jsonb
);

DROP FUNCTION IF EXISTS ladder.assert_league_active(uuid);

-- ═════════════════════════════════════════════════════════════════
-- B. Restore list_my_leagues to prior signature (no lifecycle columns)
-- ═════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS ladder.list_my_leagues();

CREATE FUNCTION ladder.list_my_leagues()
RETURNS TABLE (
  league_id          uuid,
  name               text,
  sport              text,
  singles_or_doubles text,
  mode               text,
  format             text,
  rounds             int,
  challenge_spots    int,
  player_count       bigint,
  team_count         bigint,
  created_at         timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT
    lo.league_id,
    l.name,
    l.sport,
    l.singles_or_doubles,
    l.mode,
    l.format,
    l.rounds,
    l.challenge_spots,
    (SELECT COUNT(*) FROM ladder.players p WHERE p.league_id = l.id) AS player_count,
    (SELECT COUNT(*) FROM ladder.teams   t WHERE t.league_id = l.id) AS team_count,
    l.created_at
  FROM  ladder.league_organizers lo
  JOIN  ladder.leagues           l ON l.id = lo.league_id
  WHERE lo.user_id = auth.uid()
  ORDER BY l.created_at DESC;
$$;

REVOKE ALL ON FUNCTION ladder.list_my_leagues()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.list_my_leagues()
  TO authenticated;

-- ═════════════════════════════════════════════════════════════════
-- A. Drop lifecycle columns
-- ═════════════════════════════════════════════════════════════════

ALTER TABLE ladder.leagues
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS ended_at,
  DROP COLUMN IF EXISTS status;

COMMIT;
