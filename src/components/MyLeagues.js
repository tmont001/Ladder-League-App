import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  listMyLeagues,
  deleteLeague,
  endLeague,
  archiveLeague,
  restoreLeague,
  duplicateLeague,
  fetchPlayers,
  fetchTeams,
  ORG_SESSION_EXPIRED_MSG,
} from '../lib/db';
import { getLastOrgLeagueId, clearLastOrgLeagueId, clearActiveLeague } from '../lib/session';
import { TennisRacquetIcon, PickleballPaddleIcon, PadelRacquetIcon } from './SportIcons';
import { generateLeague } from '../utils/matchGenerator';
import { useToast } from './shared/ToastProvider';
import { useAccessibleDialog } from '../hooks/useAccessibleDialog';

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

function StatusBadge({ status }) {
  if (status === 'active') return null;
  return (
    <span className={`lifecycle-badge lifecycle-badge-${status}`}>
      {status === 'ended' ? 'Ended' : 'Archived'}
    </span>
  );
}

function ActionMenu({ league, onEnd, onArchive, onRestore, onDuplicate, onDelete }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onMousedown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKeydown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onMousedown);
    document.addEventListener('keydown', onKeydown);
    return () => {
      document.removeEventListener('mousedown', onMousedown);
      document.removeEventListener('keydown', onKeydown);
    };
  }, [open]);

  return (
    <div className="league-action-wrap" ref={wrapRef}>
      <button
        className="league-action-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="League actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="league-action-menu" role="menu">
          {league.status === 'active' && (
            <button
              className="league-action-item"
              role="menuitem"
              onClick={() => { setOpen(false); onEnd(league); }}
            >
              End League
            </button>
          )}
          {league.status === 'ended' && (
            <button
              className="league-action-item"
              role="menuitem"
              onClick={() => { setOpen(false); onArchive(league); }}
            >
              Archive
            </button>
          )}
          {league.status === 'archived' && (
            <button
              className="league-action-item"
              role="menuitem"
              onClick={() => { setOpen(false); onRestore(league); }}
            >
              Restore
            </button>
          )}
          {(league.status === 'ended' || league.status === 'archived') && (
            <button
              className="league-action-item"
              role="menuitem"
              onClick={() => { setOpen(false); onDuplicate(league); }}
            >
              Duplicate as New Season
            </button>
          )}
          <div className="league-action-sep" role="separator" />
          <button
            className="league-action-item league-action-item-danger"
            role="menuitem"
            onClick={() => { setOpen(false); onDelete(league.league_id, league.name); }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function LeagueCard({ league, onOpen, onEnd, onArchive, onRestore, onDuplicate, onDelete, isLastOpened }) {
  const SportIcon = league.sport === 'tennis' ? TennisRacquetIcon
    : league.sport === 'padel' ? PadelRacquetIcon
    : PickleballPaddleIcon;

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
          <div className="my-leagues-card-name-row">
            <div className="my-leagues-card-name">{league.name}</div>
            <StatusBadge status={league.status} />
          </div>
          <div className="my-leagues-card-meta">
            {sportLabel(league.sport)} · {league.singles_or_doubles === 'doubles' ? 'Doubles' : 'Singles'} · {modeLabel(league.mode)}
          </div>
        </div>
        <ActionMenu
          league={league}
          onEnd={onEnd}
          onArchive={onArchive}
          onRestore={onRestore}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </div>
      <div className="my-leagues-card-stats">
        <span>{participantLabel(league)}</span>
        <span className="my-leagues-stat-sep" aria-hidden="true">·</span>
        <span>{league.rounds} round{league.rounds !== 1 ? 's' : ''}</span>
      </div>
      <div className="my-leagues-card-actions">
        <button
          className="btn-next my-leagues-open-btn"
          onClick={() => onOpen(league.league_id)}
        >
          Open League
        </button>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({ leagueName, onConfirm, onCancel }) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useAccessibleDialog(true, onCancel, { disableEscape: deleting });

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
    <div className="modal-overlay">
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="delete-league-title" onClick={(e) => e.stopPropagation()}>
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

function LifecycleConfirmDialog({ action, leagueName, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useAccessibleDialog(true, onCancel, { disableEscape: busy });

  const config = {
    end: {
      title:   'End League',
      body:    <>End <strong>{leagueName}</strong>? Active competition will close. All scores and standings are preserved.</>,
      btnLabel: 'End League',
      btnClass: 'btn-danger-outline',
    },
    archive: {
      title:   'Archive League',
      body:    <>Archive <strong>{leagueName}</strong>? The league will move to Archived and can be restored later.</>,
      btnLabel: 'Archive',
      btnClass: 'btn-outline',
    },
    restore: {
      title:   'Restore League',
      body:    <>Restore <strong>{leagueName}</strong> to Ended status? The league will become visible and can be duplicated into a new season.</>,
      btnLabel: 'Restore',
      btnClass: 'btn-next',
    },
  }[action];

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setBusy(false);
      setError(err?.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="lifecycle-dialog-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" id="lifecycle-dialog-title">{config.title}</div>
          <button className="modal-close" onClick={onCancel} aria-label="Cancel" disabled={busy}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text)', fontSize: '0.9rem', marginBottom: 0 }}>{config.body}</p>
          {error && <div className="modal-error" role="alert" style={{ marginTop: '0.75rem' }}>{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn-back" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={config.btnClass} onClick={handleConfirm} disabled={busy}>
            {busy ? `${config.btnLabel}…` : config.btnLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DuplicateDialog({ leagueName, onConfirm, onCancel }) {
  const [name, setName] = useState(`${leagueName} — Season 2`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const dialogRef = useAccessibleDialog(true, onCancel, { disableEscape: busy });

  const handleConfirm = async () => {
    if (!name.trim()) {
      setError('Please enter a name for the new league.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(name.trim());
    } catch (err) {
      setBusy(false);
      setError(err?.message || 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="duplicate-dialog-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" id="duplicate-dialog-title">Duplicate as New Season</div>
          <button className="modal-close" onClick={onCancel} aria-label="Cancel" disabled={busy}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
            Creates a fresh league with the same settings and players. No match history is copied.
          </p>
          <div className="field-group">
            <label htmlFor="duplicate-name-input">New league name</label>
            <input
              id="duplicate-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              autoComplete="off"
              autoFocus
            />
          </div>
          {error && <div className="modal-error" role="alert">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="btn-back" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn-next" onClick={handleConfirm} disabled={!name.trim() || busy}>
            {busy ? 'Creating…' : 'Create New Season'}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_TABS = ['active', 'ended', 'archived'];

function MyLeagues({ onOpenLeague, onCreateLeague, onSignOut, onSessionExpired, onDuplicateLaunch }) {
  const { showToast } = useToast();
  const [leagues, setLeagues]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [signingOut, setSigningOut]     = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  const [activeStatus, setActiveStatus] = useState('active');
  const [pendingDelete, setPendingDelete]     = useState(null);
  const [pendingLifecycle, setPendingLifecycle] = useState(null); // {action, league}
  const [pendingDuplicate, setPendingDuplicate] = useState(null); // league

  const loadLeagues = useCallback(() => {
    setLoading(true);
    setError(null);
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

  useEffect(() => { loadLeagues(); }, [loadLeagues]);

  const handleSessionError = useCallback((err) => {
    if (err?.message === ORG_SESSION_EXPIRED_MSG && onSessionExpired) {
      onSessionExpired();
      return true;
    }
    return false;
  }, [onSessionExpired]);

  const handleDeleteRequest = (leagueId, leagueName) => {
    setPendingDelete({ leagueId, leagueName });
  };

  const handleDeleteConfirm = async (confirmText) => {
    try {
      await deleteLeague(pendingDelete.leagueId, confirmText);
    } catch (err) {
      if (handleSessionError(err)) return;
      throw err;
    }
    const deletedId = pendingDelete.leagueId;
    setPendingDelete(null);
    setLeagues((prev) => prev.filter((l) => l.league_id !== deletedId));
    if (getLastOrgLeagueId() === deletedId) clearLastOrgLeagueId();
    clearActiveLeague();
    showToast('League deleted.');
  };

  const handleLifecycleConfirm = async () => {
    const { action, league } = pendingLifecycle;
    const fn = { end: endLeague, archive: archiveLeague, restore: restoreLeague }[action];
    try {
      await fn(league.league_id);
    } catch (err) {
      if (handleSessionError(err)) return;
      throw err;
    }
    setPendingLifecycle(null);
    const nextStatus = action === 'end' ? 'ended' : action === 'archive' ? 'archived' : 'ended';
    setLeagues((prev) =>
      prev.map((l) =>
        l.league_id === league.league_id
          ? { ...l, status: nextStatus }
          : l,
      ),
    );
    setActiveStatus(nextStatus);
    const toastMsg = action === 'end' ? 'League ended.' : action === 'archive' ? 'League archived.' : 'League restored.';
    showToast(toastMsg);
  };

  const handleDuplicateConfirm = async (newName) => {
    const sourceLeague = pendingDuplicate;
    const isDoubles = sourceLeague.singles_or_doubles === 'doubles';

    const [sourcePlayers, sourceTeams] = await Promise.all([
      fetchPlayers(sourceLeague.league_id),
      isDoubles ? fetchTeams(sourceLeague.league_id) : Promise.resolve([]),
    ]);

    const generated = generateLeague(
      { mode: sourceLeague.mode, singlesOrDoubles: sourceLeague.singles_or_doubles, rounds: sourceLeague.rounds },
      isDoubles ? { teams: sourceTeams } : { players: sourcePlayers },
    );

    const players = sourcePlayers.map((p) => ({
      local_id: p.id, name: p.name,
      rating: p.rating ?? null, rating_type: p.ratingType ?? null, utr_url: p.utrUrl ?? null,
    }));

    const teams = isDoubles
      ? sourceTeams.map((t) => ({ local_id: t.id, player_local_ids: t.players.map((p) => p.id) }))
      : [];

    const seededOrder = generated.seededParticipants.map((p) => p.id);

    const matches = sourceLeague.mode === 'round_robin'
      ? generated.matches.map((m) => ({
          local_p1_id: m.p1?.id ?? null,
          local_p2_id: m.isBye ? null : (m.p2?.id ?? null),
          round_number: m.round,
          type: m.type || 'scheduled',
          is_bye: m.isBye || false,
        }))
      : [];

    let result;
    try {
      result = await duplicateLeague(sourceLeague.league_id, newName, players, teams, matches, seededOrder);
    } catch (err) {
      if (handleSessionError(err)) return;
      throw err;
    }

    setPendingDuplicate(null);
    onDuplicateLaunch({
      leagueId: result.leagueId,
      playerCodes: result.playerCodes,
      settings: {
        leagueName: newName,
        sport: sourceLeague.sport,
        mode: sourceLeague.mode,
        singlesOrDoubles: sourceLeague.singles_or_doubles,
      },
    });
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

  const visible = leagues.filter((l) => (l.status || 'active') === activeStatus);

  return (
    <>
      {pendingDelete && (
        <DeleteConfirmDialog
          leagueName={pendingDelete.leagueName}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {pendingLifecycle && (
        <LifecycleConfirmDialog
          action={pendingLifecycle.action}
          leagueName={pendingLifecycle.league.name}
          onConfirm={handleLifecycleConfirm}
          onCancel={() => setPendingLifecycle(null)}
        />
      )}
      {pendingDuplicate && (
        <DuplicateDialog
          leagueName={pendingDuplicate.name}
          onConfirm={handleDuplicateConfirm}
          onCancel={() => setPendingDuplicate(null)}
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
              <button className="btn-sm" onClick={handleSignOut} disabled={signingOut}>
                {signingOut ? 'Signing out…' : 'Sign Out'}
              </button>
            </div>
          </div>
          {signOutError && (
            <div className="my-leagues-signout-error">{signOutError}</div>
          )}
        </div>

        {/* Status filter tabs */}
        <div className="my-leagues-status-tabs" role="tablist" aria-label="League status filter">
          {STATUS_TABS.map((s) => {
            const count = leagues.filter((l) => (l.status || 'active') === s).length;
            return (
              <button
                key={s}
                role="tab"
                aria-selected={activeStatus === s}
                className={`my-leagues-status-tab ${activeStatus === s ? 'my-leagues-status-tab-active' : ''}`}
                onClick={() => setActiveStatus(s)}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
                {count > 0 && <span className="my-leagues-status-count">{count}</span>}
              </button>
            );
          })}
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
              <button className="btn-next" onClick={loadLeagues}>Try Again</button>
            </div>
          )}

          {!loading && !error && visible.length === 0 && (
            <div className="my-leagues-empty">
              {activeStatus === 'active' && leagues.length === 0 && (
                <p>You have no leagues yet.</p>
              )}
              {activeStatus === 'active' && leagues.length > 0 && (
                <p>No active leagues. Create a new one or restore an archived league.</p>
              )}
              {activeStatus === 'ended' && (
                <p>No ended leagues.</p>
              )}
              {activeStatus === 'archived' && (
                <p>No archived leagues.</p>
              )}
              {activeStatus === 'active' && (
                <button
                  className="btn-next"
                  style={{ width: 'auto', padding: '0.65rem 1.5rem', marginTop: '1rem' }}
                  onClick={onCreateLeague}
                >
                  + Create Your First League
                </button>
              )}
            </div>
          )}

          {!loading && !error && visible.length > 0 && (
            <div className="my-leagues-grid">
              {visible.map((league) => (
                <LeagueCard
                  key={league.league_id}
                  league={league}
                  onOpen={onOpenLeague}
                  onEnd={(l) => setPendingLifecycle({ action: 'end', league: l })}
                  onArchive={(l) => setPendingLifecycle({ action: 'archive', league: l })}
                  onRestore={(l) => setPendingLifecycle({ action: 'restore', league: l })}
                  onDuplicate={(l) => setPendingDuplicate(l)}
                  onDelete={handleDeleteRequest}
                  isLastOpened={getLastOrgLeagueId() === league.league_id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default MyLeagues;
