// src/lib/db.js
import { supabase } from './supabase';

// ══════════════════════════════════════════════════════════════
// PLAYER QUERY ROUTING
//
// ladder.players       — base table; session_token protected by
//                        column-level grants.  Use for:
//                          • INSERT (omit session_token — DB DEFAULT fires)
//                          • UPDATE (status, last_active_at, etc.)
//                        Do NOT use for SELECT outside of RPCs.
//
// ladder.players_public — view (security_invoker=true); omits
//                         session_token.  Use for ALL normal player
//                         listings: fetchPlayers, embedded team joins.
//
// login_by_token RPC   — SECURITY DEFINER function; returns full row
//                        including session_token to the caller who
//                        already holds the token.  Use for: player
//                        login identity lookup.
//
// get_player_codes RPC — SECURITY DEFINER function; returns
//                        (id, name, role, session_token) for every
//                        player in a league.  Use for: LaunchCodesScreen,
//                        PlayersPanel.  Never merge results into the
//                        shared participants array.
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// LEAGUES
// ══════════════════════════════════════════════════════════════

export async function createLeague(settings) {
  const { data: leagueId, error } = await supabase.rpc(
    'create_league_for_organizer',
    {
      p_name:               settings.leagueName,
      p_sport:              settings.sport,
      p_mode:               settings.mode || 'round_robin',
      p_singles_or_doubles: settings.singlesOrDoubles,
      p_format:             settings.format,
      p_third_set_format:   settings.thirdSetFormat,
      p_rounds:             settings.rounds,
      p_challenge_spots:    settings.challengeSpots,
      p_auto_advance:       settings.autoAdvance,
    },
  );
  if (error) throw error;
  // RPC returns a scalar UUID; wrap to preserve { id } shape App.js expects.
  return { id: leagueId };
}

export async function fetchLeague(leagueId) {
  const { data, error } = await supabase
    .from('leagues')
    .select('*')
    .eq('id', leagueId)
    .single();

  if (error) throw error;
  return dbLeagueToSettings(data);
}

export async function updateLeagueSettings(leagueId, patch) {
  const { error } = await supabase.rpc('update_league_settings_secure', {
    p_league_id:        leagueId,
    p_name:             patch.name,
    p_format:           patch.format,
    p_third_set_format: patch.third_set_format,
    p_challenge_spots:  patch.challenge_spots,
    p_auto_advance:     patch.auto_advance,
  });
  if (error) throw error;
}

function dbLeagueToSettings(row) {
  return {
    id: row.id,
    leagueName: row.name,
    sport: row.sport,
    mode: row.mode,
    singlesOrDoubles: row.singles_or_doubles,
    format: row.format,
    thirdSetFormat: row.third_set_format,
    rounds: row.rounds,
    challengeSpots: row.challenge_spots,
    autoAdvance: row.auto_advance,
    challengeRules: {
      cooldownDays: row.challenge_cooldown_days,
      matchExpiryDays: row.match_expiry_days,
      rematchLockDays: row.rematch_lock_days,
      maxActiveChallenges: row.max_active_challenges,
      noResponseDays: row.no_response_days,
      declinePenaltyEnabled: row.decline_penalty_enabled,
      protectionAfterMatchDays: row.protection_after_match_days,
    },
    ladderRules: { movementType: row.movement_type },
    inactivityRules: {
      warningDays: row.inactivity_warning_days,
      dropDays: row.inactivity_drop_days,
    },
  };
}

// ══════════════════════════════════════════════════════════════
// PLAYERS
// ══════════════════════════════════════════════════════════════

