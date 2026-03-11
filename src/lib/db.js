// src/lib/db.js
// ─────────────────────────────────────────────────────────────
// All database operations. Components never import supabase directly —
// they call functions from here. This makes it easy to swap the backend later.
// ─────────────────────────────────────────────────────────────

import { supabase } from './supabase';

// ══════════════════════════════════════════════════════════════
// LEAGUES
// ══════════════════════════════════════════════════════════════

export async function createLeague(settings) {
  const { data, error } = await supabase
    .from('leagues')
    .insert({
      name: settings.leagueName,
      sport: settings.sport,
      mode: settings.mode || 'round_robin',
      singles_or_doubles: settings.singlesOrDoubles,
      format: settings.format,
      third_set_format: settings.thirdSetFormat,
      rounds: settings.rounds,
      challenge_spots: settings.challengeSpots,
      auto_advance: settings.autoAdvance,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
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
  const { error } = await supabase
    .from('leagues')
    .update(patch)
    .eq('id', leagueId);
  if (error) throw error;
}

// Converts a DB league row → the settings shape the app expects
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
    ladderRules: {
      movementType: row.movement_type,
    },
    inactivityRules: {
      warningDays: row.inactivity_warning_days,
      dropDays: row.inactivity_drop_days,
    },
  };
}

// ══════════════════════════════════════════════════════════════
// PLAYERS
// ══════════════════════════════════════════════════════════════

export async function createPlayers(leagueId, players) {
  const rows = players.map((p) => ({
    league_id: leagueId,
    name: p.name,
    rating: p.rating || null,
    rating_type: p.ratingType || null,
    utr_url: p.utrUrl || null,
    role: p.isAdmin ? 'admin' : 'player',
  }));

  const { data, error } = await supabase.from('players').insert(rows).select();

  if (error) throw error;
  return data.map(dbPlayerToPlayer);
}

export async function fetchPlayers(leagueId) {
  const { data, error } = await supabase
    .from('players')
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

// Look up a player by their session token (the "who are you?" login)
export async function fetchPlayerByToken(token) {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('session_token', token)
    .single();

  if (error) return null;
  return dbPlayerToPlayer(data);
}

function dbPlayerToPlayer(row) {
  return {
    id: row.id,
    leagueId: row.league_id,
    name: row.name,
    rating: row.rating,
    ratingType: row.rating_type,
    utrUrl: row.utr_url,
    ustaRating: row.rating || '0', // alias kept for matchGenerator compat
    sessionToken: row.session_token,
    role: row.role,
    status: row.status,
    lastActiveAt: row.last_active_at,
    joinedAt: row.joined_at,
  };
}

// ══════════════════════════════════════════════════════════════
// TEAMS (DOUBLES)
// ══════════════════════════════════════════════════════════════

export async function createTeams(leagueId, teams) {
  // teams = [{ players: [p1, p2] }, ...]  where players already have DB ids
  const results = [];
  for (const team of teams) {
    const { data: teamRow, error: teamErr } = await supabase
      .from('teams')
      .insert({ league_id: leagueId })
      .select()
      .single();
    if (teamErr) throw teamErr;

    const members = team.players.map((p) => ({
      team_id: teamRow.id,
      player_id: p.id,
    }));
    const { error: membErr } = await supabase
      .from('team_members')
      .insert(members);
    if (membErr) throw membErr;

    results.push({ id: teamRow.id, players: team.players });
  }
  return results;
}

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

export async function createMatches(leagueId, matches) {
  const rows = matches.map((m) => ({
    league_id: leagueId,
    round_number: m.round,
    type: m.type || 'scheduled',
    is_bye: m.isBye || false,
    p1_player_id: m.p1?.id || null,
    p2_player_id: m.p2?.id || null,
    status: 'pending',
    result: null,
  }));

  const { data, error } = await supabase.from('matches').insert(rows).select();

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

// Submit a score — sets status to 'awaiting_confirmation'
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

// Confirm a score — sets status to 'confirmed'
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

// Open a dispute
export async function openDispute(
  matchId,
  openedByPlayerId,
  reason,
  counterScore = null,
) {
  // 1. Set match status to disputed
  const { error: matchErr } = await supabase
    .from('matches')
    .update({ status: 'disputed' })
    .eq('id', matchId);
  if (matchErr) throw matchErr;

  // 2. Create dispute record — auto-escalate to admin after 24h
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
    .single();

  if (error) return null;
  return data;
}

export async function skipMatch(matchId) {
  const { error } = await supabase
    .from('matches')
    .update({ status: 'skipped' })
    .eq('id', matchId);
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

export async function saveInitialRankings(
  leagueId,
  seededParticipants,
  isDoubles,
) {
  const rows = seededParticipants.map((p, i) => ({
    league_id: leagueId,
    player_id: isDoubles ? null : p.id,
    team_id: isDoubles ? p.id : null,
    rank: i + 1,
  }));

  const { error } = await supabase.from('rankings').insert(rows);
  if (error) throw error;

  // Also write to rank_history as the initial seeding record
  const historyRows = seededParticipants.map((p, i) => ({
    league_id: leagueId,
    player_id: isDoubles ? null : p.id,
    team_id: isDoubles ? p.id : null,
    rank: i + 1,
    previous_rank: null,
    reason: 'initial_seeding',
  }));
  const { error: hErr } = await supabase
    .from('rank_history')
    .insert(historyRows);
  if (hErr) throw hErr;
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
