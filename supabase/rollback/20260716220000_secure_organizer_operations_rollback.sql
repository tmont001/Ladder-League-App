-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK: SECURE ORGANIZER OPERATIONS
-- File: supabase/rollback/20260716220000_secure_organizer_operations_rollback.sql
--
-- Drops every function created by
-- 20260716220000_secure_organizer_operations.sql.
--
-- CASCADE is intentionally NOT used — these functions have no
-- dependent objects (no views, no triggers, no other functions that
-- reference them by OID).  DROP without CASCADE ensures we do not
-- accidentally remove anything unexpected.
--
-- ⚠  FRONTEND DEPLOYMENT REQUIRED:
--    Dropping these RPCs makes the current frontend immediately
--    inoperable — every supabase.rpc() call in src/lib/db.js that
--    targets one of these functions will fail with "function does not
--    exist."  You MUST deploy the prior frontend version
--    (pre-RPC db.js) simultaneously with or before applying this
--    rollback, or schedule a maintenance window.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS ladder.skip_match_secure(uuid);
DROP FUNCTION IF EXISTS ladder.update_league_settings_secure(uuid, text, text, text, int, boolean);
DROP FUNCTION IF EXISTS ladder.get_player_codes_secure(uuid);
-- Note: signature is (uuid, jsonb) — p_is_doubles was removed and is
-- now derived from ladder.leagues inside the function body.
DROP FUNCTION IF EXISTS ladder.seed_rankings_for_organizer(uuid, jsonb);
DROP FUNCTION IF EXISTS ladder.create_matches_for_organizer(uuid, jsonb);
DROP FUNCTION IF EXISTS ladder.add_team_with_members_for_organizer(uuid, uuid[]);
DROP FUNCTION IF EXISTS ladder.add_player_for_organizer(uuid, text, text, text, text, text);
DROP FUNCTION IF EXISTS ladder.assert_league_organizer(uuid);

COMMIT;