// Creates players serially via the add_player_for_organizer RPC and
// returns { dbPlayers, idMap }.
//
// Serial (not batch) so each call returns a single DB-assigned UUID
// without relying on ordering.  The RPC validates ownership, trims
// the name, and lets the DB DEFAULT generate session_token.
//
// dbPlayers is a minimal shape — LeagueContext re-fetches from DB on
// mount so this is only used as initialLeagueData (instant paint).
//
// idMap: { localPlayerId → dbPlayerId }
// Callers that need session_token (LaunchCodesScreen, PlayersPanel)
// must call fetchPlayerCodes() separately after creation.
export async function createPlayers(leagueId, players) {
  const dbPlayers = [];
  const idMap = {};

  for (const p of players) {
    const { data: newId, error } = await supabase.rpc(
      'add_player_for_organizer',
      {
        p_league_id:   leagueId,
        p_name:        p.name,
        p_rating:      p.rating || null,
        p_rating_type: p.ratingType || null,
        p_utr_url:     p.utrUrl || null,
        p_role:        p.isAdmin ? 'admin' : 'player',
      },
    );
    if (error) throw error;
    idMap[p.id] = newId;
    // Minimal shape; LeagueContext overwrites on mount via fetchPlayers.
    dbPlayers.push({
      id: newId,
      leagueId,
      name: p.name,
      rating: p.rating || null,
      ratingType: p.ratingType || null,
      utrUrl: p.utrUrl || null,
      ustaRating: p.rating || '0',
      sessionToken: undefined,
      role: p.isAdmin ? 'admin' : 'player',
      status: 'active',
      lastActiveAt: null,
      joinedAt: null,
    });
  }

  return { dbPlayers, idMap };
}

// Normal player listing — queries players_public (no session_token).
// Use everywhere except token-based login or organizer code sheets.
export async function fetchPlayers(leagueId) {
  const { data, error } = await supabase
    .from('players_public')
    .select('*')
    .eq('league_id', leagueId)
    .order('joined_at', { ascending: true });

  if (error) throw error;
  return data.map(dbPlayerToPlayer);
}

export async function updatePlayerStatus(playerId, status) {
  const { error } = await supabase
    .from('players')
    .update({ status })
    .eq('id', playerId);
  if (error) throw error;
}

export async function touchPlayerActivity(playerId) {
  const { error } = await supabase
    .from('players')
    .update({ last_active_at: new Date().toISOString() })
    .eq('id', playerId);
  if (error) throw error;
}

// Player login by session token.
// Uses the login_by_token SECURITY DEFINER RPC — the only path that
// returns session_token to the caller.  Direct .eq('session_token')
// queries are blocked by column-level grants.
// Returns null (never throws) so callers can handle missing players gracefully.
export async function fetchPlayerByToken(token) {
  if (!token || token.startsWith('local-')) return null;

  const { data, error } = await supabase
    .rpc('login_by_token', { p_token: token })
    .maybeSingle();

  if (error) {
    console.warn('[fetchPlayerByToken] error:', error.message);
    return null;
  }
  if (!data) return null;
  return dbPlayerToPlayer(data);
}

// Organizer code sheet — returns (id, name, role, session_token) for
// every player in the league, ordered by join date.
// Calls get_player_codes_secure which verifies organizer ownership.
// Must only be called from LaunchCodesScreen and PlayersPanel.
// Results must NEVER be merged into LeagueContext participants.
export async function fetchPlayerCodes(leagueId) {
  const { data, error } = await supabase
    .rpc('get_player_codes_secure', { p_league_id: leagueId });
  if (error) throw error;
  return data || [];
}

// Maps a DB row to the UI player shape.
// session_token is mapped when present (login_by_token RPC) and is
// undefined when the row came from players_public or a safe column list.
function dbPlayerToPlayer(row) {
  return {
    id: row.id,
    leagueId: row.league_id,
    name: row.name,
    rating: row.rating,
    ratingType: row.rating_type,
    utrUrl: row.utr_url,
    ustaRating: row.rating || '0',
    sessionToken: row.session_token,   // undefined for non-token queries
    role: row.role,
    status: row.status,
    lastActiveAt: row.last_active_at,
    joinedAt: row.joined_at,
  };
}

// ══════════════════════════════════════════════════════════════
// TEAMS (DOUBLES)
// ══════════════════════════════════════════════════════════════

