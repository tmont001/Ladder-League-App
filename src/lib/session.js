// src/lib/session.js
// ─────────────────────────────────────────────────────────────
// Lightweight identity layer for Phase 1.
//
// No real auth — each player is identified by a short session token
// (generated on the server when they're added to the league).
// The token is stored in localStorage under a per-league key,
// so one browser can participate in multiple leagues under different names.
//
// Flow:
//   1. Admin creates league + adds players → each player gets a unique token
//   2. Admin shares tokens with players (copy-link, text, email)
//   3. Player opens the app URL, enters their token once
//   4. Token saved to localStorage → they're "logged in" to that league
// ─────────────────────────────────────────────────────────────

const PREFIX = 'll_session_'; // localStorage key prefix

export function getStoredToken(leagueId) {
  return localStorage.getItem(`${PREFIX}${leagueId}`) || null;
}

export function storeToken(leagueId, token) {
  localStorage.setItem(`${PREFIX}${leagueId}`, token);
}

export function clearToken(leagueId) {
  localStorage.removeItem(`${PREFIX}${leagueId}`);
}

// Active league ID — so the app can re-open the last used league on refresh
const ACTIVE_LEAGUE_KEY = 'll_active_league';

export function getActiveLeagueId() {
  return localStorage.getItem(ACTIVE_LEAGUE_KEY) || null;
}

export function setActiveLeagueId(leagueId) {
  localStorage.setItem(ACTIVE_LEAGUE_KEY, leagueId);
}

export function clearActiveLeague() {
  localStorage.removeItem(ACTIVE_LEAGUE_KEY);
}

// Organizer flag — set for the browser that created the league.
// Separate from player tokens: the organizer may not be a player.
const ORG_PREFIX = 'll_organizer_';

export function setOrganizer(leagueId) {
  localStorage.setItem(`${ORG_PREFIX}${leagueId}`, '1');
}

export function isOrganizer(leagueId) {
  return localStorage.getItem(`${ORG_PREFIX}${leagueId}`) === '1';
}

export function clearOrganizer(leagueId) {
  localStorage.removeItem(`${ORG_PREFIX}${leagueId}`);
}
