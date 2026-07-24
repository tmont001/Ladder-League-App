-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK: ADD PADEL SPORT SUPPORT
-- File: supabase/rollback/20260723000000_add_padel_sport_rollback.sql
--
-- Reverts 20260723000000_add_padel_sport.sql.
--
-- WARNING: Running this rollback while any ladder.leagues row has
-- sport = 'padel' will cause the re-added CHECK constraint to fail.
-- Delete or update all Padel league rows before applying this rollback.
--
-- Steps:
--   1. Restore create_league_atomic to reject 'padel'.
--   2. Restore the ladder.leagues.sport CHECK constraint to
--      tennis/pickleball only.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 1. RESTORE create_league_atomic sport guard (tennis + pickleball only)
-- ─────────────────────────────────────────────────────────────────

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
  v_organizer_id := auth.uid();
  IF v_organizer_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

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
  PERFORM ladder.validate_league_payload(
    p_mode               := p_mode,
    p_singles_or_doubles := p_singles_or_doubles,
    p_players            := COALESCE(p_players, '[]'::jsonb),
    p_teams              := COALESCE(p_teams,   '[]'::jsonb),
    p_matches            := COALESCE(p_matches, '[]'::jsonb),
    p_seeded_order       := COALESCE(p_seeded_order, '[]'::jsonb)
  );

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

-- ─────────────────────────────────────────────────────────────────
-- 2. RESTORE ladder.leagues.sport CHECK (tennis + pickleball only)
--
-- WARNING: Will fail if any row contains sport = 'padel'.
-- Remove all Padel leagues first.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE ladder.leagues
  DROP CONSTRAINT IF EXISTS leagues_sport_check;

ALTER TABLE ladder.leagues
  ADD CONSTRAINT leagues_sport_check
  CHECK (sport IN ('tennis', 'pickleball'));

COMMIT;
