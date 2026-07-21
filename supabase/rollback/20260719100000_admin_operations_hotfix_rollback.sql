-- ══════════════════════════════════════════════════════════════════
-- ADMIN OPERATIONS HOTFIX — ROLLBACK
-- File: supabase/rollback/20260719100000_admin_operations_hotfix_rollback.sql
--
-- Reverts 20260719100000_admin_operations_hotfix.sql.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS ladder.record_match_result_for_organizer(uuid, jsonb);
DROP FUNCTION IF EXISTS ladder.delete_league_for_organizer(uuid, text);

COMMIT;
