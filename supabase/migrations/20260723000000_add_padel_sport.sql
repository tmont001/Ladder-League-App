-- ══════════════════════════════════════════════════════════════════
-- ADD PADEL SPORT SUPPORT
-- File: supabase/migrations/20260723000000_add_padel_sport.sql
--
-- Adds 'padel' as a permitted sport value alongside 'tennis' and
-- 'pickleball'.  Two targeted changes only:
--
--   1. Extend the CHECK constraint on ladder.leagues.sport.
--   2. Update the sport allow-list inside create_league_atomic.
--
-- No other schema objects, policies, grants, or function signatures
-- are modified.  The duplicate_league_for_organizer function reads
-- sport from the source league row and passes it through to
-- create_league_core_internal without an explicit allow-list check,
-- so no change is required there.
--
-- Security pattern (identical to prior migrations):
--   • SECURITY DEFINER + SET search_path = '' on every function.
--   • Fully qualified table references throughout.
--   • REVOKE ALL FROM PUBLIC, anon, authenticated before GRANT.
--   • Least-privilege EXECUTE grant (authenticated only).
--   • No dynamic SQL; no service-role key exposure.
--
-- Rollback: supabase/rollback/20260723000000_add_padel_sport_rollback.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ═════════════════════════════════════════════════════════════════
-- 1. EXTEND ladder.leagues.sport CHECK CONSTRAINT
--
-- PostgreSQL auto-names an inline CHECK constraint on column "sport"
-- of table "leagues" as leagues_sport_check.  We drop and re-add it
-- with 'padel' included.  The IF EXISTS clause is defensive; it
-- prevents failure if the constraint was previously renamed.
-- ═════════════════════════════════════════════════════════════════

ALTER TABLE ladder.leagues
  DROP CONSTRAINT IF EXISTS leagues_sport_check;

ALTER TABLE ladder.leagues
  ADD CONSTRAINT leagues_sport_check
  CHECK (sport IN ('tennis', 'pickleball', 'padel'));

-- ═════════════════════════════════════════════════════════════════
-- 2. UPDATE create_league_atomic SPORT ALLOW-LIST
--
-- The existing function was created with CREATE FUNCTION (not OR
-- REPLACE) in 20260722000000_pilot_readiness_additive.sql.
-- CREATE OR REPLACE is safe here because the signature is unchanged.
--
-- Only the sport guard on line:
--   IF p_sport NOT IN ('tennis', 'pickleball')
-- is modified.  Every other auth guard, validation step, grant, and
-- delegation call is reproduced verbatim.
-- ═════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ladder.create_league_atomic(
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
  IF p_sport NOT IN ('tennis', 'pickleball', 'padel') THEN
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

COMMIT;
