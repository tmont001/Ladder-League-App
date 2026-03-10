import React, { useState } from 'react';
import ThemeToggle from './shared/ThemeToggle';

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

// ─── Utility ──────────────────────────────────────────────
function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

function parseBulkText(text) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed = [];
  const errors = [];

  lines.forEach((line, i) => {
    // Accept: "John Smith 3.5" or "John Smith, 3.5" or "John Smith - 3.5"
    const match = line.match(/^(.+?)[\s,\-–]+(\d+\.?\d*)$/);
    if (match) {
      const name = match[1].trim();
      const rating = match[2];
      if (USTA_RATINGS.includes(rating)) {
        parsed.push({ id: generateId(), name, ustaRating: rating });
      } else {
        errors.push(`Line ${i + 1}: invalid rating "${rating}" for "${name}"`);
      }
    } else {
      errors.push(
        `Line ${i + 1}: couldn't parse "${line}" — use format "Name 3.5"`,
      );
    }
  });

  return { parsed, errors };
}

// ─── Sub-components ───────────────────────────────────────

function PlayerRow({ player, index, onRemove, onEdit }) {
  return (
    <div className="player-row">
      <div className="player-rank">{index + 1}</div>
      <div className="player-info">
        <span className="player-name">{player.name}</span>
        <span className="player-rating-badge">{player.ustaRating}</span>
      </div>
      <div className="player-actions">
        <button
          className="btn-icon"
          onClick={() => onEdit(player)}
          aria-label="Edit player"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        <button
          className="btn-icon btn-icon-danger"
          onClick={() => onRemove(player.id)}
          aria-label="Remove player"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
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
  return (
    <div className="player-row">
      <div className="player-rank">{index + 1}</div>
      <div className="player-info">
        <span className="player-name">
          {team.players.map((p) => p.name).join(' & ')}
        </span>
        <span className="player-rating-badge">
          {(
            team.players.reduce((sum, p) => sum + parseFloat(p.ustaRating), 0) /
            team.players.length
          ).toFixed(1)}{' '}
          avg
        </span>
      </div>
      <div className="player-actions">
        <button
          className="btn-icon btn-icon-danger"
          onClick={() => onRemove(team.id)}
          aria-label="Remove team"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
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

// ─── Main Component ───────────────────────────────────────

function LeagueSetupStep2({ settings, onNext, onBack }) {
  const isDoubles = settings?.singlesOrDoubles === 'doubles';

  // Players pool (always needed; for doubles, used to form teams)
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);

  // Individual add form
  const [newName, setNewName] = useState('');
  const [newRating, setNewRating] = useState('3.5');
  const [editingPlayer, setEditingPlayer] = useState(null);

  // Bulk paste
  const [mode, setMode] = useState('individual'); // 'individual' | 'bulk'
  const [bulkText, setBulkText] = useState('');
  const [bulkErrors, setBulkErrors] = useState([]);
  const [bulkSuccess, setBulkSuccess] = useState(0);

  // Doubles pairing
  const [pairSelect, setPairSelect] = useState({ p1: '', p2: '' });
  const [pairError, setPairError] = useState('');

  // ── Player CRUD ──────────────────────────────────────────
  const addPlayer = () => {
    if (!newName.trim()) return;
    if (editingPlayer) {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === editingPlayer.id
            ? { ...p, name: newName.trim(), ustaRating: newRating }
            : p,
        ),
      );
      setEditingPlayer(null);
    } else {
      setPlayers((prev) => [
        ...prev,
        { id: generateId(), name: newName.trim(), ustaRating: newRating },
      ]);
    }
    setNewName('');
    setNewRating('3.5');
  };

  const startEdit = (player) => {
    setEditingPlayer(player);
    setNewName(player.name);
    setNewRating(player.ustaRating);
    setMode('individual');
  };

  const cancelEdit = () => {
    setEditingPlayer(null);
    setNewName('');
    setNewRating('3.5');
  };

  const removePlayer = (id) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    // Also remove from any team
    setTeams((prev) => prev.filter((t) => !t.players.some((p) => p.id === id)));
  };

  // ── Bulk parse ───────────────────────────────────────────
  const handleBulkImport = () => {
    const { parsed, errors } = parseBulkText(bulkText);
    setBulkErrors(errors);
    setBulkSuccess(parsed.length);
    if (parsed.length > 0) {
      setPlayers((prev) => [...prev, ...parsed]);
      setBulkText('');
    }
  };

  // ── Doubles pairing ──────────────────────────────────────
  const pairedPlayerIds = new Set(
    teams.flatMap((t) => t.players.map((p) => p.id)),
  );
  const unpairedPlayers = players.filter((p) => !pairedPlayerIds.has(p.id));

  const addTeam = () => {
    if (!pairSelect.p1 || !pairSelect.p2) {
      setPairError('Please select two players.');
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

  const removeTeam = (id) =>
    setTeams((prev) => prev.filter((t) => t.id !== id));

  // ── Validation ───────────────────────────────────────────
  const singlesReady = !isDoubles && players.length >= 2;
  const doublesReady = isDoubles && teams.length >= 2;
  const canContinue = singlesReady || doublesReady;

  const handleNext = () => {
    if (!canContinue) return;
    onNext({ players, teams });
  };

  // ── Minimum count label ──────────────────────────────────
  const countLabel = isDoubles
    ? `${teams.length} team${teams.length !== 1 ? 's' : ''} — need at least 2 to continue`
    : `${players.length} player${players.length !== 1 ? 's' : ''} — need at least 2 to continue`;

  return (
    <div className="wizard-card">
      <div className="card-accent" />

      {/* ── Header ── */}
      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">Step 2 of 3 — Add Players</div>
          </div>
          <ThemeToggle />
        </div>
        <div className="step-dots">
          <div className="dot done" />
          <div className="dot active" />
          <div className="dot idle" />
        </div>
      </div>

      <div className="card-body">
        {/* ── Mode Switcher ── */}
        <div className="field-group">
          <label>Entry Mode</label>
          <div className="segment-group">
            {['individual', 'bulk'].map((m) => (
              <button
                key={m}
                className={`segment ${mode === m ? 'active' : ''}`}
                onClick={() => {
                  setMode(m);
                  setBulkErrors([]);
                  setBulkSuccess(0);
                }}
              >
                {m === 'individual' ? 'Add Individually' : 'Bulk Paste'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Individual Entry ── */}
        {mode === 'individual' && (
          <div className="field-group">
            <label>{editingPlayer ? 'Editing Player' : 'New Player'}</label>
            <div className="player-add-row">
              <input
                type="text"
                placeholder="Full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                className="player-name-input"
              />
              <select
                value={newRating}
                onChange={(e) => setNewRating(e.target.value)}
                className="player-rating-select"
              >
                {USTA_RATINGS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                className={`btn-add ${editingPlayer ? 'btn-add-edit' : ''}`}
                onClick={addPlayer}
                disabled={!newName.trim()}
              >
                {editingPlayer ? 'Save' : '+'}
              </button>
              {editingPlayer && (
                <button className="btn-cancel" onClick={cancelEdit}>
                  ✕
                </button>
              )}
            </div>
            <div className="field-hint">
              Press Enter or click + to add. USTA rating required.
            </div>
          </div>
        )}

        {/* ── Bulk Entry ── */}
        {mode === 'bulk' && (
          <div className="field-group">
            <label>Paste Player List</label>
            <textarea
              className="bulk-textarea"
              placeholder={`One player per line:\nJohn Smith 3.5\nJane Doe 4.0\nAlex Johnson, 3.0`}
              value={bulkText}
              onChange={(e) => {
                setBulkText(e.target.value);
                setBulkErrors([]);
                setBulkSuccess(0);
              }}
              rows={6}
            />
            <div className="field-hint">
              Format: <code>Name Rating</code> — e.g.{' '}
              <code>John Smith 3.5</code>
            </div>
            {bulkErrors.length > 0 && (
              <div className="bulk-errors">
                {bulkErrors.map((e, i) => (
                  <div key={i} className="bulk-error-line">
                    ⚠ {e}
                  </div>
                ))}
              </div>
            )}
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

        {/* ── Player List ── */}
        {players.length > 0 && (
          <div className="field-group">
            <label>
              Roster
              <span className="label-count">{players.length}</span>
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

        {/* ── Doubles Team Pairing ── */}
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
                    {p.name} ({p.ustaRating})
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
                      {p.name} ({p.ustaRating})
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
                    onRemove={removeTeam}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Count status ── */}
        {(players.length > 0 || teams.length > 0) && (
          <div
            className={`count-status ${canContinue ? 'count-status-ok' : ''}`}
          >
            {countLabel}
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="card-footer card-footer-two">
        <button className="btn-back" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn-next"
          disabled={!canContinue}
          onClick={handleNext}
        >
          Review &amp; Launch →
        </button>
      </div>
    </div>
  );
}

export default LeagueSetupStep2;