// Creates doubles teams via the add_team_with_members_for_organizer RPC.
// Accepts teams as [{ localId, playerIds: [dbPlayerId, ...] }].
// The RPC assigns server-generated team UUIDs and creates team_members
// atomically.  Returns { [localId]: dbTeamId } for match and ranking
// ID mapping downstream.
export async function createTeams(leagueId, teams) {
  const teamIdMap = {};
  for (const t of teams) {
    const { data: teamId, error } = await supabase.rpc(
      'add_team_with_members_for_organizer',
      {
        p_league_id:  leagueId,
        p_player_ids: t.playerIds,
      },
    );
    if (error) throw error;
    teamIdMap[t.localId] = teamId;
  }
  return teamIdMap;
}

// Fetches teams with embedded player data via FK join.
// PostgREST resolves players(*) using the column-level grant on
// ladder.players, so session_token is absent from nested player rows.
export async function fetchTeams(leagueId) {
  const { data: teams, error } = await supabase
    .from('teams')
    .select(`id, team_members(player_id, players(*))`)
    .eq('league_id', leagueId);

  if (error) throw error;
  return teams.map((t) => ({
    id: t.id,
    players: t.team_members.map((m) => dbPlayerToPlayer(m.players)),
  }));
}

// ══════════════════════════════════════════════════════════════
// MATCHES
// ══════════════════════════════════════════════════════════════

// Resolves a match participant's local ID to a DB UUID via idMap.
// Returns null if participant is absent (valid for bye p2).
// Throws a clear error if participant is present but has no mapping —
// a missing mapping indicates a bug in the caller, not a DB error.
function getMappedParticipantId(participant, idMap, label) {
  if (!participant) return null;
  const mappedId = idMap[participant.id];
  if (!mappedId) {
    throw new Error(
      `Missing database ID mapping for ${label}: ${participant.id}`,
    );
  }
  return mappedId;
}

export async function createMatches(leagueId, matches, isDoubles = false, idMap = {}) {
  const rows = matches.map((m) => {
    const p1Id = getMappedParticipantId(m.p1, idMap, 'p1');
    const p2Id = getMappedParticipantId(m.p2, idMap, 'p2');
    return {
      league_id: leagueId,
      round_number: m.round,
      type: m.type || 'scheduled',
      is_bye: m.isBye || false,
      p1_player_id: isDoubles ? null : p1Id,
      p2_player_id: isDoubles ? null : p2Id,
      p1_team_id:   isDoubles ? p1Id : null,
      p2_team_id:   isDoubles ? p2Id : null,
      status: 'pending',
      result: null,
    };
  });

  const { data, error } = await supabase.from('matches').insert(rows).select();
  if (error) throw error;
  return data;
}

// Sends the full initial schedule to the DB via the
// create_matches_for_organizer RPC, which validates ownership and
// participant membership before inserting atomically.
//
// Keeps the same idMap / getMappedParticipantId convention as
// createMatches so App.js callers need only change the function name.
//
// createMatches (below) is preserved for challenge and scheduled-match
// creation from LeagueContext — those are player actions untouched by
// this milestone.
export async function createInitialMatches(leagueId, matches, isDoubles = false, idMap = {}) {
  const rows = matches.map((m) => {
    const p1Id = getMappedParticipantId(m.p1, idMap, 'p1');
    const p2Id = getMappedParticipantId(m.p2, idMap, 'p2');
    return {
      round_number: m.round,
      type:         m.type || 'scheduled',
      is_bye:       m.isBye || false,
      p1_player_id: isDoubles ? null : p1Id,
      p2_player_id: isDoubles ? null : p2Id,
      p1_team_id:   isDoubles ? p1Id  : null,
      p2_team_id:   isDoubles ? p2Id  : null,
    };
  });

  const { data, error } = await supabase.rpc(
    'create_matches_for_organizer',
    { p_league_id: leagueId, p_matches: rows },
  );
  if (error) throw error;
  return data;
}

export async function fetchMatches(leagueId) {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .eq('league_id', leagueId)
    .order('round_number', { ascending: true });

  if (error) throw error;
  return data;
}

export async function submitMatchResult(matchId, result, submittedByPlayerId) {
  const autoConfirmAfter = new Date();
  autoConfirmAfter.setHours(autoConfirmAfter.getHours() + 48);

  const { error } = await supabase
    .from('matches')
    .update({
      status: 'awaiting_confirmation',
      result,
      submitted_by: submittedByPlayerId,
      submitted_at: new Date().toISOString(),
      auto_confirm_after: autoConfirmAfter.toISOString(),
    })
    .eq('id', matchId);

  if (error) throw error;
}

