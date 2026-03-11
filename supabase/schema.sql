-- ══════════════════════════════════════════════════════════════
-- LADDER LEAGUE — SUPABASE SCHEMA
-- Run this entire file in the Supabase SQL editor.
-- ══════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Leagues ──────────────────────────────────────────────────
create table if not exists leagues (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  sport         text not null check (sport in ('tennis','pickleball')),
  mode          text not null check (mode in ('round_robin','ladder')) default 'round_robin',
  singles_or_doubles text not null check (singles_or_doubles in ('singles','doubles')) default 'singles',
  format        text not null default 'best_of_3',
  third_set_format text not null default 'full_set',
  rounds        int  not null default 6,
  challenge_spots int not null default 2,
  auto_advance  boolean not null default true,
  -- Challenge rules
  challenge_cooldown_days     int not null default 3,
  match_expiry_days           int not null default 14,
  rematch_lock_days           int not null default 7,
  max_active_challenges       int not null default 1,
  no_response_days            int not null default 5,
  decline_penalty_enabled     boolean not null default false,
  protection_after_match_days int not null default 2,
  -- Ladder movement rules
  movement_type text not null check (movement_type in ('swap','take_spot','halfway')) default 'swap',
  -- Inactivity rules
  inactivity_warning_days     int not null default 14,
  inactivity_drop_days        int not null default 30,
  -- Meta
  created_at    timestamptz not null default now()
);

-- ── Players ───────────────────────────────────────────────────
create table if not exists players (
  id            uuid primary key default uuid_generate_v4(),
  league_id     uuid not null references leagues(id) on delete cascade,
  name          text not null,
  rating        text,                          -- e.g. '3.5', '8.0'
  rating_type   text check (rating_type in ('USTA','UTR')),
  utr_url       text,
  -- Session token: a short code the player stores in localStorage
  -- to identify themselves (no real auth)
  session_token text unique not null default substr(md5(random()::text), 1, 12),
  -- Role
  role          text not null check (role in ('player','admin')) default 'player',
  -- Status
  status        text not null check (status in ('active','inactive','frozen','dropped')) default 'active',
  last_active_at timestamptz not null default now(),
  joined_at     timestamptz not null default now()
);

-- ── Teams (doubles) ───────────────────────────────────────────
create table if not exists teams (
  id        uuid primary key default uuid_generate_v4(),
  league_id uuid not null references leagues(id) on delete cascade
);

create table if not exists team_members (
  team_id   uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  primary key (team_id, player_id)
);

-- ── Rankings (ladder position) ────────────────────────────────
create table if not exists rankings (
  id            uuid primary key default uuid_generate_v4(),
  league_id     uuid not null references leagues(id) on delete cascade,
  -- participant is either a player_id (singles) or team_id (doubles)
  player_id     uuid references players(id) on delete cascade,
  team_id       uuid references teams(id) on delete cascade,
  rank          int  not null,
  changed_at    timestamptz not null default now(),
  check (
    (player_id is not null and team_id is null) or
    (player_id is null and team_id is not null)
  )
);

-- ── Matches ───────────────────────────────────────────────────
create table if not exists matches (
  id            uuid primary key default uuid_generate_v4(),
  league_id     uuid not null references leagues(id) on delete cascade,
  round_number  int,
  type          text not null check (type in ('scheduled','challenge')) default 'scheduled',
  is_bye        boolean not null default false,
  -- participants (singles: player_id, doubles: team_id)
  p1_player_id  uuid references players(id),
  p2_player_id  uuid references players(id),
  p1_team_id    uuid references teams(id),
  p2_team_id    uuid references teams(id),
  -- status machine:
  -- pending → awaiting_confirmation → confirmed
  --                                 → disputed → confirmed (admin) | re_submitted
  -- pending → skipped
  status        text not null check (status in (
    'pending','awaiting_confirmation','confirmed','disputed','skipped'
  )) default 'pending',
  -- result (stored as JSON for flexibility)
  result        jsonb,           -- { winnerId, setScores, p1Sets, p2Sets, p1Games, p2Games }
  submitted_by  uuid references players(id),
  submitted_at  timestamptz,
  confirmed_by  uuid references players(id),
  confirmed_at  timestamptz,
  auto_confirm_after timestamptz, -- set when status = awaiting_confirmation
  expires_at    timestamptz,      -- for challenge matches
  created_at    timestamptz not null default now()
);

