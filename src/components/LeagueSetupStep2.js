import Portal from './shared/Portal';
import React, { useState, useMemo, useEffect } from 'react';
import ThemeToggle from './shared/ThemeToggle';
import { TennisRacquetIcon, PickleballPaddleIcon } from './SportIcons';
import { generateLeague } from '../utils/matchGenerator';

// ─── Constants ────────────────────────────────────────────

const USTA_RATINGS = [
  '2.0',
  '2.5',
  '3.0',
  '3.5',
  '4.0',
  '4.5',
  '5.0',
  '5.5',
  '6.0',
  '6.5',
  '7.0',
];
const UTR_RATINGS = Array.from({ length: 33 }, (_, i) => (i * 0.5).toFixed(1)); // 0.0–16.0

const FORMAT_LABELS = {
  best_of_1: 'Best of 1',
  best_of_3: 'Best of 3',
  best_of_5: 'Best of 5',
};

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

function getSportIcon(sport, size = 16) {
  return sport === 'tennis' ? (
    <TennisRacquetIcon size={size} color="currentColor" />
  ) : (
    <PickleballPaddleIcon size={size} color="currentColor" />
  );
}

// ─── Bulk paste parser ────────────────────────────────────
// Accepts: "Name" (no rating) or "Name 3.5" or "Name, 3.5" or "Name - 4.0"
function parseBulkText(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed = [];
  const errors = [];

  lines.forEach((line, i) => {
    // Try to match name + optional rating
    const withRating = line.match(/^(.+?)[\s,\-–]+(\d+\.?\d*)$/);
    if (withRating) {
      const name = withRating[1].trim();
      const rating = withRating[2];
      parsed.push({
        id: generateId(),
        name,
        rating: rating || null,
        ratingType: null,
      });
    } else if (line.length > 0) {
      // Name only — no rating
      parsed.push({
        id: generateId(),
        name: line,
        rating: null,
        ratingType: null,
      });
    } else {
      errors.push(`Line ${i + 1}: couldn't parse "${line}"`);
    }
  });

  return { parsed, errors };
}

// ─── Confirmation modal ───────────────────────────────────

