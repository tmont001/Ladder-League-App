-- ══════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260716204307_league_organizers.sql
-- File: supabase/rollback/20260716204307_league_organizers_rollback.sql
--
-- Drops the RPC first, then the table. Order matters: the RPC must
-- be dropped before the table so Postgres does not need to resolve
-- any dependency during the table drop.
--
-- CASCADE is intentionally not used. There are no FK child tables
-- that reference ladder.league_organizers at this stage. Dropping
-- the table removes the RLS policy, grants, and primary-key index
-- automatically as owned objects — no explicit drops are required.
-- If future migrations add FK children, update this rollback before
-- running it.
--
-- WARNING: This permanently deletes all organizer ownership records.
-- Run the orphan verification query in the backfill file first to
-- understand what data will be lost.
--
-- To execute: paste into Supabase SQL Editor and run.
-- ══════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop the SECURITY DEFINER RPC first.
--    Must match the exact parameter type list used in the migration.
DROP FUNCTION IF EXISTS ladder.create_league_for_organizer(
  text, text, text, text, text, text, int, int, boolean
);

-- 2. Drop the ownership table.
--    The RLS policy, grants, and primary-key index are owned by
--    the table and are removed with it automatically.
DROP TABLE IF EXISTS ladder.league_organizers;

COMMIT;
