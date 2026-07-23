-- ══════════════════════════════════════════════════════════════════
-- PILOT READINESS — ADDITIVE MIGRATION (CORRECTED)
-- File: supabase/migrations/20260722000000_pilot_readiness_additive.sql
--
-- Adds feature groups without modifying existing schema objects, policies,
-- or grants beyond the specific targets listed below:
--
--   A. League lifecycle columns (status, ended_at, archived_at)
--
--   B. list_my_leagues — DROP + recreate with lifecycle columns.
--
--   B-1. assert_league_active — internal helper; raises league_read_only
--         when status ≠ 'active'.  No browser EXECUTE grant.
--
--   C. create_league_core_internal — internal shared helper used by both
--         create_league_atomic and duplicate_league_for_organizer.
--         Returns jsonb { league_id, player_codes }.  No browser grant.
--
--   D. create_league_atomic — DROP + recreate:
--         • Comprehensive input validation (local_id uniqueness, team shape,
--           self-match guard, mode/match consistency, seeded_order coverage)
--         • Delegates to create_league_core_internal
--         • Returns jsonb (was uuid)
--
--   E. Privilege hardening:
--         REVOKE DELETE ON ladder.leagues FROM anon, authenticated
--         REVOKE INSERT ON ladder.matches  FROM anon, authenticated
--         (SECURITY DEFINER RPCs are unaffected; they run as the owner)
--
--   F. League lifecycle RPCs (organizer-authenticated):
--         F-1. end_league_for_organizer     — active  → ended   (FOR UPDATE)
--         F-2. archive_league_for_organizer — ended   → archived (FOR UPDATE)
--         F-3. restore_league_for_organizer — archived → ended   (FIXED: was 'active')
--         F-4. duplicate_league_for_organizer — DROP + recreate with new
--              signature (source_id, name, players, teams, matches, seeded_order);
--              delegates to create_league_core_internal; returns jsonb.
--
--   G. Patch 10 competition-mutating RPCs to enforce assert_league_active:
--         update_league_settings_secure, skip_match_secure,
--         submit_match_result_secure, confirm_match_result_secure,
--         open_match_dispute_secure, resolve_dispute_for_organizer,
--         record_match_result_for_organizer, create_challenge_secure,
--         create_challenge_for_organizer, respond_to_challenge_secure
--
-- Security pattern (identical to prior migrations):
--   • SECURITY DEFINER + SET search_path = '' on every function.
--   • Fully qualified table references throughout.
--   • REVOKE ALL FROM PUBLIC, anon, authenticated before GRANT.
--   • Least-privilege EXECUTE grants.
--   • Organizer identity derived exclusively from auth.uid().
--   • No dynamic SQL; no service-role key exposure.
--
-- Rollback: supabase/rollback/20260722000000_pilot_readiness_rollback.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════
-- A. LEAGUE LIFECYCLE COLUMNS
-- ═════════════════════════════════════════════════════════════════

ALTER TABLE ladder.leagues
  ADD COLUMN IF NOT EXISTS status      text        NOT NULL DEFAULT 'active'
    CONSTRAINT leagues_status_check
      CHECK (status IN ('active', 'ended', 'archived')),
  ADD COLUMN IF NOT EXISTS ended_at    timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ═════════════════════════════════════════════════════════════════
