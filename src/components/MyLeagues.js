import React, { useState, useEffect } from 'react';
import { listMyLeagues } from '../lib/db';
import { getLastOrgLeagueId, clearLastOrgLeagueId } from '../lib/session';
import { TennisRacquetIcon, PickleballPaddleIcon } from './SportIcons';

function sportLabel(sport) {
  if (!sport) return '';
  return sport.charAt(0).toUpperCase() + sport.slice(1);
}

function modeLabel(mode) {
  if (mode === 'round_robin') return 'Round Robin';
  if (mode === 'ladder') return 'Ladder';
  return mode || '';
}

function participantLabel(league) {
  if (league.singles_or_doubles === 'doubles') {
    return `${league.team_count} team${league.team_count !== 1 ? 's' : ''}`;
  }
  return `${league.player_count} player${league.player_count !== 1 ? 's' : ''}`;
}

function LeagueCard({ league, onOpen }) {
  const SportIcon =
    league.sport === 'tennis' ? TennisRacquetIcon : PickleballPaddleIcon;

  return (
    <div className="my-leagues-card">
      <div className="my-leagues-card-header">
        <span className="my-leagues-card-icon">
          <SportIcon size={20} color="currentColor" />
        </span>
        <div className="my-leagues-card-titles">
          <div className="my-leagues-card-name">{league.name}</div>
          <div className="my-leagues-card-meta">
            {sportLabel(league.sport)} · {league.singles_or_doubles === 'doubles' ? 'Doubles' : 'Singles'} · {modeLabel(league.mode)}
          </div>
        </div>
      </div>
      <div className="my-leagues-card-stats">
        <span>{participantLabel(league)}</span>
        <span>{league.rounds} round{league.rounds !== 1 ? 's' : ''}</span>
      </div>
      <button className="btn-next my-leagues-open-btn" onClick={() => onOpen(league.league_id)}>
        Open League
      </button>
    </div>
  );
}

function MyLeagues({ onOpenLeague, onCreateLeague, onSignOut }) {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);

  useEffect(() => {
    listMyLeagues()
      .then((data) => {
        const lastId = getLastOrgLeagueId();
        if (lastId && !data.some((l) => l.league_id === lastId)) {
          clearLastOrgLeagueId();
        }
        if (lastId) {
          data.sort((a, b) => {
            if (a.league_id === lastId) return -1;
            if (b.league_id === lastId) return 1;
            return 0;
          });
        }
        setLeagues(data);
      })
      .catch(() => setError('Could not load your leagues. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await onSignOut();
    } catch {
      setSigningOut(false);
      setSignOutError('Sign out failed. Please try again.');
    }
  };

  return (
    <div className="my-leagues-screen">
      <div className="my-leagues-topbar">
        <div className="my-leagues-title">My Leagues</div>
        <div className="my-leagues-topbar-actions">
          {signOutError && (
            <span className="my-leagues-signout-error">{signOutError}</span>
          )}
          <button
            className="btn-sm"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out…' : 'Sign Out'}
          </button>
        </div>
      </div>

      <div className="my-leagues-body">
        {loading && (
          <div className="dashboard-loading">
            <div className="loading-spinner" />
            <div className="loading-text">Loading your leagues…</div>
          </div>
        )}

        {!loading && error && (
          <div className="error-boundary-fallback">
            <div className="error-boundary-message">{error}</div>
            <button className="btn-next" onClick={() => { setError(null); setLoading(true); listMyLeagues().then((data) => { const lastId = getLastOrgLeagueId(); if (lastId && !data.some((l) => l.league_id === lastId)) clearLastOrgLeagueId(); if (lastId) data.sort((a, b) => a.league_id === lastId ? -1 : b.league_id === lastId ? 1 : 0); setLeagues(data); }).catch(() => setError('Could not load your leagues. Please try again.')).finally(() => setLoading(false)); }}>
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && leagues.length === 0 && (
          <div className="my-leagues-empty">
            <p>You have no leagues yet. Create your first one below.</p>
          </div>
        )}

        {!loading && !error && leagues.length > 0 && (
          <div className="my-leagues-grid">
            {leagues.map((league) => (
              <LeagueCard
                key={league.league_id}
                league={league}
                onOpen={onOpenLeague}
              />
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="my-leagues-actions">
            <button className="btn-outline my-leagues-create-btn" onClick={onCreateLeague}>
              + Create New League
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default MyLeagues;
