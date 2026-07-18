-- ══════════════════════════════════════════════════════════════════
-- LADDER LEAGUE — CONSOLIDATED DATABASE LOCK-DOWN
-- File: supabase/migrations/20260717160000_consolidated_database_lockdown.sql
--
-- Closes all direct-write paths now replaced by validated SECURITY DEFINER
-- RPCs.  This migration is written against the actual live privilege state
-- (captured 2026-07-17) in which the earlier organizer-revocation migration
-- (20260716220001) was not applied.  All relevant REVOKEs are therefore
-- included here.  REVOKE is idempotent: re-revoking an already-absent
-- privilege is a no-op.
--
-- No RLS policies are dropped.  Table/column privilege revocation is
-- sufficient to block browser roles from exercising those operations;
-- the policies become unreachable and pose no security risk.
--
-- Prerequisites — the following RPCs must be installed before applying:
--   create_league_for_organizer          replaces INSERT, UPDATE on leagues
--   update_league_settings_secure        replaces UPDATE on leagues
--   add_player_for_organizer             replaces INSERT on players
--   add_team_with_members_for_organizer  replaces INSERT on teams / team_members
--   seed_rankings_for_organizer          replaces INSERT on rankings / rank_history
--   submit_match_result_secure           replaces UPDATE on matches (submit)
--   confirm_match_result_secure          replaces UPDATE on matches (confirm)
--   skip_match_secure                    replaces UPDATE on matches (skip)
--   open_match_dispute_secure            replaces INSERT on disputes + UPDATE on matches
--   resolve_dispute_for_organizer        replaces UPDATE on disputes + UPDATE on matches
--   get_player_codes_secure              replaces EXECUTE on legacy get_player_codes
--
-- Paths that remain open after this migration:
--   SELECT on all tables
--   UPDATE on ladder.players (status, last_active_at — updatePlayerStatus / touchPlayerActivity)
--   INSERT on ladder.matches (createMatches — challenge and ad-hoc match creation)
--   SELECT, INSERT, UPDATE on ladder.challenges
--   SELECT, INSERT, UPDATE on ladder.notifications
--   EXECUTE on login_by_token (anon, authenticated)
--   EXECUTE on all secure RPCs (grants set by prior migrations; unchanged here)
--
-- Rollback: supabase/rollback/20260717160000_consolidated_database_lockdown_rollback.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ── ladder.leagues ───────────────────────────────────────────────
-- INSERT → create_league_for_organizer (authenticated only).
-- UPDATE → update_league_settings_secure (authenticated only).
-- SELECT retained: fetchLeague reads directly.
REVOKE INSERT, UPDATE ON TABLE ladder.leagues FROM anon, authenticated;

-- ── ladder.players ───────────────────────────────────────────────
-- INSERT → add_player_for_organizer (authenticated only).
-- Column list matches the exact GRANT from 20260710000000_ladder_schema.sql.
-- SELECT columns and UPDATE columns are NOT revoked:
--   SELECT — embedded joins (fetchTeams) and PostgREST WHERE resolution.
--   UPDATE — updatePlayerStatus (status) and touchPlayerActivity (last_active_at).
REVOKE INSERT (
  league_id, name, rating, rating_type, utr_url,
  role, status, last_active_at, joined_at
) ON TABLE ladder.players FROM anon, authenticated;

-- ── ladder.teams ─────────────────────────────────────────────────
-- INSERT → add_team_with_members_for_organizer (authenticated only).
-- UPDATE → no frontend code issues direct UPDATE on teams; path is orphaned.
-- SELECT retained: fetchTeams reads directly.
REVOKE INSERT ON TABLE ladder.teams FROM anon, authenticated;
REVOKE UPDATE ON TABLE ladder.teams FROM anon, authenticated;

-- ── ladder.team_members ──────────────────────────────────────────
-- INSERT → add_team_with_members_for_organizer (atomic with teams insert).
-- UPDATE → no frontend code issues direct UPDATE on team_members; path is orphaned.
-- SELECT retained: fetchTeams JOIN.
REVOKE INSERT ON TABLE ladder.team_members FROM anon, authenticated;
REVOKE UPDATE ON TABLE ladder.team_members FROM anon, authenticated;

-- ── ladder.rankings ──────────────────────────────────────────────
-- INSERT → seed_rankings_for_organizer (authenticated only).
-- UPDATE → no frontend code issues direct UPDATE on rankings after initial seed.
--   Rank mutations inside SECURITY DEFINER RPCs use the function owner's
--   privileges; direct UPDATE from browser roles is orphaned.
-- SELECT retained: fetchRankings reads directly.
REVOKE INSERT ON TABLE ladder.rankings FROM anon, authenticated;
REVOKE UPDATE ON TABLE ladder.rankings FROM anon, authenticated;

-- ── ladder.rank_history ──────────────────────────────────────────
-- INSERT → seed_rankings_for_organizer (and future SECURITY DEFINER RPCs that
--   append rank_history entries internally).
-- No UPDATE was ever granted on this table.
-- SELECT retained for audit reads.
REVOKE INSERT ON TABLE ladder.rank_history FROM anon, authenticated;

-- ── ladder.matches ───────────────────────────────────────────────
-- INSERT retained: createMatches (direct insert used by the challenge flow).
-- UPDATE → all four match-lifecycle state transitions are now RPCs:
--   submit_match_result_secure  → awaiting_confirmation
--   confirm_match_result_secure → confirmed
--   skip_match_secure           → skipped
--   open_match_dispute_secure   → disputed
--   resolve_dispute_for_organizer → confirmed (dispute override)
-- All are SECURITY DEFINER and do not require the anon/authenticated UPDATE grant.
REVOKE UPDATE ON TABLE ladder.matches FROM anon, authenticated;

-- ── ladder.disputes ──────────────────────────────────────────────
-- INSERT → open_match_dispute_secure (SECURITY DEFINER).
-- UPDATE → resolve_dispute_for_organizer (SECURITY DEFINER).
-- SELECT retained: fetchDispute reads directly.
REVOKE INSERT ON TABLE ladder.disputes FROM anon, authenticated;
REVOKE UPDATE ON TABLE ladder.disputes FROM anon, authenticated;

-- ── Legacy get_player_codes RPC ──────────────────────────────────
-- Replaced by get_player_codes_secure, which requires an organizer JWT
-- (authenticated role + assert_league_organizer ownership check).
-- The legacy function body is unchanged; only the EXECUTE grant is removed
-- so existing installations are not broken if the function is later re-used.
REVOKE EXECUTE ON FUNCTION ladder.get_player_codes(uuid) FROM anon, authenticated;

COMMIT;
