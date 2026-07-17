-- ══════════════════════════════════════════════════════════════════
-- REVOCATION OF ORGANIZER DIRECT-INSERT PATHS
-- File: supabase/migrations/20260716220001_revoke_organizer_direct_paths.sql
--
-- ⚠  DO NOT EXECUTE UNTIL ALL OF THE FOLLOWING ARE TRUE:
--
--   1. 20260716220000_secure_organizer_operations.sql is applied.
--   2. Frontend tests A–M in the manual test checklist all pass.
--   3. createLeague in src/lib/db.js calls the
--      create_league_for_organizer RPC (confirmed — direct INSERT
--      was replaced in the organizer-auth-foundation milestone).
--      Revoking INSERT on ladder.leagues without this would break
--      league creation.
--   4. Challenge/scheduled match creation in LeagueContext still uses
--      direct INSERT on ladder.matches (a known gap — see below).
--      Do NOT revoke INSERT on ladder.matches until player-action
--      creation is moved to a validated RPC.
--
-- What this migration does:
--   • Closes browser-direct INSERT paths for organizer-controlled tables.
--   • Revokes the unguarded legacy get_player_codes RPC from all
--     browser roles (replaced by get_player_codes_secure).
--   • Does NOT revoke:
--       - SELECT on any table (needed for league/player display)
--       - UPDATE on ladder.matches (score submission, confirmation)
--       - UPDATE on ladder.players (activity timestamps, status)
--       - UPDATE on ladder.rankings (rank swaps after match results)
--       - INSERT on ladder.matches — KNOWN REMAINING GAP:
--           Player challenge creation (LeagueContext.createChallenge)
--           and messenger-scheduled matches (addScheduledMatch) use
--           direct INSERT on ladder.matches.  This INSERT cannot be
--           revoked until those player actions are moved to ownership-
--           validated RPCs in the player-action security milestone.
--           Until then, any authenticated user can INSERT into
--           ladder.matches for any league_id.
--       - INSERT on ladder.challenges / disputes / notifications
--       - EXECUTE on ladder.login_by_token
--
-- Rollback: apply 20260716220001_revoke_organizer_direct_paths_rollback.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ── ladder.leagues ───────────────────────────────────────────────
-- Pre-condition: createLeague in db.js must call create_league_for_organizer.
-- INSERT blocked: use create_league_for_organizer RPC.
-- UPDATE blocked: use update_league_settings_secure RPC.
-- SELECT retained: public league display.
REVOKE INSERT, UPDATE ON TABLE ladder.leagues FROM anon, authenticated;

-- ── ladder.players ───────────────────────────────────────────────
-- INSERT blocked: use add_player_for_organizer RPC.
-- Column-level INSERT grant revoked by specifying the exact column list
-- that was granted in 20260710000000_ladder_schema.sql.
-- SELECT and UPDATE column grants are NOT revoked (player activity).
REVOKE INSERT (
  league_id, name, rating, rating_type, utr_url,
  role, status, last_active_at, joined_at
) ON TABLE ladder.players FROM anon, authenticated;

-- ── ladder.teams ─────────────────────────────────────────────────
-- INSERT blocked: use add_team_with_members_for_organizer RPC.
-- SELECT retained for team display; UPDATE retained for future use.
REVOKE INSERT ON TABLE ladder.teams FROM anon, authenticated;

-- ── ladder.team_members ──────────────────────────────────────────
-- INSERT blocked: created atomically inside add_team_with_members_for_organizer.
REVOKE INSERT ON TABLE ladder.team_members FROM anon, authenticated;

-- ── ladder.rankings ──────────────────────────────────────────────
-- INSERT blocked: use seed_rankings_for_organizer RPC.
-- UPDATE retained for rank swaps during match result processing.
REVOKE INSERT ON TABLE ladder.rankings FROM anon, authenticated;

-- ── ladder.rank_history ──────────────────────────────────────────
-- INSERT blocked: created inside seed_rankings_for_organizer.
-- No UPDATE was ever granted on this table.
REVOKE INSERT ON TABLE ladder.rank_history FROM anon, authenticated;

-- ── legacy get_player_codes RPC ──────────────────────────────────
-- Revoke from all browser roles.  The replacement is get_player_codes_secure
-- which requires organizer ownership verification via assert_league_organizer.
REVOKE EXECUTE ON FUNCTION ladder.get_player_codes(uuid) FROM anon, authenticated;

COMMIT;
