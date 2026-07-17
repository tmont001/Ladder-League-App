-- ══════════════════════════════════════════════════════════════════
-- SECURE ORGANIZER OPERATIONS — ADDITIVE MIGRATION
-- File: supabase/migrations/20260716220000_secure_organizer_operations.sql
--
-- Execution order: run AFTER 20260710000000_ladder_schema.sql
--                               and 20260716204307_league_organizers.sql
--
-- Creates SECURITY DEFINER RPCs for every organizer-controlled write.
-- Does NOT alter, revoke, or drop any existing grants or policies.
-- Legacy direct-INSERT paths remain open until the separate revocation
-- migration (20260716220001_revoke_organizer_direct_paths.sql) is applied
-- after all frontend tests pass.
--
-- Functions created:
--   ladder.assert_league_organizer(uuid)           — internal helper, no client grant
--   ladder.add_player_for_organizer(...)           — authenticated only
--   ladder.add_team_with_members_for_organizer(…)  — authenticated only
--   ladder.create_matches_for_organizer(uuid,jsonb)— authenticated only
--   ladder.seed_rankings_for_organizer(uuid,jsonb) — authenticated only
--   ladder.get_player_codes_secure(uuid)           — authenticated only
--   ladder.update_league_settings_secure(...)      — authenticated only
--   ladder.skip_match_secure(uuid)                 — authenticated only
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- INTERNAL HELPER
-- Not directly callable by any browser role.
-- Called by every other organizer RPC to centralise ownership checks.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ladder.assert_league_organizer(p_league_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'An authenticated Supabase Auth session is required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM   ladder.league_organizers
    WHERE  league_id = p_league_id
      AND  user_id   = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_league_organizer'
      USING HINT = 'The authenticated user does not own this league.';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.assert_league_organizer(uuid) FROM PUBLIC, anon, authenticated;
-- No GRANT: internal use only — callers are other SECURITY DEFINER functions.

-- ─────────────────────────────────────────────────────────────────
-- A. add_player_for_organizer
-- Inserts one player into the organizer's league.
-- Returns the DB-assigned player UUID so the caller can build idMap.
-- session_token is excluded — DB DEFAULT fires automatically.
--
-- rating_type values confirmed from LeagueSetupStep2.js: 'USTA', 'UTR'
-- ─────────────────────────────────────────────────────────────────

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

  -- rating_type values from LeagueSetupStep2.js: 'USTA', 'UTR' (uppercase)
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

-- ─────────────────────────────────────────────────────────────────
-- B. add_team_with_members_for_organizer
-- Creates one doubles team and its two team_members rows atomically.
-- Accepts DB player UUIDs (already inserted via add_player_for_organizer).
-- Returns the DB-assigned team UUID.
-- ─────────────────────────────────────────────────────────────────

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

  -- Current doubles model: exactly 2 members per team.
  IF array_length(p_player_ids, 1) IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'Doubles teams must have exactly 2 members.';
  END IF;

  -- Reject self-pairing.
  IF p_player_ids[1] = p_player_ids[2] THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'A player cannot appear twice on the same team.';
  END IF;

  -- Both players must belong to this league.
  SELECT COUNT(*) INTO v_count
  FROM   ladder.players
  WHERE  id = ANY(p_player_ids)
    AND  league_id = p_league_id;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'One or more player IDs do not belong to this league.';
  END IF;

  -- Reject players already assigned to another team in this league.
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

-- ─────────────────────────────────────────────────────────────────
-- C. create_matches_for_organizer
-- Validates and inserts the full initial schedule atomically.
-- The league's singles_or_doubles value is loaded from the DB —
-- the caller cannot override participant mode.
--
-- Return type: RETURNS SETOF ladder.matches
--   RETURNS TABLE with output columns named league_id, type, status,
--   id, etc. caused PL/pgSQL error 42702 ("column reference is
--   ambiguous") because those names shadow identically-named table
--   columns in every WHERE clause inside the body.  RETURNS SETOF
--   avoids OUT parameters entirely; RETURNING * fills the row type.
--
-- Interaction with later challenge matches:
--   The duplicate-schedule guard checks for existing type='scheduled'
--   matches.  Challenge matches have type='challenge' and are inserted
--   via the legacy createMatches path (a player action); they do NOT
--   trigger this guard.  Messenger-added ad-hoc scheduled matches
--   (type='scheduled', inserted via direct INSERT by LeagueContext)
--   WOULD trigger the guard if an organizer somehow re-invoked this
--   RPC after those matches existed.  That scenario cannot occur
--   through the current UI — this RPC is called once during handleLaunch
--   and has no dashboard entry point.
--
-- Each element of p_matches must be a JSON object containing:
--   round_number  int  (≥ 1)
--   type          text (must be 'scheduled')
--   is_bye        bool
--   p1_player_id  uuid | null   (singles only)
--   p2_player_id  uuid | null   (singles non-bye only)
--   p1_team_id    uuid | null   (doubles only)
--   p2_team_id    uuid | null   (doubles non-bye only)
--
-- status and result are always set server-side; client values ignored.
-- ─────────────────────────────────────────────────────────────────

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

  -- Validate top-level shape.
  IF jsonb_typeof(p_matches) <> 'array' OR jsonb_array_length(p_matches) = 0 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'p_matches must be a nonempty JSON array.';
  END IF;

  -- Guard against duplicate initial schedule.
  -- Alias 'm' ensures league_id and type are unambiguously table columns.
  -- type='scheduled' identifies initial and messenger-added matches;
  -- type='challenge' identifies challenge matches and is not checked here.
  IF EXISTS (
    SELECT 1 FROM ladder.matches m
    WHERE  m.league_id = p_league_id
      AND  m.type = 'scheduled'
  ) THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = 'This league already has a scheduled match set. '
                   'create_matches_for_organizer is for initial schedule creation only.';
  END IF;

  -- Derive participant mode from the league — not from the client.
  SELECT singles_or_doubles INTO v_mode
  FROM   ladder.leagues
  WHERE  id = p_league_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input' USING HINT = 'League not found.';
  END IF;

  v_is_doubles := (v_mode = 'doubles');

  -- ── Validate every element before inserting any row ─────────────
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
      -- Doubles: must use team IDs, no player IDs.
      IF v_p1_player IS NOT NULL OR v_p2_player IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'Doubles matches must not include player IDs.';
      END IF;
      IF v_p1_team IS NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p1_team_id is required for doubles matches.';
      END IF;
      -- Non-bye: p2 required, p1 <> p2.
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
      -- Bye: p2 must be absent.
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
      -- Singles: must use player IDs, no team IDs.
      IF v_p1_team IS NOT NULL OR v_p2_team IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'Singles matches must not include team IDs.';
      END IF;
      IF v_p1_player IS NULL THEN
        RAISE EXCEPTION 'invalid_input'
          USING HINT = 'p1_player_id is required for singles matches.';
      END IF;
      -- Non-bye: p2 required, p1 <> p2.
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
      -- Bye: p2 must be absent.
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

  -- ── All validated — insert atomically ───────────────────────────
  -- status and result are always server-controlled; no client value used.
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

REVOKE ALL ON FUNCTION ladder.create_matches_for_organizer(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_matches_for_organizer(uuid, jsonb)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- D. seed_rankings_for_organizer
-- Inserts initial rankings and rank_history rows atomically.
-- The p_is_doubles mode is derived from the league record — the caller
-- cannot supply it.
-- p_participants is a JSONB array of {"id":"uuid"} in seeded order;
-- array position (1-based) becomes the initial rank.
-- ─────────────────────────────────────────────────────────────────

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

  -- Validate top-level shape.
  IF jsonb_typeof(p_participants) <> 'array' OR jsonb_array_length(p_participants) = 0 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'p_participants must be a nonempty JSON array.';
  END IF;

  -- Guard against double-seeding.
  IF EXISTS (
    SELECT 1 FROM ladder.rankings WHERE league_id = p_league_id
  ) THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = 'Rankings already exist for this league. seed_rankings_for_organizer is for initial seeding only.';
  END IF;

  -- Derive doubles mode from the league — not from the client.
  SELECT singles_or_doubles INTO v_mode
  FROM   ladder.leagues
  WHERE  id = p_league_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_input' USING HINT = 'League not found.';
  END IF;

  v_is_doubles := (v_mode = 'doubles');

  -- Validate every participant before inserting any row.
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

  -- Insert rankings; array position (1-based) = initial rank.
  INSERT INTO ladder.rankings (league_id, player_id, team_id, rank)
  SELECT
    p_league_id,
    CASE WHEN NOT v_is_doubles THEN (t.elem->>'id')::uuid ELSE NULL END,
    CASE WHEN     v_is_doubles THEN (t.elem->>'id')::uuid ELSE NULL END,
    t.rn::int
  FROM jsonb_array_elements(p_participants) WITH ORDINALITY AS t(elem, rn);

  -- Insert corresponding initial rank_history rows.
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

-- ─────────────────────────────────────────────────────────────────
-- E. get_player_codes_secure
-- Returns (id, name, role, session_token) for every player in the
-- league, verified to be owned by the calling organizer.
-- Replaces the legacy get_player_codes RPC for organizer use.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ladder.get_player_codes_secure(p_league_id uuid)
RETURNS TABLE (
  id            uuid,
  name          text,
  role          text,
  session_token text
)
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  RETURN QUERY
  SELECT p.id, p.name, p.role, p.session_token
  FROM   ladder.players p
  WHERE  p.league_id = p_league_id
  ORDER  BY p.joined_at;
END;
$$;

REVOKE ALL ON FUNCTION ladder.get_player_codes_secure(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.get_player_codes_secure(uuid)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────
-- F. update_league_settings_secure
-- Updates only the explicitly supported persisted settings columns.
-- Accepts named parameters — no unrestricted JSON patch.
--
-- Allowed format values confirmed from LeagueSetupStep1.js:
--   'best_of_1', 'best_of_3', 'best_of_5'
-- Allowed third_set_format values confirmed from SettingsModal.js:
--   'full_set', 'super_tiebreak', 'match_tiebreak'
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ladder.update_league_settings_secure(
  p_league_id        uuid,
  p_name             text,
  p_format           text,
  p_third_set_format text,
  p_challenge_spots  int,
  p_auto_advance     boolean
)
RETURNS void
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
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

-- ─────────────────────────────────────────────────────────────────
-- G. skip_match_secure
-- Loads the match to get its league, calls assert_league_organizer,
-- then enforces the only permitted transition: pending → skipped.
--
-- The ScheduleTab UI shows the Skip button only for status='pending'
-- matches.  The RPC enforces this server-side: every other status is
-- rejected regardless of how the call was made.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ladder.skip_match_secure(p_match_id uuid)
RETURNS void
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
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

  -- Only pending → skipped is permitted.
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

COMMIT;
