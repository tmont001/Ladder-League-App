-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260717160000_consolidated_database_lockdown.sql
-- ══════════════════════════════════════════════════════════════════
--
-- Restores exactly the privileges revoked by the lock-down migration.
-- The grant list below was derived from the verified live pre-state
-- captured on 2026-07-17, in which:
--   • the earlier organizer-revocation migration (20260716220001) had
--     not been applied, so all base-schema table grants were still present
--   • all player INSERT column grants were confirmed present
--   • get_player_codes(uuid) had EXECUTE for anon and authenticated
--
-- No RLS policies are recreated because none were dropped by the migration.
--
-- WARNING: Running this rollback re-opens direct write paths that the RPCs
-- are designed to replace.  Pair this rollback with a frontend revert.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

GRANT INSERT, UPDATE ON ladder.leagues TO anon, authenticated;

GRANT INSERT (
  league_id, name, rating, rating_type, utr_url,
  role, status, last_active_at, joined_at
) ON TABLE ladder.players TO anon, authenticated;

GRANT INSERT ON ladder.teams TO anon, authenticated;
GRANT UPDATE ON ladder.teams TO anon, authenticated;

GRANT INSERT ON ladder.team_members TO anon, authenticated;
GRANT UPDATE ON ladder.team_members TO anon, authenticated;

GRANT INSERT ON ladder.rankings TO anon, authenticated;
GRANT UPDATE ON ladder.rankings TO anon, authenticated;

GRANT INSERT ON ladder.rank_history TO anon, authenticated;

GRANT UPDATE ON ladder.matches TO anon, authenticated;

GRANT INSERT ON ladder.disputes TO anon, authenticated;
GRANT UPDATE ON ladder.disputes TO anon, authenticated;

GRANT EXECUTE ON FUNCTION ladder.get_player_codes(uuid) TO anon, authenticated;

COMMIT;