function ConfirmLaunchModal({ playerCount, onConfirm, onCancel }) {
  return (
    <Portal>
      <div className="modal-overlay" onClick={onCancel}>
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Ready to Launch?</div>
            <button className="modal-close" onClick={onCancel}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="confirm-icon">🚀</div>
            <p className="confirm-text">
              Once the league is launched,{' '}
              <strong>player names and ratings cannot be changed.</strong>
            </p>
            <p className="confirm-subtext">
              You're about to start a league with <strong>{playerCount}</strong>{' '}
              participant{playerCount !== 1 ? 's' : ''}. Make sure everyone's
              info is correct before continuing.
            </p>
          </div>
          <div className="modal-footer">
            <button className="btn-back" onClick={onCancel}>
              Go Back
            </button>
            <button className="btn-next btn-launch" onClick={onConfirm}>
              Confirm &amp; Launch
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Player row ───────────────────────────────────────────

function PlayerRow({ player, index, onRemove, onEdit }) {
  const ratingLabel = player.rating
    ? `${player.ratingType ? player.ratingType + ' ' : ''}${player.rating}`
    : null;

  return (
    <div className="player-row">
      <div className="player-rank">{index + 1}</div>
      <div className="player-info">
        <div className="player-name-line">
          <span className="player-name">{player.name}</span>
          {player.utrUrl && (
            <a
              className="utr-profile-link"
              href={
                player.utrUrl.startsWith('http')
                  ? player.utrUrl
                  : `https://${player.utrUrl}`
              }
              target="_blank"
              rel="noopener noreferrer"
              title="View UTR profile"
              onClick={(e) => e.stopPropagation()}
            >
              UTR ↗
            </a>
          )}
        </div>
        {ratingLabel ? (
          <span className="player-rating-badge">{ratingLabel}</span>
        ) : (
          <span className="player-rating-badge player-rating-none">
            No rating
          </span>
        )}
      </div>
      <div className="player-actions">
        <button
          className="btn-icon"
          onClick={() => onEdit(player)}
          aria-label="Edit"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          className="btn-icon btn-icon-danger"
          onClick={() => onRemove(player.id)}
          aria-label="Remove"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function TeamRow({ team, index, onRemove }) {
  const avgRating = team.players.every((p) => p.rating)
    ? (
        team.players.reduce((s, p) => s + parseFloat(p.rating), 0) /
        team.players.length
      ).toFixed(1)
    : null;

  return (
    <div className="player-row">
      <div className="player-rank">{index + 1}</div>
      <div className="player-info">
        <span className="player-name">
          {team.players.map((p) => p.name).join(' & ')}
        </span>
        {avgRating ? (
          <span className="player-rating-badge">{avgRating} avg</span>
        ) : (
          <span className="player-rating-badge player-rating-none">
            No rating
          </span>
        )}
      </div>
      <div className="player-actions">
        <button
          className="btn-icon btn-icon-danger"
          onClick={() => onRemove(team.id)}
          aria-label="Remove"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Settings summary (right panel) ──────────────────────

function SettingsSummary({ settings, overrides, onOverride }) {
  const isDoubles = settings.singlesOrDoubles === 'doubles';

  return (
    <div className="summary-card summary-card-compact">
      <div className="summary-card-title">
        League Settings
        <span className="summary-edit-hint">editable</span>
      </div>
      <div className="summary-rows">
        <div className="summary-row">
          <span className="summary-row-label">Sport</span>
          <span className="summary-row-value summary-sport-value">
            {getSportIcon(settings.sport, 13)}
            {settings.sport.charAt(0).toUpperCase() + settings.sport.slice(1)}
          </span>
        </div>

        <div className="summary-row">
          <span className="summary-row-label">Format</span>
          <span className="summary-row-value">
            {isDoubles ? 'Doubles' : 'Singles'} ·{' '}
            {FORMAT_LABELS[settings.format]}
          </span>
        </div>

        <div className="summary-row">
          <span className="summary-row-label">Mode</span>
          <span className="summary-row-value">
            {settings.mode === 'ladder' ? 'Ladder' : 'Round Robin'}
          </span>
        </div>

        {settings.mode !== 'ladder' && (
          <div className="summary-row summary-row-edit">
            <span className="summary-row-label">Rounds</span>
            <div className="summary-inline-edit">
              <button
                className="edit-stepper"
                onClick={() =>
                  onOverride(
                    'rounds',
                    Math.max(1, (overrides.rounds ?? settings.rounds) - 1),
                  )
                }
              >
                −
              </button>
              <span className="edit-stepper-val">
                {overrides.rounds ?? settings.rounds}
              </span>
              <button
                className="edit-stepper"
                onClick={() =>
                  onOverride(
                    'rounds',
                    Math.min(16, (overrides.rounds ?? settings.rounds) + 1),
                  )
                }
              >
                +
              </button>
            </div>
          </div>
        )}

        {settings.mode === 'ladder' && (
          <div className="summary-row">
            <span className="summary-row-label">Challenge</span>
            <span className="summary-row-value">
              ±{settings.challengeSpots} spots
            </span>
          </div>
        )}

        <div className="summary-row">
          <span className="summary-row-label">Advance</span>
          <span className="summary-row-value">
            {settings.autoAdvance ? 'Auto' : 'Manual'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Round 1 preview (right panel) ────────────────────────

function Round1Preview({ rounds, isDoubles }) {
  const [expanded, setExpanded] = useState(false);
  if (!rounds?.length) return null;
  const matches = rounds[0].matches;
  const LIMIT = 4;
  const shown = expanded ? matches : matches.slice(0, LIMIT);

  function pName(p) {
    if (!p) return 'BYE';
    return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
  }

  return (
    <div className="summary-card summary-card-compact">
      <div className="summary-card-title">Round 1 Preview</div>
      <div className="matchup-list matchup-list-compact">
        {shown.map((m, i) => (
          <div className="matchup-row" key={m.id}>
            <span className="matchup-num">{i + 1}</span>
            {m.isBye ? (
              <span className="matchup-vs">
                <span className="matchup-player">{pName(m.p1)}</span>
                <span className="matchup-bye-badge">BYE</span>
              </span>
            ) : (
              <span className="matchup-vs">
                <span className="matchup-player">{pName(m.p1)}</span>
                <span className="matchup-divider">vs</span>
                <span className="matchup-player">{pName(m.p2)}</span>
              </span>
            )}
          </div>
        ))}
      </div>
      {!expanded && matches.length > LIMIT && (
        <button className="btn-show-more" onClick={() => setExpanded(true)}>
          + {matches.length - LIMIT} more
        </button>
      )}
    </div>
  );
}

// ─── Main combined step ───────────────────────────────────

function LeagueSetupStep2({ settings, onLaunch, onBack, initialData, launchError }) {
  const isDoubles = settings?.singlesOrDoubles === 'doubles';

  // ── Player state ─────────────────────────────────────────
  const [players, setPlayers] = useState(initialData?.players || []);
  const [teams, setTeams] = useState(initialData?.teams || []);

  // Add/edit form
  const [newName, setNewName] = useState('');
  const [ratingType, setRatingType] = useState('USTA'); // 'USTA' | 'UTR' | 'none'
  const [newRating, setNewRating] = useState('3.5');
  const [newUtrUrl, setNewUtrUrl] = useState('');
  const [editingId, setEditingId] = useState(null);

  // Bulk paste
  const [entryMode, setEntryMode] = useState('individual');
  const [bulkText, setBulkText] = useState('');
  const [bulkErrors, setBulkErrors] = useState([]);
  const [bulkSuccess, setBulkSuccess] = useState(0);

  // Doubles pairing
  const [pairSelect, setPairSelect] = useState({ p1: '', p2: '' });
  const [pairError, setPairError] = useState('');

  // Settings overrides (rounds)
  const [overrides, setOverrides] = useState({ rounds: settings?.rounds });
  const setOverride = (key, val) =>
    setOverrides((prev) => ({ ...prev, [key]: val }));

  // Confirmation modal
  const [showConfirm, setShowConfirm] = useState(false);
  const [launching, setLaunching] = useState(false);

  // When the parent reports a launch error, re-enable the button.
  useEffect(() => {
    if (launchError) setLaunching(false);
  }, [launchError]);

  // ── Computed ─────────────────────────────────────────────
  const effectiveSettings = useMemo(
    () => ({ ...settings, rounds: overrides.rounds ?? settings.rounds }),
    [settings, overrides.rounds],
  );

  const effectivePlayerData = useMemo(
    () => ({ players, teams }),
    [players, teams],
  );

  const participantCount = isDoubles ? teams.length : players.length;
  const canLaunch = participantCount >= 2;

  const preview = useMemo(
    () =>
      canLaunch ? generateLeague(effectiveSettings, effectivePlayerData) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveSettings.rounds, players.length, teams.length],
  );

  // ── Rating options based on type ─────────────────────────
  const ratingOptions =
    ratingType === 'USTA'
      ? USTA_RATINGS
      : ratingType === 'UTR'
        ? UTR_RATINGS
        : [];

  // ── Player CRUD ──────────────────────────────────────────
  const buildRating = () => (ratingType === 'none' ? null : newRating);

  const addOrSavePlayer = () => {
    if (!newName.trim()) return;
    const rating = buildRating();
    const utrUrl = newUtrUrl.trim() || null;

    if (editingId) {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === editingId
            ? {
                ...p,
                name: newName.trim(),
                rating,
                ratingType: ratingType === 'none' ? null : ratingType,
                utrUrl,
                ustaRating: rating || '0',
              }
            : p,
        ),
      );
      setEditingId(null);
    } else {
      setPlayers((prev) => [
        ...prev,
        {
          id: generateId(),
          name: newName.trim(),
          rating,
          ratingType: ratingType === 'none' ? null : ratingType,
          utrUrl,
          ustaRating: rating || '0',
        },
      ]);
    }
    setNewName('');
    setNewRating(ratingType === 'UTR' ? '8.0' : '3.5');
    setNewUtrUrl('');
  };

  const startEdit = (player) => {
    setEditingId(player.id);
    setNewName(player.name);
    setRatingType(player.ratingType || (player.rating ? 'USTA' : 'none'));
    setNewRating(player.rating || '3.5');
    setNewUtrUrl(player.utrUrl || '');
    setEntryMode('individual');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setNewName('');
    setNewRating('3.5');
    setNewUtrUrl('');
  };

  const removePlayer = (id) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    setTeams((prev) => prev.filter((t) => !t.players.some((p) => p.id === id)));
    if (editingId === id) cancelEdit();
  };

  // ── Bulk import ──────────────────────────────────────────
  const handleBulkImport = () => {
    const { parsed, errors } = parseBulkText(bulkText);
    setBulkErrors(errors);
    setBulkSuccess(parsed.length);
    if (parsed.length > 0) {
      // Add ustaRating alias for seeding
      const withAlias = parsed.map((p) => ({
        ...p,
        ustaRating: p.rating || '0',
      }));
      setPlayers((prev) => [...prev, ...withAlias]);
      setBulkText('');
    }
  };

  // ── Doubles pairing ──────────────────────────────────────
  const pairedIds = new Set(teams.flatMap((t) => t.players.map((p) => p.id)));
  const unpairedPlayers = players.filter((p) => !pairedIds.has(p.id));

  const addTeam = () => {
    if (!pairSelect.p1 || !pairSelect.p2) {
      setPairError('Select two players.');
      return;
    }
    if (pairSelect.p1 === pairSelect.p2) {
      setPairError('Players must be different.');
      return;
    }
    const p1 = players.find((p) => p.id === pairSelect.p1);
    const p2 = players.find((p) => p.id === pairSelect.p2);
    setTeams((prev) => [...prev, { id: generateId(), players: [p1, p2] }]);
    setPairSelect({ p1: '', p2: '' });
    setPairError('');
  };

  // ── Launch flow ──────────────────────────────────────────
  const handleLaunchClick = () => {
    if (!canLaunch) return;
    setShowConfirm(true);
  };

  const handleConfirmed = () => {
    setShowConfirm(false);
    setLaunching(true);
    setTimeout(() => {
      const leagueData = generateLeague(effectiveSettings, effectivePlayerData);
      onLaunch(leagueData, effectiveSettings);
    }, 600);
  };

  // ── Rating type change ───────────────────────────────────
  const handleRatingTypeChange = (type) => {
    setRatingType(type);
    setNewRating(type === 'UTR' ? '8.0' : type === 'USTA' ? '3.5' : '');
  };

  return (
    <div className="wizard-card wizard-card-wide">
      <div className="card-accent" />

      {/* ── Header ── */}
      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">
              Step 2 of 2 — Players &amp; Review
            </div>
          </div>
          <ThemeToggle />
        </div>
        <div className="step-dots">
          <div className="dot done" />
          <div className="dot active" />
        </div>
      </div>

      {/* ── League name banner ── */}
      <div className="card-body">
        <div className="league-name-banner">
          <span className="league-name-sport-icon">
            {getSportIcon(settings.sport, 20)}
          </span>
          <span className="league-name-text">{settings.leagueName}</span>
        </div>

        {/* ── Two-column layout ── */}
        <div className="setup-review-grid">
          {/* ── LEFT: Player entry ── */}
          <div className="setup-left">
            {/* Entry mode switcher */}
            <div className="field-group">
              <label>Add Players</label>
              <div className="segment-group">
                {['individual', 'bulk'].map((m) => (
                  <button
                    key={m}
                    className={`segment ${entryMode === m ? 'active' : ''}`}
                    onClick={() => {
                      setEntryMode(m);
                      setBulkErrors([]);
                      setBulkSuccess(0);
                      cancelEdit();
                    }}
                  >
                    {m === 'individual' ? 'One by One' : 'Bulk Paste'}
                  </button>
                ))}
              </div>
            </div>

            {/* Individual entry */}
            {entryMode === 'individual' && (
              <div className="field-group">
                <label>{editingId ? 'Editing Player' : 'New Player'}</label>

                {/* Name input */}
                <input
                  type="text"
                  placeholder="Full name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === 'Enter' && newName.trim() && addOrSavePlayer()
                  }
                  className="player-name-input"
                  style={{ marginBottom: '6px' }}
                />

                {/* Rating type + value */}
                <div className="rating-row">
                  <div className="rating-type-group">
                    {['USTA', 'UTR', 'none'].map((t) => (
                      <button
                        key={t}
                        className={`rating-type-btn ${ratingType === t ? 'active' : ''}`}
                        onClick={() => handleRatingTypeChange(t)}
                      >
                        {t === 'none' ? 'No rating' : t}
                      </button>
                    ))}
                  </div>

                  {ratingType !== 'none' && (
                    <select
                      className="player-rating-select"
                      value={newRating}
                      onChange={(e) => setNewRating(e.target.value)}
                    >
                      {ratingOptions.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {ratingType !== 'none' && (
                  <div className="field-hint" style={{ marginBottom: '6px' }}>
                    {ratingType === 'USTA'
                      ? '↳ USTA rating (2.0–7.0). Used for seeding.'
                      : '↳ UTR rating (0.0–16.0). Used for seeding.'}
                  </div>
                )}
                {ratingType === 'none' && (
                  <div className="field-hint" style={{ marginBottom: '6px' }}>
                    ↳ Player will be seeded randomly.
                  </div>
                )}

                {/* UTR profile URL */}
                <div className="utr-url-row">
                  <input
                    type="url"
                    className="utr-url-input"
                    placeholder="UTR profile URL (optional) — utrsports.net/profiles/…"
                    value={newUtrUrl}
                    onChange={(e) => setNewUtrUrl(e.target.value)}
                  />
                </div>

                {/* Add / Save button row */}
                <div className="player-add-row">
                  <button
                    className={`btn-add ${editingId ? 'btn-add-edit' : ''}`}
                    style={{ flex: 1 }}
                    onClick={addOrSavePlayer}
                    disabled={!newName.trim()}
                  >
                    {editingId ? 'Save Changes' : '+ Add Player'}
                  </button>
                  {editingId && (
                    <button className="btn-cancel" onClick={cancelEdit}>
                      ✕ Cancel
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bulk paste */}
            {entryMode === 'bulk' && (
              <div className="field-group">
                <label>Paste Player List</label>
                <textarea
                  className="bulk-textarea"
                  placeholder={`One player per line (rating optional):\nJohn Smith 3.5\nJane Doe\nAlex Johnson 4.0`}
                  value={bulkText}
                  onChange={(e) => {
                    setBulkText(e.target.value);
                    setBulkErrors([]);
                    setBulkSuccess(0);
                  }}
                  rows={5}
                />
                <div className="field-hint">
                  Format: <code>Name</code> or <code>Name 3.5</code> — ratings
                  are optional
                </div>
                {bulkErrors.map((e, i) => (
                  <div key={i} className="bulk-error-line">
                    ⚠ {e}
                  </div>
                ))}
                {bulkSuccess > 0 && (
                  <div className="bulk-success">
                    ✓ Added {bulkSuccess} player{bulkSuccess !== 1 ? 's' : ''}
                  </div>
                )}
                <button
                  className="btn-bulk-import"
                  onClick={handleBulkImport}
                  disabled={!bulkText.trim()}
                >
                  Import Players
                </button>
              </div>
            )}

            {/* Player roster list */}
            {players.length > 0 && (
              <div className="field-group">
                <label>
                  Roster
                  <span
                    className={`label-count ${canLaunch ? '' : 'label-count-warn'}`}
                  >
                    {players.length}
                  </span>
                </label>
                <div className="player-list">
                  {players.map((p, i) => (
                    <PlayerRow
                      key={p.id}
                      player={p}
                      index={i}
                      onRemove={removePlayer}
                      onEdit={startEdit}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Doubles pairing */}
            {isDoubles && players.length >= 2 && (
              <div className="field-group">
                <label>
                  Pair Teams
                  {unpairedPlayers.length > 0 && (
                    <span className="label-count label-count-warn">
                      {unpairedPlayers.length} unpaired
                    </span>
                  )}
                </label>
                <div className="pair-row">
                  <select
                    value={pairSelect.p1}
                    onChange={(e) =>
                      setPairSelect((s) => ({ ...s, p1: e.target.value }))
                    }
                  >
                    <option value="">Player 1</option>
                    {unpairedPlayers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <span className="pair-amp">&amp;</span>
                  <select
                    value={pairSelect.p2}
                    onChange={(e) =>
                      setPairSelect((s) => ({ ...s, p2: e.target.value }))
                    }
                  >
                    <option value="">Player 2</option>
                    {unpairedPlayers
                      .filter((p) => p.id !== pairSelect.p1)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <button className="btn-add" onClick={addTeam}>
                    +
                  </button>
                </div>
                {pairError && <div className="pair-error">⚠ {pairError}</div>}
                {teams.length > 0 && (
                  <div className="player-list" style={{ marginTop: '0.5rem' }}>
                    {teams.map((t, i) => (
                      <TeamRow
                        key={t.id}
                        team={t}
                        index={i}
                        onRemove={(id) =>
                          setTeams((prev) => prev.filter((x) => x.id !== id))
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {players.length === 0 && (
              <div className="setup-empty-hint">
                Add at least 2 players to generate matchups and preview the
                schedule →
              </div>
            )}
          </div>

          {/* ── RIGHT: Settings + preview ── */}
          <div className="setup-right setup-right-sticky">
            <SettingsSummary
              settings={settings}
              overrides={overrides}
              onOverride={setOverride}
            />

            {preview && settings.mode !== 'ladder' && (
              <Round1Preview rounds={preview.rounds} isDoubles={isDoubles} />
            )}

            {settings.mode === 'ladder' && canLaunch && (
              <div className="summary-card summary-card-compact">
                <div className="summary-card-title">How Ladder Works</div>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5 }}>
                  Matches are created when players issue and accept challenges. No schedule is pre-generated.
                </p>
              </div>
            )}

            {players.length > 0 && !canLaunch && (
              <div className="launch-warning">
                ⚠ Need at least 2 {isDoubles ? 'teams' : 'players'} to launch.
              </div>
            )}

            <div className="launch-notice">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Seeding is based on rating. Players without a rating are seeded
              last.
            </div>
          </div>
        </div>
      </div>

      {/* ── Launch error ── */}
      {launchError && (
        <div className="picker-error" role="alert" style={{ margin: '0 16px 12px' }}>
          {launchError}
        </div>
      )}

      {/* ── Footer ── */}
      <div className="card-footer card-footer-two">
        <button className="btn-back" onClick={onBack} disabled={launching}>
          ← Back
        </button>
        <button
          className={`btn-next btn-launch ${launching ? 'btn-launching' : ''}`}
          onClick={handleLaunchClick}
          disabled={!canLaunch || launching}
        >
          {launching ? (
            <>
              <span className="launch-spinner" /> Generating League…
            </>
          ) : (
            '🚀 Launch League'
          )}
        </button>
      </div>

      {/* ── Confirmation modal ── */}
      {showConfirm && (
        <ConfirmLaunchModal
          playerCount={participantCount}
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}

export default LeagueSetupStep2;
