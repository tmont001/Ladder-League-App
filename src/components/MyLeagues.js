import React, { useState, useEffect } from 'react';
import { listMyLeagues, deleteLeague, ORG_SESSION_EXPIRED_MSG } from '../lib/db';
import { getLastOrgLeagueId, clearLastOrgLeagueId, clearActiveLeague } from '../lib/session';
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

function LeagueCard({ league, onOpen, onDelete, isLastOpened }) {
  const SportIcon =
    league.sport === 'tennis' ? TennisRacquetIcon : PickleballPaddleIcon;

  return (
    <div className="my-leagues-card">
      {isLastOpened && (
        <div className="my-leagues-card-badge">Last Opened</div>
      )}
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
        <span className="my-leagues-stat-sep" aria-hidden="true">·</span>
        <span>{league.rounds} round{league.rounds !== 1 ? 's' : ''}</span>
      </div>
      <div className="my-leagues-card-actions">
        <button className="btn-next my-leagues-open-btn" onClick={() => onOpen(league.league_id)}>
          Open League
        </button>
        <button className="btn-danger-outline my-leagues-delete-btn" onClick={() => onDelete(league.league_id, league.name)}>
          Delete
        </button>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({ leagueName, onConfirm, onCancel }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(confirmText);
    } catch (err) {
      setDeleting(false);
      setError(err?.message || 'Deletion failed. Please try again.');
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-league-title">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" id="delete-league-title">Delete League</div>
          <button className="modal-close" onClick={onCancel} aria-label="Cancel" disabled={deleting}>✕</button>
        </div>
        <div className="modal-body">
          <p className="delete-confirm-warning">
            This will permanently delete <strong>{leagueName}</strong> and all its players, matches, and history. This cannot be undone.
          </p>
          <div className="field-group">
            <label htmlFor="delete-confirm-input">Type the league name to confirm</label>
            <input
              id="delete-confirm-input"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={leagueName}
              disabled={deleting}
              autoComplete="off"
            />
          </div>
          {error && <div className="modal-error" role="alert">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn-back" onClick={onCancel} disabled={deleting}>Cancel</button>
          <button
            className="btn-danger"
            onClick={handleDelete}
            disabled={confirmText !== leagueName || deleting}
            aria-disabled={confirmText !== leagueName || deleting}
          >
            {deleting ? 'Deleting…' : 'Delete League'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MyLeagues({ onOpenLeague, onCreateLeague, onSignOut, onSessionExpired }) {
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

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

  const handleDeleteRequest = (leagueId, leagueName) => {
    setPendingDelete({ leagueId, leagueName });
  };

  const handleDeleteConfirm = async (confirmText) => {
    try {
      await deleteLeague(pendingDelete.leagueId, confirmText);
    } catch (err) {
      if (err.message === ORG_SESSION_EXPIRED_MSG && onSessionExpired) {
        onSessionExpired();
        return;
      }
      throw err;
    }
    const deletedId = pendingDelete.leagueId;
    setPendingDelete(null);
    setLeagues((prev) => prev.filter((l) => l.league_id !== deletedId));
    if (getLastOrgLeagueId() === deletedId) clearLastOrgLeagueId();
    clearActiveLeague();
  };

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
    <>
    {pendingDelete && (
      <DeleteConfirmDialog
        leagueName={pendingDelete.leagueName}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDelete(null)}
      />
    )}
    <div className="my-leagues-screen">
      <div className="my-leagues-topbar">
        <div className="my-leagues-header-row">
          <div>
            <div className="my-leagues-title">My Leagues</div>
            <div className="my-leagues-subtitle">Your organizer leagues</div>
          </div>
          <div className="my-leagues-header-actions">
            <button className="btn-outline" onClick={onCreateLeague}>
              + New League
            </button>
            <button
              className="btn-sm"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        </div>
        {signOutError && (
          <div className="my-leagues-signout-error">{signOutError}</div>
        )}
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
                onDelete={handleDeleteRequest}
                isLastOpened={getLastOrgLeagueId() === league.league_id}
              />
            ))}
          </div>
        )}

        {!loading && !error && leagues.length === 0 && (
          <div className="my-leagues-actions">
            <button className="btn-next" style={{ width: 'auto', padding: '0.65rem 1.5rem' }} onClick={onCreateLeague}>
              + Create Your First League
            </button>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

export default MyLeagues;
