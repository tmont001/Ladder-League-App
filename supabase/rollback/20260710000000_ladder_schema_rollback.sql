-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
-- WARNING — DESTRUCTIVE AND PERMANENTLY IRREVERSIBLE
--
-- Running this script will destroy ALL Ladder League data, including
-- every league, player, match, challenge, ranking, rank history entry,
-- dispute, notification, and team that has ever been created.
--
-- There is NO undo.  Deleted rows cannot be recovered.
--
-- Before running this script you MUST:
--   1. Go to Supabase Dashboard → Database → Backups
--   2. Trigger a manual backup and confirm the download completes
--   3. Verify the backup can be restored in a test environment
--   4. Obtain explicit sign-off from the project owner
--
-- Intended use cases (only):
--   • Tearing down a test or staging environment with no real data
--   • A full reset after the backup above has been verified
--
-- This script does NOT touch public, auth, storage, realtime,
-- extensions, or any other existing schema.  The Tennis Coach
-- application is completely unaffected.
-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

-- Remove from Realtime publication first (prevents orphaned listeners)
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS ladder.matches;
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS ladder.challenges;

-- Revoke function execution grants
REVOKE ALL ON FUNCTION ladder.login_by_token(text)   FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION ladder.get_player_codes(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Drop functions
DROP FUNCTION IF EXISTS ladder.login_by_token(text);
DROP FUNCTION IF EXISTS ladder.get_player_codes(uuid);

-- Drop view
DROP VIEW IF EXISTS ladder.players_public;

-- Revoke schema and table grants
REVOKE ALL ON ladder.rank_history  FROM anon, authenticated, service_role;
REVOKE ALL ON ladder.notifications FROM anon, authenticated, service_role;
REVOKE ALL ON ladder.disputes      FROM anon, authenticated, service_role;
REVOKE ALL ON ladder.challenges    FROM anon, authenticated, service_role;
REVOKE ALL ON ladder.matches       FROM anon, authenticated, service_role;
REVOKE ALL ON ladder.rankings      FROM anon, authenticated, service_role;
REVOKE ALL ON ladder.team_members  FROM anon, authenticated, service_role;
REVOKE ALL ON ladder.teams         FROM anon, authenticated, service_role;
REVOKE ALL ON ladder.players       FROM anon, authenticated, service_role;
REVOKE ALL ON ladder.leagues       FROM anon, authenticated, service_role;
REVOKE USAGE ON SCHEMA ladder      FROM anon, authenticated, service_role;

-- Drop tables in reverse FK-dependency order.
-- CASCADE removes all indexes, constraints, triggers, and RLS policies
-- attached to each table automatically.
DROP TABLE IF EXISTS ladder.rank_history  CASCADE;
DROP TABLE IF EXISTS ladder.notifications CASCADE;
DROP TABLE IF EXISTS ladder.disputes      CASCADE;
DROP TABLE IF EXISTS ladder.challenges    CASCADE;
DROP TABLE IF EXISTS ladder.matches       CASCADE;
DROP TABLE IF EXISTS ladder.rankings      CASCADE;
DROP TABLE IF EXISTS ladder.team_members  CASCADE;
DROP TABLE IF EXISTS ladder.teams         CASCADE;
DROP TABLE IF EXISTS ladder.players       CASCADE;
DROP TABLE IF EXISTS ladder.leagues       CASCADE;

-- Drop the schema shell.
-- Comment this line out if you intend to re-run the migration
-- immediately after (the migration uses CREATE SCHEMA IF NOT EXISTS).
DROP SCHEMA IF EXISTS ladder;
