-- ─────────────────────────────────────────────────────────────────────────────
-- Rollback : 20260717140000_secure_player_match_lifecycle
-- Run this BEFORE applying the consolidated lock-down migration rollback
-- (when both have been applied).
-- DROP IF EXISTS is safe — functions that were never created are silently skipped.
-- CASCADE is intentionally omitted: no dependent objects should exist on these
-- internal/RPC functions.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP FUNCTION IF EXISTS ladder.resolve_dispute_for_organizer(uuid, text);
DROP FUNCTION IF EXISTS ladder.open_match_dispute_secure(text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS ladder.confirm_match_result_secure(text, uuid);
DROP FUNCTION IF EXISTS ladder.submit_match_result_secure(text, uuid, jsonb);
DROP FUNCTION IF EXISTS ladder.validate_match_result_payload(uuid, jsonb);
DROP FUNCTION IF EXISTS ladder.get_match_participant_side(uuid, uuid);
DROP FUNCTION IF EXISTS ladder.resolve_player_from_token(text);

COMMIT;
