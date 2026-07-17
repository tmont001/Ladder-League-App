-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK: REVOCATION OF ORGANIZER DIRECT-INSERT PATHS
-- File: supabase/rollback/20260716220001_revoke_organizer_direct_paths_rollback.sql
--
-- Restores exactly the grants removed by
-- 20260716220001_revoke_organizer_direct_paths.sql.
--
-- Run this if the revocation migration needs to be undone.  After
-- applying this rollback the legacy direct-INSERT paths work again
-- and the frontend can be reverted to the pre-RPC version.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

GRANT INSERT, UPDATE ON TABLE ladder.leagues TO anon, authenticated;

GRANT INSERT (
  league_id, name, rating, rating_type, utr_url,
  role, status, last_active_at, joined_at
) ON TABLE ladder.players TO anon, authenticated;

GRANT INSERT ON TABLE ladder.teams         TO anon, authenticated;
GRANT INSERT ON TABLE ladder.team_members  TO anon, authenticated;
GRANT INSERT ON TABLE ladder.rankings      TO anon, authenticated;
GRANT INSERT ON TABLE ladder.rank_history  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION ladder.get_player_codes(uuid) TO anon, authenticated;

COMMIT;