-- ── Challenges ────────────────────────────────────────────────
create table if not exists challenges (
  id            uuid primary key default uuid_generate_v4(),
  league_id     uuid not null references leagues(id) on delete cascade,
  challenger_player_id uuid references players(id),
  challenged_player_id uuid references players(id),
  challenger_team_id   uuid references teams(id),
  challenged_team_id   uuid references teams(id),
  status        text not null check (status in (
    'pending','accepted','declined','expired','cancelled'
  )) default 'pending',
  match_id      uuid references matches(id), -- set when accepted
  decline_reason text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '5 days')
);

-- ── Dispute log ───────────────────────────────────────────────
create table if not exists disputes (
  id            uuid primary key default uuid_generate_v4(),
  match_id      uuid not null references matches(id) on delete cascade,
  opened_by     uuid not null references players(id),
  reason        text not null,
  counter_score jsonb,           -- disputed player's version of the score
  status        text not null check (status in (
    'open','counter_submitted','escalated','resolved'
  )) default 'open',
  resolved_by   uuid references players(id), -- admin who resolved
  resolution    text,
  opened_at     timestamptz not null default now(),
  resolved_at   timestamptz,
  auto_escalate_after timestamptz -- set on open; job escalates to admin after X hours
);

-- ── Notifications ─────────────────────────────────────────────
create table if not exists notifications (
  id            uuid primary key default uuid_generate_v4(),
  league_id     uuid references leagues(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  type          text not null, -- 'challenge_received' | 'score_submitted' | 'score_confirmed' | 'rank_changed' | etc.
  message       text not null,
  read          boolean not null default false,
  related_match_id     uuid references matches(id),
  related_challenge_id uuid references challenges(id),
  created_at    timestamptz not null default now()
);

-- ── Rank history ──────────────────────────────────────────────
create table if not exists rank_history (
  id            uuid primary key default uuid_generate_v4(),
  league_id     uuid not null references leagues(id) on delete cascade,
  player_id     uuid references players(id),
  team_id       uuid references teams(id),
  rank          int  not null,
  previous_rank int,
  reason        text, -- 'match_result' | 'admin_override' | 'initial_seeding'
  match_id      uuid references matches(id),
  recorded_at   timestamptz not null default now()
);

-- ── Row-level security (basic — tighten in Phase 2) ───────────
alter table leagues     enable row level security;
alter table players     enable row level security;
alter table teams       enable row level security;
alter table team_members enable row level security;
alter table matches     enable row level security;
alter table challenges  enable row level security;
alter table disputes    enable row level security;
alter table notifications enable row level security;
alter table rank_history enable row level security;
alter table rankings    enable row level security;

-- For Phase 1: allow all reads and writes (auth is session-token based, not Supabase auth)
-- Tighten these per-table in Phase 2 when real auth is added.
create policy "allow_all" on leagues      for all using (true) with check (true);
create policy "allow_all" on players      for all using (true) with check (true);
create policy "allow_all" on teams        for all using (true) with check (true);
create policy "allow_all" on team_members for all using (true) with check (true);
create policy "allow_all" on matches      for all using (true) with check (true);
create policy "allow_all" on challenges   for all using (true) with check (true);
create policy "allow_all" on disputes     for all using (true) with check (true);
create policy "allow_all" on notifications for all using (true) with check (true);
create policy "allow_all" on rank_history for all using (true) with check (true);
create policy "allow_all" on rankings     for all using (true) with check (true);

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists idx_players_league    on players(league_id);
create index if not exists idx_matches_league    on matches(league_id);
create index if not exists idx_challenges_league on challenges(league_id);
create index if not exists idx_notifications_player on notifications(player_id);
create index if not exists idx_rank_history_league on rank_history(league_id);
