-- ══════════════════════════════════════════════════════════════════
-- LADDER LEAGUE — SCHEMA MIGRATION
-- File: supabase/migrations/20260710000000_ladder_schema.sql
--
-- Creates every Ladder League object inside the pre-existing `ladder`
-- schema.  Nothing in public, auth, storage, realtime, extensions, or
-- any other existing schema is touched.
--
-- Prerequisites (manual, BEFORE running this file):
--   • The `ladder` schema must already exist in the Supabase project.
--     CREATE SCHEMA IF NOT EXISTS ladder;   ← run once if needed
--
-- Post-migration manual steps (BEFORE updating application code):
--   1. Supabase Dashboard → Settings → API → Extra schemas
--      to expose via PostgREST → add "ladder"
--   2. Supabase Dashboard → Database → Replication → supabase_realtime
--      → enable ladder.matches and ladder.challenges
--      (OR run the two ALTER PUBLICATION statements at the bottom of
--       this file if your Supabase plan allows SQL access to publications)
--
-- This file is rerunnable: every CREATE is guarded with IF NOT EXISTS,
-- every CREATE POLICY is preceded by DROP POLICY IF EXISTS.
-- ══════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS ladder;

-- ─────────────────────────────────────────────────────────────────
-- TABLES
-- Creation order respects all foreign-key dependencies.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ladder.leagues (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text        NOT NULL,
  sport                       text        NOT NULL
    CHECK (sport IN ('tennis', 'pickleball')),
  mode                        text        NOT NULL
    CHECK (mode IN ('round_robin', 'ladder')) DEFAULT 'round_robin',
  singles_or_doubles          text        NOT NULL
    CHECK (singles_or_doubles IN ('singles', 'doubles')) DEFAULT 'singles',
  format                      text        NOT NULL DEFAULT 'best_of_3',
  third_set_format            text        NOT NULL DEFAULT 'full_set',
  rounds                      int         NOT NULL DEFAULT 6,
  challenge_spots             int         NOT NULL DEFAULT 2,
  auto_advance                boolean     NOT NULL DEFAULT true,
  challenge_cooldown_days     int         NOT NULL DEFAULT 3,
  match_expiry_days           int         NOT NULL DEFAULT 14,
  rematch_lock_days           int         NOT NULL DEFAULT 7,
  max_active_challenges       int         NOT NULL DEFAULT 1,
  no_response_days            int         NOT NULL DEFAULT 5,
  decline_penalty_enabled     boolean     NOT NULL DEFAULT false,
  protection_after_match_days int         NOT NULL DEFAULT 2,
  movement_type               text        NOT NULL
    CHECK (movement_type IN ('swap', 'take_spot', 'halfway')) DEFAULT 'swap',
  inactivity_warning_days     int         NOT NULL DEFAULT 14,
  inactivity_drop_days        int         NOT NULL DEFAULT 30,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ladder.players (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id      uuid        NOT NULL
    REFERENCES ladder.leagues(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  rating         text,
  rating_type    text        CHECK (rating_type IN ('USTA', 'UTR')),
  utr_url        text,
  -- session_token is the sole player credential for Phase 1.
  -- Column-level privileges (GRANTS section) prevent anon/authenticated
  -- from SELECTing, INSERTing with, or UPDATEing this column directly.
  -- All token access is mediated through SECURITY DEFINER functions.
  -- The UNIQUE constraint implicitly creates the lookup index;
  -- no separate CREATE INDEX for session_token is needed or created.
  session_token  text        UNIQUE NOT NULL
    DEFAULT substr(md5(random()::text), 1, 12),
  role           text        NOT NULL
    CHECK (role IN ('player', 'admin')) DEFAULT 'player',
  status         text        NOT NULL
    CHECK (status IN ('active', 'inactive', 'frozen', 'dropped')) DEFAULT 'active',
  last_active_at timestamptz NOT NULL DEFAULT now(),
  joined_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ladder.teams (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL
    REFERENCES ladder.leagues(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ladder.team_members (
  team_id   uuid NOT NULL REFERENCES ladder.teams(id)   ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES ladder.players(id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, player_id)
);

CREATE TABLE IF NOT EXISTS ladder.rankings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  uuid        NOT NULL
    REFERENCES ladder.leagues(id) ON DELETE CASCADE,
  player_id  uuid        REFERENCES ladder.players(id) ON DELETE CASCADE,
  team_id    uuid        REFERENCES ladder.teams(id)   ON DELETE CASCADE,
  rank       int         NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),

  -- Exactly one participant type must be set.
  CONSTRAINT ladder_rankings_participant_check CHECK (
    (player_id IS NOT NULL AND team_id IS NULL) OR
    (player_id IS NULL     AND team_id IS NOT NULL)
  ),

  -- Each rank position is unique within a league.
  -- DEFERRABLE allows multi-row rank swaps in one transaction:
  --   SET CONSTRAINTS ladder_rankings_league_rank_unique DEFERRED;
  --   UPDATE ...  -- swap rank A → B
  --   UPDATE ...  -- swap rank B → A
  --   COMMIT;     -- constraint checked here, not after each statement
  CONSTRAINT ladder_rankings_league_rank_unique
    UNIQUE (league_id, rank) DEFERRABLE INITIALLY IMMEDIATE
);

-- Each player appears at most once in a league's current standings.
CREATE UNIQUE INDEX IF NOT EXISTS ladder_rankings_league_player_uq
  ON ladder.rankings (league_id, player_id)
  WHERE player_id IS NOT NULL;

-- Each team appears at most once in a league's current standings.
CREATE UNIQUE INDEX IF NOT EXISTS ladder_rankings_league_team_uq
  ON ladder.rankings (league_id, team_id)
  WHERE team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ladder.matches (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id          uuid        NOT NULL
    REFERENCES ladder.leagues(id) ON DELETE CASCADE,
  round_number       int,
  type               text        NOT NULL
    CHECK (type IN ('scheduled', 'challenge')) DEFAULT 'scheduled',
  is_bye             boolean     NOT NULL DEFAULT false,
  -- Singles: p1_player_id / p2_player_id
  -- Doubles: p1_team_id  / p2_team_id
  p1_player_id       uuid        REFERENCES ladder.players(id),
  p2_player_id       uuid        REFERENCES ladder.players(id),
  p1_team_id         uuid        REFERENCES ladder.teams(id),
  p2_team_id         uuid        REFERENCES ladder.teams(id),
  status             text        NOT NULL CHECK (status IN (
    'pending', 'awaiting_confirmation', 'confirmed', 'disputed', 'skipped'
  )) DEFAULT 'pending',
  -- { winnerId, setScores, p1Sets, p2Sets, p1Games, p2Games }
  result             jsonb,
  submitted_by       uuid        REFERENCES ladder.players(id),
  submitted_at       timestamptz,
  confirmed_by       uuid        REFERENCES ladder.players(id),
  confirmed_at       timestamptz,
  auto_confirm_after timestamptz,
  expires_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),

  -- Participant mode must be internally consistent.
  -- Mixed modes (e.g. p1 is a player, p2 is a team) are rejected.
  CONSTRAINT ladder_matches_participant_mode CHECK (
    -- Singles, non-bye: both player IDs present, no team IDs
    (is_bye = false
     AND p1_player_id IS NOT NULL AND p2_player_id IS NOT NULL
     AND p1_team_id   IS NULL     AND p2_team_id   IS NULL)
    OR
    -- Doubles, non-bye: both team IDs present, no player IDs
    (is_bye = false
     AND p1_team_id   IS NOT NULL AND p2_team_id   IS NOT NULL
     AND p1_player_id IS NULL     AND p2_player_id IS NULL)
    OR
    -- Singles bye: p1 player only; p2 and all team IDs absent
    (is_bye = true
     AND p1_player_id IS NOT NULL AND p2_player_id IS NULL
     AND p1_team_id   IS NULL     AND p2_team_id   IS NULL)
    OR
    -- Doubles bye: p1 team only; p2 and all player IDs absent
    (is_bye = true
     AND p1_team_id   IS NOT NULL AND p2_team_id   IS NULL
     AND p1_player_id IS NULL     AND p2_player_id IS NULL)
  ),

  -- A player or team cannot be matched against itself.
  CONSTRAINT ladder_matches_no_self_play CHECK (
    (p1_player_id IS NULL OR p2_player_id IS NULL
     OR p1_player_id <> p2_player_id)
    AND
    (p1_team_id IS NULL OR p2_team_id IS NULL
     OR p1_team_id <> p2_team_id)
  )
);

CREATE TABLE IF NOT EXISTS ladder.challenges (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id            uuid        NOT NULL
    REFERENCES ladder.leagues(id) ON DELETE CASCADE,
  challenger_player_id uuid        REFERENCES ladder.players(id),
  challenged_player_id uuid        REFERENCES ladder.players(id),
  challenger_team_id   uuid        REFERENCES ladder.teams(id),
  challenged_team_id   uuid        REFERENCES ladder.teams(id),
  status               text        NOT NULL CHECK (status IN (
    'pending', 'accepted', 'declined', 'expired', 'cancelled'
  )) DEFAULT 'pending',
  match_id             uuid        REFERENCES ladder.matches(id),
  decline_reason       text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  expires_at           timestamptz NOT NULL DEFAULT (now() + INTERVAL '5 days'),

  -- Challenge must be player-vs-player or team-vs-team; no mixed mode.
  CONSTRAINT ladder_challenges_participant_mode CHECK (
    (challenger_player_id IS NOT NULL AND challenged_player_id IS NOT NULL
     AND challenger_team_id IS NULL   AND challenged_team_id   IS NULL)
    OR
    (challenger_team_id   IS NOT NULL AND challenged_team_id   IS NOT NULL
     AND challenger_player_id IS NULL AND challenged_player_id IS NULL)
  ),

  -- A player or team cannot challenge itself.
  CONSTRAINT ladder_challenges_no_self_challenge CHECK (
    (challenger_player_id IS NULL
     OR challenger_player_id <> challenged_player_id)
    AND
    (challenger_team_id IS NULL
     OR challenger_team_id <> challenged_team_id)
  )
);

CREATE TABLE IF NOT EXISTS ladder.disputes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id            uuid        NOT NULL
    REFERENCES ladder.matches(id) ON DELETE CASCADE,
  opened_by           uuid        NOT NULL REFERENCES ladder.players(id),
  reason              text        NOT NULL,
  counter_score       jsonb,
  status              text        NOT NULL CHECK (status IN (
    'open', 'counter_submitted', 'escalated', 'resolved'
  )) DEFAULT 'open',
  resolved_by         uuid        REFERENCES ladder.players(id),
  resolution          text,
  opened_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at         timestamptz,
  auto_escalate_after timestamptz
);

CREATE TABLE IF NOT EXISTS ladder.notifications (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id            uuid        REFERENCES ladder.leagues(id)  ON DELETE CASCADE,
  player_id            uuid        NOT NULL
    REFERENCES ladder.players(id) ON DELETE CASCADE,
  type                 text        NOT NULL,
  message              text        NOT NULL,
  read                 boolean     NOT NULL DEFAULT false,
  related_match_id     uuid        REFERENCES ladder.matches(id),
  related_challenge_id uuid        REFERENCES ladder.challenges(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ladder.rank_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     uuid        NOT NULL
    REFERENCES ladder.leagues(id) ON DELETE CASCADE,
  player_id     uuid        REFERENCES ladder.players(id),
  team_id       uuid        REFERENCES ladder.teams(id),
  rank          int         NOT NULL,
  previous_rank int,
  reason        text,   -- 'match_result' | 'admin_override' | 'initial_seeding'
  match_id      uuid    REFERENCES ladder.matches(id),
  recorded_at   timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────
-- VIEW — public player listing
--
-- security_invoker = true means the view executes with the caller's
-- privileges, not the owner's.  When anon queries players_public, the
-- underlying access to ladder.players runs under anon's column-level
-- grant (which excludes session_token).  This prevents the view from
-- being used as a privilege-escalation path to expose session_token.
--
-- The application's fetchPlayers() and all normal player-listing paths
-- MUST query this view, not the base table.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW ladder.players_public
  WITH (security_invoker = true)
AS
SELECT
  id, league_id, name, rating, rating_type, utr_url,
  role, status, last_active_at, joined_at
FROM ladder.players;

-- ─────────────────────────────────────────────────────────────────
-- SECURITY DEFINER FUNCTIONS
--
-- Both functions run with the privileges of the function owner
-- (the migration role / postgres), bypassing the column-level
-- restriction on session_token for anon/authenticated.
--
-- SET search_path = ladder prevents search-path injection: a malicious
-- caller cannot shadow ladder objects by manipulating their search_path.
--
-- PUBLIC execution rights are revoked immediately after creation, then
-- granted only to the roles that need them.
-- ─────────────────────────────────────────────────────────────────

-- login_by_token
-- Replaces the direct .eq('session_token', token) query that anon can
-- no longer execute.  Returns the full player row — including
-- session_token — to the caller who already possesses it.
-- Returns zero rows when the token does not exist (never throws).
CREATE OR REPLACE FUNCTION ladder.login_by_token(p_token text)
RETURNS TABLE (
  id             uuid,
  league_id      uuid,
  name           text,
  rating         text,
  rating_type    text,
  utr_url        text,
  session_token  text,
  role           text,
  status         text,
  last_active_at timestamptz,
  joined_at      timestamptz
)
SECURITY DEFINER
SET search_path = ladder
LANGUAGE sql
STABLE
AS $$
  SELECT id, league_id, name, rating, rating_type, utr_url, session_token,
         role, status, last_active_at, joined_at
  FROM   ladder.players
  WHERE  session_token = p_token
  LIMIT  1;
$$;

REVOKE ALL ON FUNCTION ladder.login_by_token(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION ladder.login_by_token(text) TO anon, authenticated;

-- get_player_codes
-- Returns tokens for every player in one league.  Used exclusively by
-- LaunchCodesScreen (immediately after creation) and PlayersPanel
-- (organizer code sheet in the dashboard).
--
-- ⚠ SECURITY LIMITATION: callable by any anon client that knows the
-- league UUID.  The database cannot verify that the caller is the
-- organizer — the localStorage organizer flag is invisible to the DB.
-- This cannot be fixed until Supabase Auth provides a verifiable JWT
-- claim.  It is a named, auditable RPC endpoint rather than a raw
-- column exposure; revoke EXECUTE here when real auth is added.
CREATE OR REPLACE FUNCTION ladder.get_player_codes(p_league_id uuid)
RETURNS TABLE (
  id            uuid,
  name          text,
  role          text,
  session_token text
)
SECURITY DEFINER
SET search_path = ladder
LANGUAGE sql
STABLE
AS $$
  SELECT id, name, role, session_token
  FROM   ladder.players
  WHERE  league_id = p_league_id
  ORDER  BY joined_at;
$$;

REVOKE ALL ON FUNCTION ladder.get_player_codes(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION ladder.get_player_codes(uuid) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────
-- ROW-LEVEL SECURITY
--
-- RLS is enabled on every table.
--
-- All policies use USING (true) / WITH CHECK (true).  This is the
-- honest and correct choice for a private MVP that uses session-token
-- auth: every request arrives as the `anon` role; there is no
-- auth.uid() to filter by.  The policies declare intent and block
-- paths not granted (especially DELETE), but do not provide row-level
-- isolation.  Tighten these when Supabase Auth is added.
--
-- DELETE is blocked by two independent mechanisms:
--   1. No DELETE policy exists on any table.
--   2. No DELETE privilege is granted to anon or authenticated.
--
-- Every block is preceded by DROP POLICY IF EXISTS so this file can be
-- rerun safely.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE ladder.leagues       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder.players       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder.teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder.team_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder.rankings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder.matches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder.challenges    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder.disputes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ladder.rank_history  ENABLE ROW LEVEL SECURITY;

-- ── ladder.leagues ────────────────────────────────────────────────
DROP POLICY IF EXISTS ladder_leagues_select ON ladder.leagues;
DROP POLICY IF EXISTS ladder_leagues_insert ON ladder.leagues;
DROP POLICY IF EXISTS ladder_leagues_update ON ladder.leagues;
CREATE POLICY ladder_leagues_select ON ladder.leagues
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_leagues_insert ON ladder.leagues
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ladder_leagues_update ON ladder.leagues
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ladder.players ────────────────────────────────────────────────
-- Column-level grants (GRANTS section below) further restrict what
-- anon/authenticated can SELECT, INSERT with, or UPDATE on this table.
DROP POLICY IF EXISTS ladder_players_select ON ladder.players;
DROP POLICY IF EXISTS ladder_players_insert ON ladder.players;
DROP POLICY IF EXISTS ladder_players_update ON ladder.players;
CREATE POLICY ladder_players_select ON ladder.players
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_players_insert ON ladder.players
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ladder_players_update ON ladder.players
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ladder.teams ──────────────────────────────────────────────────
DROP POLICY IF EXISTS ladder_teams_select ON ladder.teams;
DROP POLICY IF EXISTS ladder_teams_insert ON ladder.teams;
DROP POLICY IF EXISTS ladder_teams_update ON ladder.teams;
CREATE POLICY ladder_teams_select ON ladder.teams
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_teams_insert ON ladder.teams
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ladder_teams_update ON ladder.teams
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ladder.team_members ───────────────────────────────────────────
DROP POLICY IF EXISTS ladder_team_members_select ON ladder.team_members;
DROP POLICY IF EXISTS ladder_team_members_insert ON ladder.team_members;
DROP POLICY IF EXISTS ladder_team_members_update ON ladder.team_members;
CREATE POLICY ladder_team_members_select ON ladder.team_members
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_team_members_insert ON ladder.team_members
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ladder_team_members_update ON ladder.team_members
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ladder.rankings ───────────────────────────────────────────────
DROP POLICY IF EXISTS ladder_rankings_select ON ladder.rankings;
DROP POLICY IF EXISTS ladder_rankings_insert ON ladder.rankings;
DROP POLICY IF EXISTS ladder_rankings_update ON ladder.rankings;
CREATE POLICY ladder_rankings_select ON ladder.rankings
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_rankings_insert ON ladder.rankings
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ladder_rankings_update ON ladder.rankings
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ladder.matches ────────────────────────────────────────────────
DROP POLICY IF EXISTS ladder_matches_select ON ladder.matches;
DROP POLICY IF EXISTS ladder_matches_insert ON ladder.matches;
DROP POLICY IF EXISTS ladder_matches_update ON ladder.matches;
CREATE POLICY ladder_matches_select ON ladder.matches
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_matches_insert ON ladder.matches
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ladder_matches_update ON ladder.matches
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ladder.challenges ─────────────────────────────────────────────
DROP POLICY IF EXISTS ladder_challenges_select ON ladder.challenges;
DROP POLICY IF EXISTS ladder_challenges_insert ON ladder.challenges;
DROP POLICY IF EXISTS ladder_challenges_update ON ladder.challenges;
CREATE POLICY ladder_challenges_select ON ladder.challenges
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_challenges_insert ON ladder.challenges
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ladder_challenges_update ON ladder.challenges
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ladder.disputes ───────────────────────────────────────────────
DROP POLICY IF EXISTS ladder_disputes_select ON ladder.disputes;
DROP POLICY IF EXISTS ladder_disputes_insert ON ladder.disputes;
DROP POLICY IF EXISTS ladder_disputes_update ON ladder.disputes;
CREATE POLICY ladder_disputes_select ON ladder.disputes
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_disputes_insert ON ladder.disputes
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ladder_disputes_update ON ladder.disputes
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ladder.notifications ──────────────────────────────────────────
DROP POLICY IF EXISTS ladder_notifications_select ON ladder.notifications;
DROP POLICY IF EXISTS ladder_notifications_insert ON ladder.notifications;
DROP POLICY IF EXISTS ladder_notifications_update ON ladder.notifications;
CREATE POLICY ladder_notifications_select ON ladder.notifications
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_notifications_insert ON ladder.notifications
  FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY ladder_notifications_update ON ladder.notifications
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- ── ladder.rank_history ───────────────────────────────────────────
-- No UPDATE policy: rank_history is append-only.  No application code
-- issues UPDATE on this table.
DROP POLICY IF EXISTS ladder_rank_history_select ON ladder.rank_history;
DROP POLICY IF EXISTS ladder_rank_history_insert ON ladder.rank_history;
DROP POLICY IF EXISTS ladder_rank_history_update ON ladder.rank_history;
CREATE POLICY ladder_rank_history_select ON ladder.rank_history
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY ladder_rank_history_insert ON ladder.rank_history
  FOR INSERT TO anon, authenticated WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────
-- GRANTS
-- ─────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA ladder TO anon, authenticated, service_role;

-- ladder.players — column-level grants intentionally omit session_token.
--
-- SELECT: anon cannot SELECT session_token.
--   • SELECT * FROM ladder.players → returns 10 columns; session_token absent.
--   • SELECT session_token FROM ladder.players → permission denied.
--   • Application code MUST query ladder.players_public (the view) for all
--     normal player listings, not ladder.players directly.
--
-- INSERT: anon cannot supply an explicit session_token value.
--   • The DB DEFAULT (substr(md5(random()::text), 1, 12)) fires automatically.
--   • INSERT ... (session_token) VALUES (...) → permission denied for column.
--
-- UPDATE: anon cannot SET session_token or joined_at.
--   • UPDATE ... SET session_token = '...' → permission denied for column.
GRANT SELECT (
  id, league_id, name, rating, rating_type, utr_url,
  role, status, last_active_at, joined_at
) ON ladder.players TO anon, authenticated;

GRANT INSERT (
  league_id, name, rating, rating_type, utr_url,
  role, status, last_active_at, joined_at
) ON ladder.players TO anon, authenticated;

GRANT UPDATE (
  name, rating, rating_type, utr_url,
  role, status, last_active_at
) ON ladder.players TO anon, authenticated;

-- All other tables: SELECT, INSERT, UPDATE — no DELETE.
GRANT SELECT, INSERT, UPDATE ON ladder.leagues       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ladder.teams         TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ladder.team_members  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ladder.rankings      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ladder.matches       TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ladder.challenges    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ladder.disputes      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON ladder.notifications TO anon, authenticated;
-- rank_history is append-only; no UPDATE grant.
GRANT SELECT, INSERT         ON ladder.rank_history  TO anon, authenticated;

-- View: readable by all browser roles.
GRANT SELECT ON ladder.players_public TO anon, authenticated;

-- service_role: full access for admin tooling and edge functions.
-- service_role bypasses RLS, but still requires object-level grants
-- on non-public schemas.
GRANT ALL ON ladder.leagues        TO service_role;
GRANT ALL ON ladder.players        TO service_role;
GRANT ALL ON ladder.teams          TO service_role;
GRANT ALL ON ladder.team_members   TO service_role;
GRANT ALL ON ladder.rankings       TO service_role;
GRANT ALL ON ladder.matches        TO service_role;
GRANT ALL ON ladder.challenges     TO service_role;
GRANT ALL ON ladder.disputes       TO service_role;
GRANT ALL ON ladder.notifications  TO service_role;
GRANT ALL ON ladder.rank_history   TO service_role;
GRANT ALL ON ladder.players_public TO service_role;

-- ─────────────────────────────────────────────────────────────────
-- INDEXES
--
-- ladder_idx_players_token is intentionally absent: the UNIQUE
-- constraint on players.session_token creates a B-tree index with
-- identical selectivity.  A second index would be pure overhead.
-- ─────────────────────────────────────────────────────────────────

-- Player listing per league (fetchPlayers, fetchPlayerCodes)
CREATE INDEX IF NOT EXISTS ladder_idx_players_league
  ON ladder.players(league_id);

-- Team listing per league
CREATE INDEX IF NOT EXISTS ladder_idx_teams_league
  ON ladder.teams(league_id);

-- Ordered standings list (fetchRankings ORDER BY rank)
CREATE INDEX IF NOT EXISTS ladder_idx_rankings_league_rank
  ON ladder.rankings(league_id, rank);

-- Active/pending match queries and real-time filter
CREATE INDEX IF NOT EXISTS ladder_idx_matches_league_status
  ON ladder.matches(league_id, status);

-- Challenge listing by status
CREATE INDEX IF NOT EXISTS ladder_idx_challenges_league_status
  ON ladder.challenges(league_id, status);

-- Notification badge count and mark-read query
CREATE INDEX IF NOT EXISTS ladder_idx_notifications_player_read
  ON ladder.notifications(player_id, read);

-- Rank history audit trail
CREATE INDEX IF NOT EXISTS ladder_idx_rank_history_league
  ON ladder.rank_history(league_id);

-- ─────────────────────────────────────────────────────────────────
-- REALTIME PUBLICATION
--
-- Enables Supabase Realtime for ladder tables so that LeagueContext's
-- postgres_changes listeners receive updates.
--
-- ALTER PUBLICATION modifies a database-level publication object.
-- It does NOT modify the `realtime` schema or any other schema.
--
-- If your Supabase plan requires enabling Realtime through the
-- dashboard instead, do so at:
--   Dashboard → Database → Replication → supabase_realtime
--   → toggle on ladder.matches and ladder.challenges
-- and comment out these two statements.
-- ─────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE ladder.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE ladder.challenges;
