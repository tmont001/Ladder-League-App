import React, { useState, useMemo } from 'react';
import ThemeToggle from './shared/ThemeToggle';
import { TennisRacquetIcon, PickleballPaddleIcon } from './SportIcons';
import { generateLeague } from '../utils/matchGenerator';

// ─── Helpers ──────────────────────────────────────────────

const FORMAT_LABELS = {
  best_of_1: 'Best of 1',
  best_of_3: 'Best of 3',
  best_of_5: 'Best of 5',
};

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

function getSportIcon(sport, size = 16) {
  return sport === 'tennis' ? (
    <TennisRacquetIcon size={size} color="currentColor" />
  ) : (
    <PickleballPaddleIcon size={size} color="currentColor" />
  );
}

function getParticipantName(p, isDoubles) {
  return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
}

function getParticipantRating(p, isDoubles) {
  if (isDoubles) {
    const avg =
      p.players.reduce((s, pl) => s + parseFloat(pl.ustaRating), 0) /
      p.players.length;
    return avg.toFixed(1);
  }
  return p.ustaRating;
}

// ─── Editable Settings Summary ────────────────────────────

function SettingsSummary({ settings, overrides, onOverride }) {
  const isDoubles = settings.singlesOrDoubles === 'doubles';

  return (
    <div className="summary-card">
      <div className="summary-card-title">
        League Settings
        <span className="summary-edit-hint">editable</span>
      </div>
      <div className="summary-rows">
        <div className="summary-row">
          <span className="summary-row-label">Sport</span>
          <span className="summary-row-value">
            <span className="summary-sport-value">
              {getSportIcon(settings.sport, 14)}
              {settings.sport.charAt(0).toUpperCase() + settings.sport.slice(1)}
            </span>
          </span>
        </div>

        <div className="summary-row">
          <span className="summary-row-label">Format</span>
          <span className="summary-row-value">
            {isDoubles ? 'Doubles' : 'Singles'} ·{' '}
            {FORMAT_LABELS[settings.format]}
          </span>
        </div>

        {/* Editable: rounds */}
        <div className="summary-row summary-row-edit">
          <span className="summary-row-label">Rounds</span>
          <div className="summary-inline-edit">
            <button
              className="edit-stepper"
              onClick={() =>
                onOverride(
                  'rounds',
                  Math.max(1, (overrides.rounds || settings.rounds) - 1),
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
                  Math.min(16, (overrides.rounds || settings.rounds) + 1),
                )
              }
            >
              +
            </button>
          </div>
        </div>

        <div className="summary-row">
          <span className="summary-row-label">Challenge Window</span>
          <span className="summary-row-value">
            ±{settings.challengeSpots} spots
          </span>
        </div>

        <div className="summary-row">
          <span className="summary-row-label">Round Advance</span>
          <span className="summary-row-value">
            {settings.autoAdvance ? 'Auto + Manual' : 'Manual only'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Editable Roster Preview ──────────────────────────────

function RosterPreview({ playerData, settings, overrides, onOverride }) {
  const isDoubles = settings.singlesOrDoubles === 'doubles';
  const allParticipants = isDoubles ? playerData.teams : playerData.players;
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editRating, setEditRating] = useState('3.5');

  const excluded = overrides.excludedIds || new Set();
  const editedMap = overrides.editedMap || {}; // id → { name, ustaRating }

  const activeParticipants = allParticipants.filter((p) => !excluded.has(p.id));

  const PREVIEW_LIMIT = 5;
  const shown = expanded
    ? activeParticipants
    : activeParticipants.slice(0, PREVIEW_LIMIT);
  const remaining = activeParticipants.length - PREVIEW_LIMIT;

  const toggleExclude = (id) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onOverride('excludedIds', next);
  };

  const startEdit = (p) => {
    const current = editedMap[p.id] || p;
    setEditingId(p.id);
    setEditName(isDoubles ? '' : current.name || p.name);
    setEditRating(isDoubles ? '' : current.ustaRating || p.ustaRating);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = (p) => {
    if (!isDoubles && !editName.trim()) return;
    const next = {
      ...editedMap,
      [p.id]: isDoubles
        ? {}
        : { name: editName.trim(), ustaRating: editRating },
    };
    onOverride('editedMap', next);
    setEditingId(null);
  };

  // Resolve a participant's display values (may be overridden)
  const resolve = (p) => {
    if (isDoubles) return p;
    const edit = editedMap[p.id];
    if (!edit) return p;
    return { ...p, name: edit.name, ustaRating: edit.ustaRating };
  };

  return (
    <div className="summary-card">
      <div className="summary-card-title">
        Roster
        <span className="label-count">{activeParticipants.length}</span>
        {excluded.size > 0 && (
          <span className="label-count label-count-warn">
            {excluded.size} removed
          </span>
        )}
        <span className="summary-edit-hint">edit · remove</span>
      </div>

      <div className="roster-list">
        {shown.map((p, i) => {
          const resolved = resolve(p);
          const isEditing = editingId === p.id;

          return (
            <div key={p.id}>
              {isEditing && !isDoubles ? (
                /* ── Inline edit form ── */
                <div className="roster-edit-row">
                  <span className="roster-seed">{i + 1}</span>
                  <input
                    className="roster-edit-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(p);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    autoFocus
                  />
                  <select
                    className="roster-edit-rating"
                    value={editRating}
                    onChange={(e) => setEditRating(e.target.value)}
                  >
                    {USTA_RATINGS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    className="roster-edit-save"
                    onClick={() => saveEdit(p)}
                  >
                    ✓
                  </button>
                  <button className="roster-edit-cancel" onClick={cancelEdit}>
                    ✕
                  </button>
                </div>
              ) : (
                /* ── Normal display row ── */
                <div className="roster-row">
                  <span className="roster-seed">{i + 1}</span>
                  <span className="roster-name">
                    {getParticipantName(resolved, isDoubles)}
                    {editedMap[p.id] && (
                      <span className="roster-edited-tag">edited</span>
                    )}
                  </span>
                  <span className="player-rating-badge">
                    {getParticipantRating(resolved, isDoubles)}
                  </span>
                  {!isDoubles && (
                    <button
                      className="roster-action-btn roster-edit-btn"
                      onClick={() => startEdit(p)}
                      title="Edit player"
                    >
                      <svg
                        width="11"
                        height="11"
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
                  )}
                  <button
                    className="roster-action-btn roster-remove-btn"
                    onClick={() => toggleExclude(p.id)}
                    title="Remove from league"
                  >
                    −
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Excluded players — can be re-added */}
      {excluded.size > 0 && (
        <div className="roster-excluded">
          {allParticipants
            .filter((p) => excluded.has(p.id))
            .map((p) => (
              <div className="roster-excluded-row" key={p.id}>
                <span className="roster-excluded-name">
                  {getParticipantName(p, isDoubles)}
                </span>
                <button
                  className="roster-readd-btn"
                  onClick={() => toggleExclude(p.id)}
                >
                  + Add back
                </button>
              </div>
            ))}
        </div>
      )}

      {!expanded && remaining > 0 && (
        <button className="btn-show-more" onClick={() => setExpanded(true)}>
          + {remaining} more
        </button>
      )}
      {expanded && activeParticipants.length > PREVIEW_LIMIT && (
        <button className="btn-show-more" onClick={() => setExpanded(false)}>
          Show less
        </button>
      )}
    </div>
  );
}

// ─── Round 1 Preview ──────────────────────────────────────

function Round1Preview({ rounds, isDoubles }) {
  if (!rounds || rounds.length === 0) return null;
  const round1 = rounds[0];

  return (
    <div className="summary-card">
      <div className="summary-card-title">Round 1 Matchups</div>
      <div className="matchup-list">
        {round1.matches.map((match, i) => (
          <div className="matchup-row" key={match.id}>
            <span className="matchup-num">{i + 1}</span>
            {match.isBye ? (
              <span className="matchup-bye">
                <span className="matchup-player">
                  {getParticipantName(match.p1, isDoubles)}
                </span>
                <span className="matchup-bye-badge">BYE</span>
              </span>
            ) : (
              <span className="matchup-vs">
                <span className="matchup-player">
                  {getParticipantName(match.p1, isDoubles)}
                </span>
                <span className="matchup-divider">vs</span>
                <span className="matchup-player">
                  {getParticipantName(match.p2, isDoubles)}
                </span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

function LeagueSetupStep3({ settings, playerData, onLaunch, onBack }) {
  const isDoubles = settings.singlesOrDoubles === 'doubles';
  const [launching, setLaunching] = useState(false);
  const [overrides, setOverrides] = useState({
    rounds: settings.rounds,
    excludedIds: new Set(),
    editedMap: {},
  });

  const setOverride = (key, val) =>
    setOverrides((prev) => ({ ...prev, [key]: val }));

  const effectiveSettings = {
    ...settings,
    rounds: overrides.rounds ?? settings.rounds,
  };

  // Apply edits and exclusions to playerData
  const effectivePlayerData = useMemo(() => {
    const excluded = overrides.excludedIds || new Set();
    const editedMap = overrides.editedMap || {};

    const applyEdits = (players) =>
      players
        .filter((p) => !excluded.has(p.id))
        .map((p) => (editedMap[p.id] ? { ...p, ...editedMap[p.id] } : p));

    const applyTeamEdits = (teams) => teams.filter((t) => !excluded.has(t.id));

    return {
      players: applyEdits(playerData.players),
      teams: applyTeamEdits(playerData.teams),
    };
  }, [playerData, overrides.excludedIds, overrides.editedMap]);

  const activeCount = isDoubles
    ? effectivePlayerData.teams.length
    : effectivePlayerData.players.length;
  const canLaunch = activeCount >= 2;

  const preview = useMemo(
    () =>
      canLaunch ? generateLeague(effectiveSettings, effectivePlayerData) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      effectiveSettings.rounds,
      effectivePlayerData.players.length,
      effectivePlayerData.teams.length,
    ],
  );

  const handleLaunch = () => {
    if (!canLaunch) return;
    setLaunching(true);
    setTimeout(() => {
      const leagueData = generateLeague(effectiveSettings, effectivePlayerData);
      onLaunch(leagueData, effectiveSettings);
    }, 600);
  };

  return (
    <div className="wizard-card wizard-card-wide">
      <div className="card-accent" />

      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">
              Step 3 of 3 — Review &amp; Launch
            </div>
          </div>
          <ThemeToggle />
        </div>
        <div className="step-dots">
          <div className="dot done" />
          <div className="dot done" />
          <div className="dot active" />
        </div>
      </div>

      <div className="card-body">
        <div className="league-name-banner">
          <span className="league-name-sport-icon">
            {getSportIcon(settings.sport, 20)}
          </span>
          <span className="league-name-text">{settings.leagueName}</span>
        </div>

        <div className="review-grid">
          <SettingsSummary
            settings={settings}
            overrides={overrides}
            onOverride={setOverride}
          />
          <RosterPreview
            playerData={playerData}
            settings={settings}
            overrides={overrides}
            onOverride={setOverride}
          />
        </div>

        {preview && (
          <Round1Preview rounds={preview.rounds} isDoubles={isDoubles} />
        )}

        {!canLaunch && (
          <div className="launch-warning">
            ⚠ Need at least 2 {isDoubles ? 'teams' : 'players'} to launch.
          </div>
        )}

        <div className="launch-notice">
          <svg
            width="15"
            height="15"
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
          Seeding is based on USTA rating. Matches use round-robin scheduling.
          Challenges can be issued from the Schedule view after launch.
        </div>
      </div>

      <div className="card-footer card-footer-two">
        <button className="btn-back" onClick={onBack} disabled={launching}>
          ← Back
        </button>
        <button
          className={`btn-next btn-launch ${launching ? 'btn-launching' : ''}`}
          onClick={handleLaunch}
          disabled={launching || !canLaunch}
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
    </div>
  );
}

export default LeagueSetupStep3;
