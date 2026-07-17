-- ══════════════════════════════════════════════════════════════════
-- BACKFILL: league_organizers for existing leagues
-- File: supabase/backfill/league_organizers_backfill.sql
--
-- DO NOT EXECUTE THIS SCRIPT BLINDLY.
-- Each part must be run, reviewed, and acted on individually.
--
-- Workflow:
--   STEP 1 — Run Part 1 to see every league and whether it already
--             has an organizer row.
--   STEP 2 — Run Part 2 to see which Supabase Auth users exist.
--   STEP 3 — Edit Part 3: replace the placeholder UUIDs with the
--             reviewed league IDs and the correct organizer auth.uid().
--             Run Part 3 to insert ownership rows.
--   STEP 4 — Run Part 4 to verify no leagues are orphaned and
--             to confirm the rollback IDs if needed.
-- ══════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────
-- PART 1 — Audit all leagues
--
-- Review every league: ID, name, creation date, player count,
-- match count, and whether it already has an organizer row.
-- Leagues with has_organizer = true are already covered (either by
-- prior backfill or by the new create_league_for_organizer RPC).
-- ─────────────────────────────────────────────────────────────────

SELECT
  l.id,
  l.name,
  l.created_at,
  (SELECT COUNT(*) FROM ladder.players  p WHERE p.league_id = l.id) AS player_count,
  (SELECT COUNT(*) FROM ladder.matches  m WHERE m.league_id = l.id) AS match_count,
  EXISTS (
    SELECT 1 FROM ladder.league_organizers lo WHERE lo.league_id = l.id
  ) AS has_organizer
FROM ladder.leagues l
ORDER BY l.created_at;


-- ─────────────────────────────────────────────────────────────────
-- PART 2 — Identify existing Supabase Auth users
--
-- Determine the auth.uid() to use as the organizer for existing
-- leagues. This query must be run in the Supabase SQL Editor (not
-- via a client RPC) because it reads auth.users directly.
-- ─────────────────────────────────────────────────────────────────

SELECT id, email, created_at
FROM auth.users
ORDER BY created_at;


-- ─────────────────────────────────────────────────────────────────
-- PART 3 — Insert ownership rows (explicit list only)
--
-- BEFORE RUNNING:
--   • Replace 'REPLACE_WITH_AUTH_UID' with the UUID from Part 2.
--   • Replace each 'REPLACE_WITH_LEAGUE_UUID_N' with a league UUID
--     from the Part 1 output that has has_organizer = false.
--   • Remove placeholder rows that you do not intend to backfill.
--   • Add one VALUES row per league you are assigning.
--   • Do NOT use a SELECT or loop — ownership is a deliberate
--     per-league decision, not an automatic assignment.
--
-- ON CONFLICT DO NOTHING makes this idempotent: re-running after a
-- partial failure will not duplicate rows.
-- ─────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_organizer_id uuid := 'REPLACE_WITH_AUTH_UID';
BEGIN
  -- Guard: abort if the organizer user does not exist in auth.users.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_organizer_id) THEN
    RAISE EXCEPTION 'Organizer user not found in auth.users: %', v_organizer_id;
  END IF;

  -- Insert only the league UUIDs you have explicitly reviewed above.
  -- Remove these placeholder rows and replace with real IDs.
  INSERT INTO ladder.league_organizers (league_id, user_id)
  VALUES
    ('REPLACE_WITH_LEAGUE_UUID_1', v_organizer_id),
    ('REPLACE_WITH_LEAGUE_UUID_2', v_organizer_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Backfill complete. Verify with Part 4.';
END;
$$;


-- ─────────────────────────────────────────────────────────────────
-- PART 4 — Verify and prepare rollback
--
-- A. Orphan check: leagues that still have no organizer row after
--    the backfill. Any row here is either intentionally unassigned
--    or was missed — review before closing the task.
--
-- B. Rollback query: delete only the rows inserted in Part 3.
--    Paste the same league UUIDs from Part 3 before running.
--    The ON CONFLICT DO NOTHING in Part 3 means rows that existed
--    before the backfill are NOT removed by this rollback.
-- ─────────────────────────────────────────────────────────────────

-- A. Orphan verification
SELECT
  l.id,
  l.name,
  l.created_at,
  (SELECT COUNT(*) FROM ladder.players p WHERE p.league_id = l.id) AS player_count
FROM ladder.leagues l
WHERE NOT EXISTS (
  SELECT 1 FROM ladder.league_organizers lo WHERE lo.league_id = l.id
)
ORDER BY l.created_at;


-- B. Rollback (do NOT run this unless rolling back the backfill)
--    Replace the UUIDs with the exact list used in Part 3.
/*
DELETE FROM ladder.league_organizers
WHERE league_id IN (
  'REPLACE_WITH_LEAGUE_UUID_1',
  'REPLACE_WITH_LEAGUE_UUID_2'
)
AND user_id = 'REPLACE_WITH_AUTH_UID';
*/