-- B. list_my_leagues — rebuild with lifecycle columns
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
  created_at         timestamptz,
  status             text,
  ended_at           timestamptz,
  archived_at        timestamptz
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
    l.created_at,
    l.status,
    l.ended_at,
    l.archived_at
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
-- B-1. INTERNAL HELPER: assert_league_active
-- Raises league_read_only when the league's status ≠ 'active'.
-- Called by all competition-mutating RPCs after assert_league_organizer
-- or resolve_player_from_token to block writes to ended/archived leagues.
-- No browser EXECUTE grant — internal use only.
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.assert_league_active(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status
  FROM   ladder.leagues
  WHERE  id = p_league_id;

  IF NOT FOUND OR v_status IS NULL THEN
    RAISE EXCEPTION 'league_not_found';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'league_read_only';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.assert_league_active(uuid)
  FROM PUBLIC, anon, authenticated;
-- No GRANT: internal use only.

-- ═════════════════════════════════════════════════════════════════
-- B-2. INTERNAL HELPER: validate_league_payload
--
-- Shared payload validator called by BOTH create_league_atomic and
-- duplicate_league_for_organizer BEFORE delegating to
-- create_league_core_internal.  Never called directly from the browser.
--
-- Validates:
--   PLAYERS:  non-empty array; each local_id non-empty and unique;
--             each name non-empty and unique (case-insensitive).
--
--   SINGLES:  p_teams must be empty.
--             seeded_order contains every player local_id exactly once;
--             no unknown or duplicate IDs.
--
--   DOUBLES:  each team local_id non-empty and unique;
--             each team has exactly two distinct player local_ids;
--             every referenced player local_id exists in p_players;
--             no player belongs to more than one team;
--             every player belongs to exactly one team;
--             seeded_order contains every team local_id exactly once;
--             no unknown or duplicate IDs.
--
--   MATCHES:  p_matches is a JSON array;
--             every p1 local_id resolves to a valid player or team;
--             every non-bye p2 local_id resolves;
--             bye matches have no p2 participant;
--             non-bye matches have two distinct participants;
--             round_number >= 1;
--             match type in ('scheduled','challenge');
--             Round Robin requires non-empty scheduled-match payload;
--             Ladder rejects any scheduled matches.
--
-- Exception identifiers (mapped in db.js rpcErrorMessage):
--   no_players, empty_player_local_id, duplicate_player_local_id,
--   empty_player_name, duplicate_player_name,
--   singles_must_have_no_teams,
--   no_teams, empty_team_local_id, duplicate_team_local_id,
--   team_must_have_two_players, team_players_not_distinct,
--   team_references_unknown_player, player_on_multiple_teams,
--   player_without_team,
--   seeded_order_mismatch, seeded_order_invalid,
--   round_robin_requires_matches, ladder_mode_no_scheduled_matches,
--   invalid_round_number, invalid_match_type,
--   match_missing_p1, match_missing_p2,
--   match_unknown_participant, bye_must_have_no_p2,
--   self_match_not_allowed.
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.validate_league_payload(
  p_mode               text,
  p_singles_or_doubles text,
  p_players            jsonb,
  p_teams              jsonb,
  p_matches            jsonb,
  p_seeded_order       jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_doubles         boolean;
  v_seen_player_ids    text[]  := ARRAY[]::text[];
  v_seen_player_names  text[]  := ARRAY[]::text[];
  v_team_player_set    jsonb   := '{}'::jsonb;
  v_seen_team_ids      text[]  := ARRAY[]::text[];
  v_seen_order_ids     text[]  := ARRAY[]::text[];
  v_expected_count     int;
  v_covered_count      int;
  v_prec               record;
  v_trec               record;
  v_mrec               record;
  v_pid                text;
  v_lid                text;
  v_lower_name         text;
BEGIN
  -- ── PLAYERS ────────────────────────────────────────────────────
  IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array'
     OR jsonb_array_length(p_players) = 0 THEN
    RAISE EXCEPTION 'no_players';
  END IF;

  FOR v_prec IN
    SELECT
      COALESCE(elem->>'local_id', '')    AS local_id,
      btrim(COALESCE(elem->>'name', '')) AS pname
    FROM jsonb_array_elements(p_players) AS elem
  LOOP
    IF v_prec.local_id = '' THEN
      RAISE EXCEPTION 'empty_player_local_id';
    END IF;
    IF v_prec.local_id = ANY(v_seen_player_ids) THEN
      RAISE EXCEPTION 'duplicate_player_local_id';
    END IF;
    v_seen_player_ids := array_append(v_seen_player_ids, v_prec.local_id);

    IF v_prec.pname = '' THEN
      RAISE EXCEPTION 'empty_player_name';
    END IF;
    v_lower_name := lower(v_prec.pname);
    IF v_lower_name = ANY(v_seen_player_names) THEN
      RAISE EXCEPTION 'duplicate_player_name';
    END IF;
    v_seen_player_names := array_append(v_seen_player_names, v_lower_name);
  END LOOP;

  v_is_doubles := (p_singles_or_doubles = 'doubles');

  IF v_is_doubles THEN
    -- ── DOUBLES: teams ───────────────────────────────────────────
    IF p_teams IS NULL OR jsonb_typeof(p_teams) <> 'array'
       OR jsonb_array_length(p_teams) = 0 THEN
      RAISE EXCEPTION 'no_teams';
    END IF;

    FOR v_trec IN
      SELECT
        COALESCE(elem->>'local_id', '')  AS local_id,
        (elem->'player_local_ids')       AS player_local_ids
      FROM jsonb_array_elements(p_teams) AS elem
    LOOP
      IF v_trec.local_id = '' THEN
        RAISE EXCEPTION 'empty_team_local_id';
      END IF;
      IF v_trec.local_id = ANY(v_seen_team_ids) THEN
        RAISE EXCEPTION 'duplicate_team_local_id';
      END IF;
      v_seen_team_ids := array_append(v_seen_team_ids, v_trec.local_id);

      IF v_trec.player_local_ids IS NULL
         OR jsonb_typeof(v_trec.player_local_ids) <> 'array'
         OR jsonb_array_length(v_trec.player_local_ids) <> 2 THEN
        RAISE EXCEPTION 'team_must_have_two_players';
      END IF;
      IF v_trec.player_local_ids->>0 = v_trec.player_local_ids->>1 THEN
        RAISE EXCEPTION 'team_players_not_distinct';
      END IF;

      FOR v_pid IN
        SELECT pid FROM jsonb_array_elements_text(v_trec.player_local_ids) AS pid
      LOOP
        IF NOT (v_pid = ANY(v_seen_player_ids)) THEN
          RAISE EXCEPTION 'team_references_unknown_player';
        END IF;
        IF (v_team_player_set->>v_pid) IS NOT NULL THEN
          RAISE EXCEPTION 'player_on_multiple_teams';
        END IF;
        v_team_player_set := v_team_player_set || jsonb_build_object(v_pid, true);
      END LOOP;
    END LOOP;

    -- Every player must belong to exactly one team
    SELECT count(*) INTO v_covered_count FROM jsonb_object_keys(v_team_player_set);
    IF v_covered_count <> array_length(v_seen_player_ids, 1) THEN
      RAISE EXCEPTION 'player_without_team';
    END IF;

    v_expected_count := array_length(v_seen_team_ids, 1);

  ELSE
    -- ── SINGLES: no teams allowed ────────────────────────────────
    IF p_teams IS NOT NULL AND jsonb_typeof(p_teams) = 'array'
       AND jsonb_array_length(p_teams) > 0 THEN
      RAISE EXCEPTION 'singles_must_have_no_teams';
    END IF;

    v_expected_count := array_length(v_seen_player_ids, 1);
  END IF;

  -- ── SEEDED ORDER ────────────────────────────────────────────────
  IF p_seeded_order IS NULL OR jsonb_typeof(p_seeded_order) <> 'array' THEN
    RAISE EXCEPTION 'seeded_order_mismatch';
  END IF;
  IF jsonb_array_length(p_seeded_order) <> v_expected_count THEN
    RAISE EXCEPTION 'seeded_order_mismatch';
  END IF;
  FOR v_lid IN
    SELECT lid FROM jsonb_array_elements_text(p_seeded_order) AS lid
  LOOP
    IF v_lid = ANY(v_seen_order_ids) THEN
      RAISE EXCEPTION 'seeded_order_mismatch';
    END IF;
    v_seen_order_ids := array_append(v_seen_order_ids, v_lid);
    IF v_is_doubles THEN
      IF NOT (v_lid = ANY(v_seen_team_ids)) THEN
        RAISE EXCEPTION 'seeded_order_invalid';
      END IF;
    ELSE
      IF NOT (v_lid = ANY(v_seen_player_ids)) THEN
        RAISE EXCEPTION 'seeded_order_invalid';
      END IF;
    END IF;
  END LOOP;

  -- ── MATCHES ─────────────────────────────────────────────────────
  IF p_matches IS NOT NULL AND jsonb_typeof(p_matches) <> 'array' THEN
    RAISE EXCEPTION 'invalid_matches';
  END IF;

  -- Mode/match consistency
  IF p_mode = 'round_robin' THEN
    IF p_matches IS NULL OR jsonb_typeof(p_matches) <> 'array'
       OR jsonb_array_length(p_matches) = 0 THEN
      RAISE EXCEPTION 'round_robin_requires_matches';
    END IF;
  END IF;
  IF p_mode = 'ladder' THEN
    IF p_matches IS NOT NULL AND jsonb_typeof(p_matches) = 'array'
       AND jsonb_array_length(p_matches) > 0 THEN
      RAISE EXCEPTION 'ladder_mode_no_scheduled_matches';
    END IF;
  END IF;

  -- Per-match validation (only when matches are present)
  IF p_matches IS NOT NULL AND jsonb_typeof(p_matches) = 'array'
     AND jsonb_array_length(p_matches) > 0 THEN
    FOR v_mrec IN
      SELECT
        COALESCE(elem->>'local_p1_id', '')          AS p1_local,
        elem->>'local_p2_id'                         AS p2_local,
        (elem->>'round_number')::int                 AS round_number,
        COALESCE(elem->>'type', 'scheduled')         AS match_type,
        COALESCE((elem->>'is_bye')::boolean, false)  AS is_bye
      FROM jsonb_array_elements(p_matches) AS elem
    LOOP
      IF v_mrec.round_number IS NULL OR v_mrec.round_number < 1 THEN
        RAISE EXCEPTION 'invalid_round_number';
      END IF;
      IF v_mrec.match_type NOT IN ('scheduled', 'challenge') THEN
        RAISE EXCEPTION 'invalid_match_type';
      END IF;
      -- p1 must resolve
      IF v_mrec.p1_local = '' THEN
        RAISE EXCEPTION 'match_missing_p1';
      END IF;
      IF v_is_doubles THEN
        IF NOT (v_mrec.p1_local = ANY(v_seen_team_ids)) THEN
          RAISE EXCEPTION 'match_unknown_participant';
        END IF;
      ELSE
        IF NOT (v_mrec.p1_local = ANY(v_seen_player_ids)) THEN
          RAISE EXCEPTION 'match_unknown_participant';
        END IF;
      END IF;
      -- Bye: p2 must be absent
      IF v_mrec.is_bye AND v_mrec.p2_local IS NOT NULL AND v_mrec.p2_local <> '' THEN
        RAISE EXCEPTION 'bye_must_have_no_p2';
      END IF;
      -- Non-bye: p2 must resolve and differ from p1
      IF NOT v_mrec.is_bye THEN
        IF v_mrec.p2_local IS NULL OR v_mrec.p2_local = '' THEN
          RAISE EXCEPTION 'match_missing_p2';
        END IF;
        IF v_is_doubles THEN
          IF NOT (v_mrec.p2_local = ANY(v_seen_team_ids)) THEN
            RAISE EXCEPTION 'match_unknown_participant';
          END IF;
        ELSE
          IF NOT (v_mrec.p2_local = ANY(v_seen_player_ids)) THEN
            RAISE EXCEPTION 'match_unknown_participant';
          END IF;
        END IF;
        IF v_mrec.p1_local = v_mrec.p2_local THEN
          RAISE EXCEPTION 'self_match_not_allowed';
        END IF;
      END IF;
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION ladder.validate_league_payload(text, text, jsonb, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
-- No GRANT: internal use only.

-- ═════════════════════════════════════════════════════════════════
-- C. INTERNAL HELPER: create_league_core_internal
--
-- Performs the transactional core of league creation:
--   1. INSERT league row with all settings
--   2. INSERT league_organizers row
--   3. INSERT players (fresh session tokens via DB DEFAULT); collect codes
--   4. INSERT teams + team_members (doubles only)
--   5. INSERT matches
--   6. INSERT rankings from seeded_order
--
-- Returns jsonb: { "league_id": "<uuid>", "player_codes": [...] }
-- where player_codes = [{ "player_id", "name", "session_token" }, ...]
--
-- p_players format (same as create_league_atomic):
--   [{ "local_id", "name", "rating"?, "rating_type"?, "utr_url"? }]
-- p_teams format:
--   [{ "local_id", "player_local_ids": ["...", "..."] }]
-- p_matches format:
--   [{ "local_p1_id", "local_p2_id", "round_number", "type", "is_bye" }]
-- p_seeded_order: [local_id, ...]
--
-- Extended settings (p_challenge_cooldown_days … p_inactivity_drop_days)
-- default to NULL.  When NULL, the league INSERT omits those columns so
-- the DB DEFAULT fires.  When non-null (duplicate flow), an UPDATE applies
-- the source values after INSERT.
--
-- No auth checks, no input validation — callers handle both.
-- No browser EXECUTE grant — internal use only.
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.create_league_core_internal(
  p_organizer_id                uuid,
  p_name                        text,
  p_sport                       text,
  p_mode                        text,
  p_singles_or_doubles          text,
  p_format                      text,
  p_third_set_format            text,
  p_rounds                      int,
  p_challenge_spots             int,
  p_auto_advance                boolean,
  p_challenge_cooldown_days     int         DEFAULT NULL,
  p_match_expiry_days           int         DEFAULT NULL,
  p_rematch_lock_days           int         DEFAULT NULL,
  p_max_active_challenges       int         DEFAULT NULL,
  p_no_response_days            int         DEFAULT NULL,
  p_decline_penalty_enabled     boolean     DEFAULT NULL,
  p_protection_after_match_days int         DEFAULT NULL,
  p_movement_type               text        DEFAULT NULL,
  p_inactivity_warning_days     int         DEFAULT NULL,
  p_inactivity_drop_days        int         DEFAULT NULL,
  p_players                     jsonb       DEFAULT '[]'::jsonb,
  p_teams                       jsonb       DEFAULT '[]'::jsonb,
  p_matches                     jsonb       DEFAULT '[]'::jsonb,
  p_seeded_order                jsonb       DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_league_id    uuid;
  v_is_doubles   boolean;
  v_player_map   jsonb    := '{}'::jsonb;
  v_team_map     jsonb    := '{}'::jsonb;
  v_player_codes jsonb    := '[]'::jsonb;
  v_new_id       uuid;
  v_token        text;
  v_rank         int;
  v_db_p1        uuid;
  v_db_p2        uuid;
  v_prec         record;
  v_trec         record;
  v_mrec         record;
  v_memrec       record;
  v_srec         record;
BEGIN
  -- 1. Create league (basic settings; DB DEFAULT fires for extended columns)
  INSERT INTO ladder.leagues (
    name, sport, mode, singles_or_doubles, format, third_set_format,
    rounds, challenge_spots, auto_advance
  ) VALUES (
    p_name,
    p_sport,
    p_mode,
    p_singles_or_doubles,
    COALESCE(p_format,           'best_of_3'),
    COALESCE(p_third_set_format, 'full_set'),
    COALESCE(p_rounds,           6),
    COALESCE(p_challenge_spots,  2),
    COALESCE(p_auto_advance,     true)
  )
  RETURNING id INTO v_league_id;

  -- Apply extended settings when provided (duplicate flow).
  -- COALESCE(param, column) preserves DB DEFAULT when param is NULL.
  IF p_challenge_cooldown_days     IS NOT NULL
  OR p_match_expiry_days           IS NOT NULL
  OR p_rematch_lock_days           IS NOT NULL
  OR p_max_active_challenges       IS NOT NULL
  OR p_no_response_days            IS NOT NULL
  OR p_decline_penalty_enabled     IS NOT NULL
  OR p_protection_after_match_days IS NOT NULL
  OR p_movement_type               IS NOT NULL
  OR p_inactivity_warning_days     IS NOT NULL
  OR p_inactivity_drop_days        IS NOT NULL
  THEN
    UPDATE ladder.leagues
    SET
      challenge_cooldown_days    = COALESCE(p_challenge_cooldown_days,    challenge_cooldown_days),
      match_expiry_days          = COALESCE(p_match_expiry_days,          match_expiry_days),
      rematch_lock_days          = COALESCE(p_rematch_lock_days,          rematch_lock_days),
      max_active_challenges      = COALESCE(p_max_active_challenges,      max_active_challenges),
      no_response_days           = COALESCE(p_no_response_days,           no_response_days),
      decline_penalty_enabled    = COALESCE(p_decline_penalty_enabled,    decline_penalty_enabled),
      protection_after_match_days = COALESCE(p_protection_after_match_days, protection_after_match_days),
      movement_type              = COALESCE(p_movement_type,              movement_type),
      inactivity_warning_days    = COALESCE(p_inactivity_warning_days,    inactivity_warning_days),
      inactivity_drop_days       = COALESCE(p_inactivity_drop_days,       inactivity_drop_days)
    WHERE id = v_league_id;
  END IF;

  -- 2. Record organizer ownership
  INSERT INTO ladder.league_organizers (league_id, user_id)
  VALUES (v_league_id, p_organizer_id);

  v_is_doubles := (p_singles_or_doubles = 'doubles');

  -- 3. Insert players; build local_id → DB UUID map; collect session tokens
  FOR v_prec IN
    SELECT
      (elem->>'local_id')                       AS local_id,
      btrim(COALESCE(elem->>'name', ''))        AS pname,
      NULLIF(elem->>'rating',      '')          AS rating,
      NULLIF(elem->>'rating_type', '')          AS rating_type,
      NULLIF(elem->>'utr_url',     '')          AS utr_url
    FROM jsonb_array_elements(p_players) AS elem
  LOOP
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
    RETURNING id, session_token INTO v_new_id, v_token;

    v_player_map   := v_player_map || jsonb_build_object(v_prec.local_id, v_new_id::text);
    v_player_codes := v_player_codes || jsonb_build_array(
      jsonb_build_object(
        'player_id',     v_new_id,
        'name',          v_prec.pname,
        'session_token', v_token
      )
    );
  END LOOP;

  -- 4. Insert teams + team_members (doubles only)
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

  -- 5. Insert matches
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

  -- 6. Seed initial rankings from supplied order
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

  RETURN jsonb_build_object(
    'league_id',    v_league_id,
    'player_codes', v_player_codes
  );
END;
$$;

REVOKE ALL ON FUNCTION ladder.create_league_core_internal(
  uuid, text, text, text, text, text, text, int, int, boolean,
  int, int, int, int, int, boolean, int, text, int, int,
  jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
-- No GRANT: internal use only.

-- ═════════════════════════════════════════════════════════════════
-- D. ATOMIC LEAGUE CREATION
--
-- Comprehensive input validation before delegating to
-- create_league_core_internal.  Returns jsonb (was uuid).
--
-- New validations vs prior version:
--   • Duplicate player local_id in p_players → duplicate_player_local_id
--   • Doubles: no teams → no_teams
--   • Doubles: team ≠ 2 players → team_must_have_two_players
--   • Doubles: team players not distinct → team_players_not_distinct
--   • Doubles: player on multiple teams → player_on_multiple_teams
--   • Non-bye match with p1 = p2 → self_match_not_allowed
--   • Round-robin with empty matches → round_robin_requires_matches
--   • seeded_order count ≠ player/team count → seeded_order_mismatch
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
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organizer_id uuid;
BEGIN
  -- Auth guard
  v_organizer_id := auth.uid();
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Basic settings validation
  p_name := btrim(COALESCE(p_name, ''));
  IF p_name = '' THEN
    RAISE EXCEPTION 'empty_league_name';
  END IF;
  IF p_sport NOT IN ('tennis', 'pickleball') THEN
    RAISE EXCEPTION 'invalid_sport';
  END IF;
  IF p_mode NOT IN ('round_robin', 'ladder') THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;
  IF p_singles_or_doubles NOT IN ('singles', 'doubles') THEN
    RAISE EXCEPTION 'invalid_format';
  END IF;
  -- Delegate payload validation to shared internal helper
  PERFORM ladder.validate_league_payload(
    p_mode               := p_mode,
    p_singles_or_doubles := p_singles_or_doubles,
    p_players            := COALESCE(p_players, '[]'::jsonb),
    p_teams              := COALESCE(p_teams,   '[]'::jsonb),
    p_matches            := COALESCE(p_matches, '[]'::jsonb),
    p_seeded_order       := COALESCE(p_seeded_order, '[]'::jsonb)
  );

  -- Delegate creation to shared internal helper
  RETURN ladder.create_league_core_internal(
    p_organizer_id         := v_organizer_id,
    p_name                 := p_name,
    p_sport                := p_sport,
    p_mode                 := p_mode,
    p_singles_or_doubles   := p_singles_or_doubles,
    p_format               := p_format,
    p_third_set_format     := p_third_set_format,
    p_rounds               := p_rounds,
    p_challenge_spots      := p_challenge_spots,
    p_auto_advance         := p_auto_advance,
    p_players              := p_players,
    p_teams                := p_teams,
    p_matches              := p_matches,
    p_seeded_order         := p_seeded_order
  );
END;
$$;

REVOKE ALL ON FUNCTION ladder.create_league_atomic(
  text, text, text, text, text, text, int, int, boolean, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.create_league_atomic(
  text, text, text, text, text, text, int, int, boolean, jsonb, jsonb, jsonb, jsonb
) TO authenticated;

-- ═════════════════════════════════════════════════════════════════
-- E. PRIVILEGE HARDENING
--
-- REVOKE DELETE on ladder.leagues: prevents any anon/authenticated session
-- from issuing a direct DELETE.  delete_league_for_organizer (SECURITY
-- DEFINER) is unaffected — it runs with the function owner's privileges.
--
-- REVOKE INSERT on ladder.matches: the old challenge flow used direct INSERT;
-- the secure RPC (respond_to_challenge_secure, SECURITY DEFINER) is the
-- only supported path and is unaffected.
-- ═════════════════════════════════════════════════════════════════

REVOKE DELETE ON TABLE ladder.leagues FROM anon, authenticated;
REVOKE INSERT ON TABLE ladder.matches FROM anon, authenticated;

-- ═════════════════════════════════════════════════════════════════
-- F-1. end_league_for_organizer
-- active → ended.  SELECT … FOR UPDATE prevents concurrent transitions.
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.end_league_for_organizer(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  SELECT status INTO v_status
  FROM   ladder.leagues
  WHERE  id = p_league_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'league_not_found';
  END IF;
  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'league_not_active';
  END IF;

  UPDATE ladder.leagues
  SET    status   = 'ended',
         ended_at = now()
  WHERE  id = p_league_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.end_league_for_organizer(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.end_league_for_organizer(uuid)
  TO authenticated;

-- ═════════════════════════════════════════════════════════════════
-- F-2. archive_league_for_organizer
-- ended → archived.  SELECT … FOR UPDATE prevents concurrent transitions.
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.archive_league_for_organizer(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  SELECT status INTO v_status
  FROM   ladder.leagues
  WHERE  id = p_league_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'league_not_found';
  END IF;
  IF v_status <> 'ended' THEN
    RAISE EXCEPTION 'league_must_end_before_archive';
  END IF;

  UPDATE ladder.leagues
  SET    status      = 'archived',
         archived_at = now()
  WHERE  id = p_league_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.archive_league_for_organizer(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.archive_league_for_organizer(uuid)
  TO authenticated;

-- ═════════════════════════════════════════════════════════════════
-- F-3. restore_league_for_organizer
-- archived → ended.  (NOT 'active' — the league must be re-ended first
-- or the organizer duplicates it as a new season.)
-- archived_at is cleared; ended_at is preserved so the history is intact.
-- SELECT … FOR UPDATE prevents concurrent transitions.
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.restore_league_for_organizer(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);

  SELECT status INTO v_status
  FROM   ladder.leagues
  WHERE  id = p_league_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'league_not_found';
  END IF;
  IF v_status <> 'archived' THEN
    RAISE EXCEPTION 'league_not_archived';
  END IF;

  UPDATE ladder.leagues
  SET    status      = 'ended',
         archived_at = NULL
  WHERE  id = p_league_id;
END;
$$;

REVOKE ALL ON FUNCTION ladder.restore_league_for_organizer(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.restore_league_for_organizer(uuid)
  TO authenticated;

-- ═════════════════════════════════════════════════════════════════
-- F-4. duplicate_league_for_organizer
--
-- Creates a new league ("new season") from a source league.
--
-- The server reads source league settings and validates organizer ownership.
-- The client supplies fresh players/teams/matches/seeded_order (typically
-- generated by matchGenerator.js using source league player data).
-- Delegates to create_league_core_internal; returns jsonb with player codes
-- so the caller can route directly to LaunchCodesScreen without a round trip.
--
-- Signature change (uuid, text) → (uuid, text, jsonb, jsonb, jsonb, jsonb):
-- DROP + CREATE is required because parameter count changed.
-- ═════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS ladder.duplicate_league_for_organizer(uuid, text);

CREATE FUNCTION ladder.duplicate_league_for_organizer(
  p_source_league_id uuid,
  p_new_name         text,
  p_players          jsonb,
  p_teams            jsonb,
  p_matches          jsonb,
  p_seeded_order     jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_organizer_id uuid;
  v_new_name     text;
  v_src          record;
BEGIN
  v_organizer_id := auth.uid();
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM ladder.assert_league_organizer(p_source_league_id);

  v_new_name := btrim(COALESCE(p_new_name, ''));
  IF v_new_name = '' THEN
    RAISE EXCEPTION 'duplicate_name_empty';
  END IF;

  SELECT * INTO v_src
  FROM   ladder.leagues
  WHERE  id = p_source_league_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'league_not_found';
  END IF;

  -- Validate client-supplied payload using shared helper before creating
  PERFORM ladder.validate_league_payload(
    p_mode               := v_src.mode,
    p_singles_or_doubles := v_src.singles_or_doubles,
    p_players            := COALESCE(p_players,      '[]'::jsonb),
    p_teams              := COALESCE(p_teams,        '[]'::jsonb),
    p_matches            := COALESCE(p_matches,      '[]'::jsonb),
    p_seeded_order       := COALESCE(p_seeded_order, '[]'::jsonb)
  );

  -- Delegate to shared creation helper with source league settings
  RETURN ladder.create_league_core_internal(
    p_organizer_id                := v_organizer_id,
    p_name                        := v_new_name,
    p_sport                       := v_src.sport,
    p_mode                        := v_src.mode,
    p_singles_or_doubles          := v_src.singles_or_doubles,
    p_format                      := v_src.format,
    p_third_set_format            := v_src.third_set_format,
    p_rounds                      := v_src.rounds,
    p_challenge_spots             := v_src.challenge_spots,
    p_auto_advance                := v_src.auto_advance,
    p_challenge_cooldown_days     := v_src.challenge_cooldown_days,
    p_match_expiry_days           := v_src.match_expiry_days,
    p_rematch_lock_days           := v_src.rematch_lock_days,
    p_max_active_challenges       := v_src.max_active_challenges,
    p_no_response_days            := v_src.no_response_days,
    p_decline_penalty_enabled     := v_src.decline_penalty_enabled,
    p_protection_after_match_days := v_src.protection_after_match_days,
    p_movement_type               := v_src.movement_type,
    p_inactivity_warning_days     := v_src.inactivity_warning_days,
    p_inactivity_drop_days        := v_src.inactivity_drop_days,
    p_players                     := COALESCE(p_players,      '[]'::jsonb),
    p_teams                       := COALESCE(p_teams,        '[]'::jsonb),
    p_matches                     := COALESCE(p_matches,      '[]'::jsonb),
    p_seeded_order                := COALESCE(p_seeded_order, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION ladder.duplicate_league_for_organizer(
  uuid, text, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ladder.duplicate_league_for_organizer(
  uuid, text, jsonb, jsonb, jsonb, jsonb
) TO authenticated;

-- ═════════════════════════════════════════════════════════════════
-- G. PATCH 10 COMPETITION-MUTATING RPCs WITH assert_league_active
--
-- Every RPC that mutates match, ranking, challenge, or dispute state
-- now calls assert_league_active to reject writes to ended/archived
-- leagues.  Only the assert call is added; all other logic is unchanged.
-- ═════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- G-1. update_league_settings_secure
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM ladder.assert_league_organizer(p_league_id);
  PERFORM ladder.assert_league_active(p_league_id);

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
-- G-2. skip_match_secure
-- ─────────────────────────────────────────────────────────────────

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
  PERFORM ladder.assert_league_active(v_league_id);

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

-- ─────────────────────────────────────────────────────────────────
-- G-3. submit_match_result_secure
-- ─────────────────────────────────────────────────────────────────

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
  PERFORM ladder.assert_league_active(v_league_id);
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

  -- Notify opponent(s) that a score needs confirmation
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

-- ─────────────────────────────────────────────────────────────────
-- G-4. confirm_match_result_secure
-- ─────────────────────────────────────────────────────────────────

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
  PERFORM ladder.assert_league_active(v_league_id);

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

  -- Notify the original submitter
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

-- ─────────────────────────────────────────────────────────────────
-- G-5. open_match_dispute_secure
-- ─────────────────────────────────────────────────────────────────

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
  PERFORM ladder.assert_league_active(v_league_id);

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

  -- Notify the submitter their score is disputed
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

-- ─────────────────────────────────────────────────────────────────
-- G-6. resolve_dispute_for_organizer
-- ─────────────────────────────────────────────────────────────────

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
  PERFORM ladder.assert_league_active(v_league_id);

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

  -- Notify all participants
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

-- ─────────────────────────────────────────────────────────────────
-- G-7. record_match_result_for_organizer
-- ─────────────────────────────────────────────────────────────────

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
  PERFORM ladder.assert_league_active(v_league_id);

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

-- ─────────────────────────────────────────────────────────────────
-- G-8. create_challenge_secure
-- ─────────────────────────────────────────────────────────────────

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
  PERFORM ladder.assert_league_active(p_league_id);

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

-- ─────────────────────────────────────────────────────────────────
-- G-9. create_challenge_for_organizer
-- ─────────────────────────────────────────────────────────────────

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
  PERFORM ladder.assert_league_active(p_league_id);

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

-- ─────────────────────────────────────────────────────────────────
-- G-10. respond_to_challenge_secure
-- ─────────────────────────────────────────────────────────────────

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

  PERFORM ladder.assert_league_active(v_challenge_league);

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
-- G-11 through G-14. Patch remaining organizer-mutation RPCs with
-- assert_league_active.  Only the assert call is added after the
-- existing assert_league_organizer call; all other logic is unchanged.
-- ═════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- G-11. add_player_for_organizer
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
  PERFORM ladder.assert_league_active(p_league_id);

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

-- ─────────────────────────────────────────────────────────────────
-- G-12. add_team_with_members_for_organizer
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
  PERFORM ladder.assert_league_active(p_league_id);

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

-- ─────────────────────────────────────────────────────────────────
-- G-13. create_matches_for_organizer
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
  PERFORM ladder.assert_league_active(p_league_id);

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

-- ─────────────────────────────────────────────────────────────────
-- G-14. seed_rankings_for_organizer
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
  PERFORM ladder.assert_league_active(p_league_id);

  IF jsonb_typeof(p_participants) <> 'array' OR jsonb_array_length(p_participants) = 0 THEN
    RAISE EXCEPTION 'invalid_input'
      USING HINT = 'p_participants must be a nonempty JSON array.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM ladder.rankings WHERE league_id = p_league_id
  ) THEN
    RAISE EXCEPTION 'invalid_state'
      USING HINT = 'Rankings already exist for this league. seed_rankings_for_organizer is for initial seeding only.';
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

COMMIT;
