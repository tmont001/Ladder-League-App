-- ══════════════════════════════════════════════════════════════════
-- CORE SAAS COMPLETION — LOCK-DOWN MIGRATION
-- File: supabase/migrations/20260718130000_core_saas_lockdown.sql
--
-- ⚠  DO NOT EXECUTE UNTIL ALL OF THE FOLLOWING ARE TRUE:
--
--   1. 20260718120000_core_saas_additive.sql has been applied to
--      the target environment.
--
--   2. The updated frontend has been deployed and verified:
--        a. Organizer challenge creation calls create_challenge_for_organizer.
--        b. Player challenge creation calls create_challenge_secure.
--        c. Challenge response calls respond_to_challenge_secure.
--        d. Notification fetch calls fetch_my_notifications RPC.
--        e. Notification mark-read calls mark_my_notifications_read RPC.
--
--   3. All 40 items in the test matrix have passed in the target environment.
--
--   4. addScheduledMatch in LeagueContext has been removed (it used direct
--      matches INSERT and MessengerTab is already excluded from TABS).
--      Revoking matches INSERT without removing this code path would
--      break addScheduledMatch silently.
--
-- What this migration closes:
--   • Direct INSERT on ladder.challenges  — now routed through RPCs.
--   • Direct UPDATE on ladder.challenges  — now routed through RPCs.
--   • Direct INSERT on ladder.notifications — now generated server-side.
--   • Direct UPDATE on ladder.notifications — now routed through RPCs.
--   • Direct INSERT on ladder.matches — the only live browser path was
--     challenge match creation (now inside create_challenge_for_organizer
--     and respond_to_challenge_secure).  addScheduledMatch used this too
--     but that code path has been removed from LeagueContext.
--
-- What this migration does NOT touch:
--   • SELECT on any table — still required for league, match, player display.
--   • UPDATE on ladder.matches — score submission path via RPC already uses
--     UPDATE inside SECURITY DEFINER functions; no direct UPDATE was revoked
--     by prior migrations and none is revoked here.
--   • UPDATE on ladder.players — activity timestamps (last_active_at) and
--     status changes still go direct.
--   • UPDATE on ladder.rankings — rank swaps are still client-side.
--   • EXECUTE on any existing player/organizer RPCs.
--
-- Rollback: supabase/rollback/20260718130000_core_saas_lockdown_rollback.sql
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- ── ladder.challenges ────────────────────────────────────────────
-- INSERT blocked: use create_challenge_secure (player) or
--                 create_challenge_for_organizer (organizer) RPC.
-- UPDATE blocked: use respond_to_challenge_secure RPC.
-- SELECT retained: challenge display in ScheduleTab / StandingsTab.
REVOKE INSERT, UPDATE ON TABLE ladder.challenges
  FROM anon, authenticated;

-- ── ladder.notifications ─────────────────────────────────────────
-- SELECT blocked: cross-player leakage risk; use fetch_my_notifications RPC
--                 which derives player_id from the session token server-side.
-- INSERT blocked: generated server-side by create_notification_internal.
-- UPDATE blocked: use mark_my_notifications_read RPC.
REVOKE SELECT, INSERT, UPDATE ON TABLE ladder.notifications
  FROM anon, authenticated;

-- ── ladder.matches ───────────────────────────────────────────────
-- INSERT blocked: challenge matches are now created atomically inside
--                 create_challenge_for_organizer and
--                 respond_to_challenge_secure.  The initial schedule
--                 is already routed through create_matches_for_organizer.
--                 addScheduledMatch (MessengerTab, dead code) has been
--                 removed from LeagueContext.
-- SELECT retained: schedule display.
-- UPDATE retained: the match lifecycle RPCs (submit/confirm/dispute/resolve)
--                  issue UPDATE inside SECURITY DEFINER; no direct UPDATE
--                  from the browser was ever expected.
REVOKE INSERT ON TABLE ladder.matches
  FROM anon, authenticated;

COMMIT;
