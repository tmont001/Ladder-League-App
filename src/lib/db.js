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
// players(*) is intentionally replaced with an explicit safe column list:
// ladder.players has only column-level SELECT grants (no table-level grant),
// so SELECT * is rejected by PostgreSQL with 403.  Listing only the granted
// columns is the correct fix — do not broaden table privileges to allow *.
export async function fetchTeams(leagueId) {
  const { data: teams, error } = await supabase
    .from('teams')
    .select(`id, team_members(player_id, players(id, league_id, name, rating, rating_type, utr_url, role, status, last_active_at, joined_at))`)
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

function rpcErrorMessage(err) {
  const msg = err?.message || '';
  if (msg === 'invalid_token' || msg === 'player_inactive')
    return 'Session expired. Please log in again.';
  if (msg === 'match_not_found')
    return 'Match not found.';
  if (msg === 'bye_match')
    return 'This is a bye match.';
  if (msg === 'match_not_pending')
    return 'This match has already been submitted.';
  if (msg === 'not_participant')
    return 'You are not a participant in this match.';
  if (msg === 'invalid_result' || msg === 'invalid_winner')
    return 'Invalid match result. Please check the scores and try again.';
  if (msg === 'match_not_awaiting_confirmation')
    return 'This match cannot be confirmed or disputed right now.';
  if (msg === 'cannot_confirm_own_submission')
    return 'You cannot confirm your own submission.';
  if (msg === 'cannot_dispute_own_submission')
    return 'You cannot dispute your own submission.';
  if (msg === 'reason_empty')
    return 'Dispute reason cannot be empty.';
  if (msg === 'reason_too_long')
    return 'Dispute reason is too long (max 1000 characters).';
  if (msg === 'dispute_already_open')
    return 'A dispute is already open for this match.';
  if (msg === 'not_authenticated')
    return 'Organizer session required.';
  if (msg === 'not_league_organizer')
    return 'You do not own this league.';
  if (msg === 'match_not_resolvable')
    return 'This match cannot be resolved right now.';
  if (msg === 'invalid_match_state')
    return 'This match is missing submission information and cannot be updated.';
  if (msg === 'doubles_challenges_not_supported')
    return 'Doubles challenges are not yet supported.';
  if (msg === 'challenges_require_ladder_mode')
    return 'Challenges are available only in ladder mode.';
  if (msg === 'self_challenge')
    return 'You cannot challenge yourself.';
  if (msg === 'not_same_league')
    return 'Both players must be in the same league.';
  if (msg === 'challenged_player_not_found' || msg === 'challenger_player_not_found')
    return 'Player not found in this league.';
  if (msg === 'challenged_player_inactive')
    return 'The player you challenged is not active.';
  if (msg === 'challenge_target_below_rank')
    return 'You can only challenge players ranked above you.';
  if (msg === 'challenge_out_of_range')
    return 'That player is too far above you in the rankings.';
  if (msg === 'ranking_not_found')
    return 'Rankings not found. The league may not have started yet.';
  if (msg === 'max_active_challenges_reached')
    return 'You have reached the maximum number of active challenges.';
  if (msg === 'duplicate_challenge')
    return 'There is already an active challenge between you and this player.';
  if (msg === 'challenge_cooldown_active')
    return 'You must wait before issuing another challenge.';
  if (msg === 'rematch_lock_active')
    return 'You must wait before challenging this player again.';
  if (msg === 'challenge_not_found')
    return 'Challenge not found.';
  if (msg === 'not_challenged_player')
    return 'Only the challenged player can respond to this challenge.';
  if (msg === 'challenge_not_pending')
    return 'This challenge is no longer pending.';
  if (msg === 'challenge_expired')
    return 'This challenge has expired.';
  return 'Something went wrong. Please try again.';
}

export async function submitMatchResult(matchId, result, sessionToken) {
  const { error } = await supabase.rpc('submit_match_result_secure', {
    p_match_id: matchId,
    p_result:   result,
    p_token:    sessionToken,
  });
  if (error) throw new Error(rpcErrorMessage(error));
}

export async function confirmMatchResult(matchId, sessionToken) {
  const { error } = await supabase.rpc('confirm_match_result_secure', {
    p_match_id: matchId,
    p_token:    sessionToken,
  });
  if (error) throw new Error(rpcErrorMessage(error));
}

export async function openDispute(
  matchId,
  sessionToken,
  reason,
  counterScore = null,
) {
  const { error } = await supabase.rpc('open_match_dispute_secure', {
    p_match_id:      matchId,
    p_token:         sessionToken,
    p_reason:        reason,
    p_counter_score: counterScore,
  });
  if (error) throw new Error(rpcErrorMessage(error));
}

export async function resolveDispute(matchId, resolution = null) {
  const { error } = await supabase.rpc('resolve_dispute_for_organizer', {
    p_match_id:   matchId,
    p_resolution: resolution,
  });
  if (error) throw new Error(rpcErrorMessage(error));
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
  if (error) throw new Error(rpcErrorMessage(error));
}

// ══════════════════════════════════════════════════════════════
// LEAGUES — ORGANIZER WORKSPACE
// ══════════════════════════════════════════════════════════════

export async function listMyLeagues() {
  const { data, error } = await supabase.rpc('list_my_leagues');
  if (error) throw error;
  return data || [];
}

// ══════════════════════════════════════════════════════════════
// CHALLENGES
// ══════════════════════════════════════════════════════════════

// Player-authenticated challenge creation (singles only).
// Token identifies the challenger; challenged is specified by UUID.
export async function createChallengeSecure(token, challengedId, leagueId) {
  const { data, error } = await supabase.rpc('create_challenge_secure', {
    p_token:         token,
    p_challenged_id: challengedId,
    p_league_id:     leagueId,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  return data;
}

// Organizer-authenticated challenge creation.
// Immediately creates match + marks challenge accepted (existing UX preserved).
export async function createChallengeForOrganizer(leagueId, challengerId, challengedId) {
  const { data, error } = await supabase.rpc('create_challenge_for_organizer', {
    p_league_id:     leagueId,
    p_challenger_id: challengerId,
    p_challenged_id: challengedId,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  return data;
}

// Player-authenticated challenge response (accept or decline).
// Returns the new match UUID on accept, null on decline.
export async function respondToChallengeSecure(token, challengeId, accept) {
  const { data, error } = await supabase.rpc('respond_to_challenge_secure', {
    p_token:        token,
    p_challenge_id: challengeId,
    p_accept:       accept,
  });
  if (error) throw new Error(rpcErrorMessage(error));
  return data;
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
// Notifications are generated server-side by secure RPCs.
// The browser never INSERTs notifications directly; all writes
// go through create_notification_internal (no browser EXECUTE grant).
// ══════════════════════════════════════════════════════════════

// Token-authenticated notification fetch.
// Returns [] silently on error — a missing notification panel is not
// worth surfacing as a user-visible error.
export async function fetchNotifications(token) {
  if (!token) return [];
  const { data, error } = await supabase.rpc('fetch_my_notifications', {
    p_token: token,
  });
  if (error) return [];
  return data || [];
}

// Token-authenticated mark-read.
// Pass null for notificationIds to mark all as read.
export async function markNotificationsRead(token, notificationIds = null) {
  if (!token) return;
  const { error } = await supabase.rpc('mark_my_notifications_read', {
    p_token:            token,
    p_notification_ids: notificationIds,
  });
  if (error) console.warn('[notifications] mark read failed:', error.message);
}
