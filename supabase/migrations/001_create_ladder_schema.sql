-- 001_create_ladder_schema.sql
-- Ladder League minimal schema

BEGIN;

-- Leagues table: includes a JSONB `settings` and a `movement_rule` defaulting to 'swap'
CREATE TABLE IF NOT EXISTS leagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  settings jsonb DEFAULT '{}'::jsonb,
  movement_rule text NOT NULL DEFAULT 'swap', -- e.g. 'swap', 'bump', 'promote'
  created_at timestamptz DEFAULT now()
);

-- Players (or single participants)
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  display_name text NOT NULL,
  usta_rating numeric, -- optional external rating
  ranking_score numeric(12,4) DEFAULT 0, -- numeric ranking score for ladder algorithms
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Teams (for doubles) — mark whether teams are immutable (true = created and not changeable)
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES leagues(id) ON DELETE CASCADE,
  name text,
  players jsonb NOT NULL, -- store array of player ids / brief metadata
  immutable boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Memberships: which players/teams belong to which league
CREATE TABLE IF NOT EXISTS memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES leagues(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id),
  team_id uuid REFERENCES teams(id),
  role text DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  UNIQUE (league_id, COALESCE(player_id::text, team_id::text))
);

-- Rankings table: historical snapshots if desired
CREATE TABLE IF NOT EXISTS rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES leagues(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL, -- player or team
  ranking_score numeric(12,4) NOT NULL,
  rank integer,
  snapshot_at timestamptz DEFAULT now()
);

-- Notifications and outbox (frontend/backend can write to outbox_emails)
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES leagues(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb,
  delivered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES leagues(id) ON DELETE CASCADE,
  to_address text[],
  subject text,
  body text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Matches / Challenges / Movement history simplified
CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES leagues(id) ON DELETE CASCADE,
  round integer,
  type text NOT NULL DEFAULT 'scheduled', -- scheduled|challenge|adhoc
  p1 uuid,
  p2 uuid,
  status text DEFAULT 'pending', -- pending|completed|forfeit|skipped
  result jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ladder_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid REFERENCES leagues(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL,
  from_rank integer,
  to_rank integer,
  reason text,
  created_at timestamptz DEFAULT now()
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_players_ranking_score ON players(ranking_score);
CREATE INDEX IF NOT EXISTS idx_matches_league_round ON matches(league_id, round);
CREATE INDEX IF NOT EXISTS idx_outbox_league_created ON outbox_emails(league_id, created_at);

COMMIT;