export async function confirmMatchResult(matchId, confirmedByPlayerId) {
  const { error } = await supabase
    .from('matches')
    .update({
      status: 'confirmed',
      confirmed_by: confirmedByPlayerId,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', matchId);

  if (error) throw error;
}

export async function openDispute(
  matchId,
  openedByPlayerId,
  reason,
  counterScore = null,
) {
  const { error: matchErr } = await supabase
    .from('matches')
    .update({ status: 'disputed' })
    .eq('id', matchId);
  if (matchErr) throw matchErr;

  const autoEscalate = new Date();
  autoEscalate.setHours(autoEscalate.getHours() + 24);

  const { error: dispErr } = await supabase.from('disputes').insert({
    match_id: matchId,
    opened_by: openedByPlayerId,
    reason,
    counter_score: counterScore,
    status: 'open',
    auto_escalate_after: autoEscalate.toISOString(),
  });
  if (dispErr) throw dispErr;
}

export async function fetchDispute(matchId) {
  const { data, error } = await supabase
    .from('disputes')
    .select('*')
    .eq('match_id', matchId)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data;
}

export async function skipMatch(matchId) {
  const { error } = await supabase.rpc('skip_match_secure', {
    p_match_id: matchId,
  });
  if (error) throw error;
}

// ══════════════════════════════════════════════════════════════
// CHALLENGES
// ══════════════════════════════════════════════════════════════

export async function createChallenge(
  leagueId,
  challengerPlayer,
  challengedPlayer,
  noResponseDays = 5,
) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + noResponseDays);

  const { data, error } = await supabase
    .from('challenges')
    .insert({
      league_id: leagueId,
      challenger_player_id: challengerPlayer.id,
      challenged_player_id: challengedPlayer.id,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function acceptChallenge(challengeId, matchId) {
  const { error } = await supabase
    .from('challenges')
    .update({ status: 'accepted', match_id: matchId })
    .eq('id', challengeId);
  if (error) throw error;
}

export async function declineChallenge(challengeId, reason = '') {
  const { error } = await supabase
    .from('challenges')
    .update({ status: 'declined', decline_reason: reason })
    .eq('id', challengeId);
  if (error) throw error;
}

export async function fetchChallenges(leagueId) {
  const { data, error } = await supabase
    .from('challenges')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ══════════════════════════════════════════════════════════════
// RANKINGS
// ══════════════════════════════════════════════════════════════

export async function saveInitialRankings(leagueId, seededParticipants) {
  const participants = seededParticipants.map((p) => ({ id: p.id }));
  // p_is_doubles intentionally absent: the RPC derives singles_or_doubles
  // from ladder.leagues so the browser cannot override participant mode.
  const { error } = await supabase.rpc('seed_rankings_for_organizer', {
    p_league_id:    leagueId,
    p_participants: participants,
  });
  if (error) throw error;
}

export async function fetchRankings(leagueId) {
  const { data, error } = await supabase
    .from('rankings')
    .select('*')
    .eq('league_id', leagueId)
    .order('rank', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ══════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════

export async function createNotification(
  playerId,
  leagueId,
  type,
  message,
  extras = {},
) {
  const { error } = await supabase.from('notifications').insert({
    player_id: playerId,
    league_id: leagueId,
    type,
    message,
    related_match_id: extras.matchId || null,
    related_challenge_id: extras.challengeId || null,
  });
  if (error) console.warn('[notifications] insert failed:', error.message);
}

export async function fetchNotifications(playerId) {
  // '__organizer__' is a sentinel, not a UUID. Guard here so a misrouted
  // call never reaches the UUID-typed player_id column.
  if (!playerId || playerId === '__organizer__') return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) return [];
  return data;
}

export async function markNotificationsRead(playerId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('player_id', playerId)
    .eq('read', false);
  if (error) console.warn('[notifications] mark read failed:', error.message);
}
