-- ══════════════════════════════════════════════════════════════════
-- LADDER LEAGUE — ORGANIZER IDENTITY MIGRATION
-- File: supabase/migrations/20260716204307_league_organizers.sql
--
-- Adds verifiable organizer ownership to the ladder schema:
--
--   A. ladder.league_organizers
--        Ties a Supabase Auth user (auth.uid()) to a league they own.
--        RLS: authenticated users may SELECT only their own rows.
--        No client INSERT / UPDATE / DELETE policy exists; all writes
--        go through the create_league_for_organizer RPC below.
--
--   B. ladder.create_league_for_organizer  (SECURITY DEFINER)
--        Atomically inserts the league and the ownership row in one
--        transaction so orphan leagues are structurally impossible.
--        Requires auth.uid() IS NOT NULL (organizer must be signed in).
--        Validates every required input before touching the database.
--        Fully qualified references, SET search_path = '' throughout.
--
-- What this migration does NOT touch:
--   • No existing table policies are dropped or altered.
--   • No existing grants are revoked.
--   • No existing RPC is modified.
--   • ladder.players.session_token DEFAULT is unchanged.
--
-- Prerequisites:
--   • Supabase Auth must be enabled on the project.
--   • The ladder schema must already exist (see 20260710000000_ladder_schema.sql).
--
-- Rollback: see supabase/rollback/20260716204307_league_organizers_rollback.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- A. ladder.league_organizers
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ladder.league_organizers (
  league_id  uuid NOT NULL
    REFERENCES ladder.leagues(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL
    REFERENCES auth.users(id)    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (league_id, user_id)
);

-- RLS: enable immediately so no row is readable before the policy fires.
ALTER TABLE ladder.league_organizers ENABLE ROW LEVEL SECURITY;

-- Authenticated organizers may SELECT only their own rows.
DROP POLICY IF EXISTS league_organizers_select ON ladder.league_organizers;
CREATE POLICY league_organizers_select ON ladder.league_organizers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policy for any client role.
-- All writes happen inside the SECURITY DEFINER RPC below.

-- Revoke all default privileges first, then grant only what is needed.
-- This ensures anon and unauthenticated callers have no access even if
-- default grants were applied by a prior migration or Supabase project setting.
REVOKE ALL ON TABLE ladder.league_organizers
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE ladder.league_organizers
  TO authenticated;


-- ─────────────────────────────────────────────────────────────────
-- B. ladder.create_league_for_organizer
--
-- Parameters match exactly what db.js createLeague() currently passes
-- (inspected from the ladder.leagues schema):
--   p_name               — leagues.name          (text NOT NULL)
--   p_sport              — leagues.sport          (CHECK: tennis | pickleball)
--   p_mode               — leagues.mode           (CHECK: round_robin | ladder)
--   p_singles_or_doubles — leagues.singles_or_doubles (CHECK: singles | doubles)
--   p_format             — leagues.format         (text NOT NULL DEFAULT 'best_of_3')
--   p_third_set_format   — leagues.third_set_format (text NOT NULL DEFAULT 'full_set')
--   p_rounds             — leagues.rounds         (int NOT NULL DEFAULT 6)
--   p_challenge_spots    — leagues.challenge_spots (int NOT NULL DEFAULT 2)
--   p_auto_advance       — leagues.auto_advance   (boolean NOT NULL DEFAULT true)
--
-- Returns: the UUID of the newly created league.
--
-- All remaining ladder.leagues columns (challenge_cooldown_days,
-- match_expiry_days, etc.) retain their column DEFAULTs and are not
-- exposed in the signature — the organizer cannot override them at
-- creation time, consistent with the existing createLeague() call.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ladder.create_league_for_organizer(
  p_name               text,
  p_sport              text,
  p_mode               text,
  p_singles_or_doubles text,
  p_format             text,
  p_third_set_format   text,
  p_rounds             int,
  p_challenge_spots    int,
  p_auto_advance       boolean
)
RETURNS uuid
SECURITY DEFINER
SET search_path = ''
LANGUAGE plpgsql
AS $$
DECLARE
  v_league_id uuid;
BEGIN
  -- ── 1. Require an authenticated caller ──────────────────────────
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING HINT = 'Organizer must be signed in before creating a league';
  END IF;

  -- ── 2. Validate required string inputs ──────────────────────────
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'name_required'
      USING HINT = 'League name must not be empty';
  END IF;

  IF p_sport NOT IN ('tennis', 'pickleball') THEN
    RAISE EXCEPTION 'invalid_sport'
      USING HINT = 'sport must be tennis or pickleball';
  END IF;

  IF p_singles_or_doubles NOT IN ('singles', 'doubles') THEN
    RAISE EXCEPTION 'invalid_singles_or_doubles'
      USING HINT = 'singles_or_doubles must be singles or doubles';
  END IF;

  IF p_mode NOT IN ('round_robin', 'ladder') THEN
    RAISE EXCEPTION 'invalid_mode'
      USING HINT = 'mode must be round_robin or ladder';
  END IF;

  IF p_format IS NULL OR trim(p_format) = '' THEN
    RAISE EXCEPTION 'format_required'
      USING HINT = 'format must not be empty';
  END IF;

  IF p_third_set_format IS NULL OR trim(p_third_set_format) = '' THEN
    RAISE EXCEPTION 'third_set_format_required'
      USING HINT = 'third_set_format must not be empty';
  END IF;

  -- ── 3. Validate numeric and boolean inputs ───────────────────────
  IF p_auto_advance IS NULL THEN
    RAISE EXCEPTION 'auto_advance_required'
      USING HINT = 'auto_advance must not be null';
  END IF;

  IF p_rounds IS NULL OR p_rounds < 1 THEN
    RAISE EXCEPTION 'invalid_rounds'
      USING HINT = 'rounds must be a positive integer';
  END IF;

  IF p_challenge_spots IS NULL OR p_challenge_spots < 1 THEN
    RAISE EXCEPTION 'invalid_challenge_spots'
      USING HINT = 'challenge_spots must be a positive integer';
  END IF;

  -- ── 4. Insert league ─────────────────────────────────────────────
  -- Column names must match ladder.leagues exactly.
  -- Columns not listed here receive their DEFAULT values.
  INSERT INTO ladder.leagues (
    name,
    sport,
    mode,
    singles_or_doubles,
    format,
    third_set_format,
    rounds,
    challenge_spots,
    auto_advance
  )
  VALUES (
    trim(p_name),
    p_sport,
    p_mode,
    p_singles_or_doubles,
    p_format,
    p_third_set_format,
    p_rounds,
    p_challenge_spots,
    p_auto_advance
  )
  RETURNING id INTO v_league_id;

  -- ── 5. Record ownership atomically ───────────────────────────────
  -- This INSERT is in the same transaction as the league INSERT.
  -- If either fails, both are rolled back: orphan leagues are
  -- impossible through this code path.
  INSERT INTO ladder.league_organizers (league_id, user_id)
  VALUES (v_league_id, auth.uid());

  RETURN v_league_id;
END;
$$;

-- Revoke all privileges first, then grant only what is needed.
-- Combining PUBLIC, anon, and authenticated in one statement ensures
-- no role retains access from a prior default or inherited grant.
REVOKE ALL ON FUNCTION ladder.create_league_for_organizer(
  text, text, text, text, text, text, int, int, boolean
) FROM PUBLIC, anon, authenticated;

-- Only signed-in organizers (authenticated role) may invoke this RPC.
GRANT EXECUTE ON FUNCTION ladder.create_league_for_organizer(
  text, text, text, text, text, text, int, int, boolean
) TO authenticated;

COMMIT;
