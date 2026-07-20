-- ══════════════════════════════════════════════════════════════════
-- CORE SAAS COMPLETION — LOCK-DOWN ROLLBACK
-- File: supabase/rollback/20260718130000_core_saas_lockdown_rollback.sql
--
-- Reverts 20260718130000_core_saas_lockdown.sql by restoring the direct
-- INSERT / UPDATE paths that the lockdown closed.
--
-- ⚠  APPLY THIS ROLLBACK BEFORE rolling back the additive migration.
--    The additive RPCs depend on the lockdown not being in effect to
--    allow the old direct-write paths to continue working.
--
-- ⚠  After applying this rollback, the frontend must also be rolled back
--    to a version that uses direct DB writes for challenges and
--    notifications.  The RPC-based frontend will still work (the RPCs
--    remain deployed), but the old frontend version needs direct access.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- Restore direct INSERT/UPDATE on challenges
GRANT INSERT, UPDATE ON TABLE ladder.challenges
  TO anon, authenticated;

-- Restore direct SELECT/INSERT/UPDATE on notifications
GRANT SELECT, INSERT, UPDATE ON TABLE ladder.notifications
  TO anon, authenticated;

-- Restore direct INSERT on matches
GRANT INSERT ON TABLE ladder.matches
  TO anon, authenticated;

COMMIT;
