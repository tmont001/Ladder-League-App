import React, { useState, useEffect } from 'react';
import { useLeague } from '../../context/LeagueContext';

// ─── Score option generators ──────────────────────────────

/**
 * Generates all valid tennis set score options as [p1, p2] pairs.
 * Includes tiebreak scores (7-6) with a sub-selector for tiebreak score.
 */
function getTennisSetOptions() {
  const options = [];
  // Standard sets
  for (let winner = 0; winner <= 1; winner++) {
    const scores = [
      [6, 0],
      [6, 1],
      [6, 2],
      [6, 3],
      [6, 4], // 6-x
      [7, 5], // 7-5
      [7, 6], // tiebreak
    ];
    scores.forEach(([a, b]) => {
      const [p1, p2] = winner === 0 ? [a, b] : [b, a];
      options.push({
        label: `${p1}–${p2}${p1 === 7 && p2 === 6 ? ' (TB)' : ''}`,
        p1,
        p2,
        isTiebreak: p1 === 7 && p2 === 6,
      });
    });
  }
  return options;
}

/**
 * Generates all valid pickleball game score options.
 */
function getPickleballGameOptions() {
  const options = [];
  for (let winner = 0; winner <= 1; winner++) {
    // Standard: 11-x where x is 0-9
    for (let loser = 0; loser <= 9; loser++) {
      const [p1, p2] = winner === 0 ? [11, loser] : [loser, 11];
      options.push({ label: `${p1}–${p2}`, p1, p2, isTiebreak: false });
    }
    // Overtime: 12-10, 13-11, etc up to 21-19
    for (let base = 10; base <= 19; base++) {
      const [p1, p2] = winner === 0 ? [base + 2, base] : [base, base + 2];
      options.push({ label: `${p1}–${p2}`, p1, p2, isTiebreak: false });
    }
  }
  return options;
}

/**
 * Super tiebreak options (first to 10, win by 2) — used as deciding set.
 */
function getSuperTiebreakOptions() {
  const options = [];
  for (let winner = 0; winner <= 1; winner++) {
    for (let loser = 0; loser <= 8; loser++) {
      const [p1, p2] = winner === 0 ? [10, loser] : [loser, 10];
      options.push({ label: `${p1}–${p2}`, p1, p2 });
    }
    // Overtime: 11-9, 12-10...
    for (let base = 9; base <= 18; base++) {
      const [p1, p2] = winner === 0 ? [base + 2, base] : [base, base + 2];
      options.push({ label: `${p1}–${p2}`, p1, p2 });
    }
  }
  return options;
}

/**
 * Tiebreak score options for within a 7-6 set (first to 7, win by 2).
 */
function getTiebreakScoreOptions() {
  const options = [];
  for (let winner = 0; winner <= 1; winner++) {
    for (let loser = 0; loser <= 5; loser++) {
      const [p1, p2] = winner === 0 ? [7, loser] : [loser, 7];
      options.push({ label: `${p1}–${p2}`, p1, p2 });
    }
    // Overtime: 8-6, 9-7...
    for (let base = 6; base <= 14; base++) {
      const [p1, p2] = winner === 0 ? [base + 2, base] : [base, base + 2];
      options.push({ label: `${p1}–${p2}`, p1, p2 });
    }
  }
  return options;
}

const TENNIS_SET_OPTIONS = getTennisSetOptions();
const PICKLEBALL_GAME_OPTIONS = getPickleballGameOptions();
const TIEBREAK_OPTIONS = getTiebreakScoreOptions();
const SUPER_TB_OPTIONS = getSuperTiebreakOptions();

// ─── Helpers ──────────────────────────────────────────────

function getParticipantName(p, isDoubles) {
  return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
}

function getSetCount(format) {
  if (format === 'best_of_1') return 1;
  if (format === 'best_of_3') return 3;
  if (format === 'best_of_5') return 5;
  return 3;
}

// ─── Single Set Score Row ────────────────────────────────

function SetScoreRow({
  index,
  sport,
  thirdSetFormat,
  isDecidingSet,
  value,
  tbValue,
  onChange,
  onTbChange,
  p1Name,
  p2Name,
}) {
  const isTennis = sport === 'tennis';
  const isSuperTb = isDecidingSet && thirdSetFormat === 'super_tiebreak';
  const options = isSuperTb
    ? SUPER_TB_OPTIONS
    : isTennis
      ? TENNIS_SET_OPTIONS
      : PICKLEBALL_GAME_OPTIONS;
  const selectedOpt = options.find((o) => o.label === value);
  const showTbInput = isTennis && !isSuperTb && selectedOpt?.isTiebreak;

  const label = isSuperTb
    ? 'Super TB'
    : isTennis
      ? `Set ${index + 1}`
      : `Game ${index + 1}`;

  return (
    <div className="set-row">
      <span className="set-label">
        {label}
        {isDecidingSet && !isSuperTb && (
          <span className="set-deciding-tag">deciding</span>
        )}
      </span>
      <div className="set-inputs set-inputs-dropdown">
        <select
          className="score-select"
          value={value}
          onChange={(e) => onChange(index, e.target.value)}
        >
          <option value="">— select —</option>
          <optgroup label={`${p1Name} wins`}>
            {options
              .filter((o) => o.p1 > o.p2)
              .map((o) => (
                <option key={`p1-${o.label}`} value={o.label}>
                  {o.label}
                </option>
              ))}
          </optgroup>
          <optgroup label={`${p2Name} wins`}>
            {options
              .filter((o) => o.p2 > o.p1)
              .map((o) => (
                <option key={`p2-${o.label}`} value={o.label}>
                  {o.label}
                </option>
              ))}
          </optgroup>
        </select>

        {/* Tiebreak score sub-selector */}
        {showTbInput && (
          <select
            className="score-select score-select-tb"
            value={tbValue}
            onChange={(e) => onTbChange(index, e.target.value)}
          >
            <option value="">TB score…</option>
            <optgroup label={`${p1Name} wins TB`}>
              {TIEBREAK_OPTIONS.filter((o) => o.p1 > o.p2).map((o) => (
                <option key={`tb-p1-${o.label}`} value={o.label}>
                  {o.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={`${p2Name} wins TB`}>
              {TIEBREAK_OPTIONS.filter((o) => o.p2 > o.p1).map((o) => (
                <option key={`tb-p2-${o.label}`} value={o.label}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          </select>
        )}
      </div>
      {value && <span className="set-validity valid">✓</span>}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────

function ScoreEntryModal({ match, onClose }) {
  const { settings, isDoubles, submitResult } = useLeague();
  const sport = settings.sport;
  const format = settings.format;
  const thirdSetFormat = settings.thirdSetFormat || 'full_set';
  const isTennis = sport === 'tennis';
  const maxSets = getSetCount(format);
  const setsNeeded = Math.ceil(maxSets / 2);

  const p1Name = getParticipantName(match.p1, isDoubles);
  const p2Name = getParticipantName(match.p2, isDoubles);

  // setValues[i] = selected score label string e.g. "6-3"
  const [setValues, setSetValues] = useState(Array(maxSets).fill(''));
  // tbValues[i] = tiebreak score label for set i (only used when set is 7-6)
  const [tbValues, setTbValues] = useState(Array(maxSets).fill(''));
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');

  // Determine how many sets are actually needed based on running score
  const [p1Running, p2Running] = setValues.reduce(
    ([p1, p2], val) => {
      if (!val) return [p1, p2];
      const opts =
        thirdSetFormat === 'super_tiebreak'
          ? SUPER_TB_OPTIONS
          : isTennis
            ? TENNIS_SET_OPTIONS
            : PICKLEBALL_GAME_OPTIONS;
      const opt = opts.find((o) => o.label === val);
      if (!opt) return [p1, p2];
      return opt.p1 > opt.p2 ? [p1 + 1, p2] : [p1, p2 + 1];
    },
    [0, 0],
  );

  // Only show next set row if match isn't decided yet
  const matchDecided = p1Running >= setsNeeded || p2Running >= setsNeeded;

  const handleSetChange = (idx, val) => {
    setSetValues((prev) => {
      const n = [...prev];
      n[idx] = val;
      return n;
    });
    setTbValues((prev) => {
      const n = [...prev];
      n[idx] = '';
      return n;
    }); // reset TB on change
    setError('');
  };
  const handleTbChange = (idx, val) => {
    setTbValues((prev) => {
      const n = [...prev];
      n[idx] = val;
      return n;
    });
  };

  // ── Compute result ────────────────────────────────────────
  const computeResult = () => {
    const options = isTennis ? TENNIS_SET_OPTIONS : PICKLEBALL_GAME_OPTIONS;
    const superTbOptions = SUPER_TB_OPTIONS;

    let p1SetsWon = 0,
      p2SetsWon = 0;
    let p1GamesTotal = 0,
      p2GamesTotal = 0;
    const setScores = [];

    for (let i = 0; i < maxSets; i++) {
      const val = setValues[i];
      if (!val) break; // stop at first empty

      const isDeciding =
        i === maxSets - 1 && thirdSetFormat === 'super_tiebreak';
      const opts = isDeciding ? superTbOptions : options;
      const opt = opts.find((o) => o.label === val);
      if (!opt) return null;

      if (opt.p1 > opt.p2) p1SetsWon++;
      else p2SetsWon++;

      p1GamesTotal += opt.p1;
      p2GamesTotal += opt.p2;

      const tbScore = tbValues[i] || null;
      setScores.push({ p1: opt.p1, p2: opt.p2, tiebreak: tbScore });

      // Stop early if match is decided
      if (p1SetsWon >= setsNeeded || p2SetsWon >= setsNeeded) break;
    }

    if (p1SetsWon < setsNeeded && p2SetsWon < setsNeeded) return null;
    const winnerId = p1SetsWon >= setsNeeded ? match.p1.id : match.p2.id;

    return {
      winnerId,
      p1Sets: p1SetsWon,
      p2Sets: p2SetsWon,
      p1Games: p1GamesTotal,
      p2Games: p2GamesTotal,
      setScores,
      date: date || null,
      location: location || null,
    };
  };

  const result = computeResult();
  const winnerName = result
    ? result.winnerId === match.p1.id
      ? p1Name
      : p2Name
    : null;

  const handleSubmit = () => {
    if (!result) {
      setError('Please complete all required set scores.');
      return;
    }
    submitResult(match.id, result);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Enter Score</div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-matchup">
            <span className="modal-player">{p1Name}</span>
            <span className="modal-vs">vs</span>
            <span className="modal-player">{p2Name}</span>
          </div>

          <div className="set-rows">
            {Array.from({ length: maxSets }).map((_, i) => {
              // Hide sets that can't be reached yet
              const prevDecided = (() => {
                let p1 = 0,
                  p2 = 0;
                for (let j = 0; j < i; j++) {
                  const val = setValues[j];
                  if (!val) return false;
                  const opts = isTennis
                    ? TENNIS_SET_OPTIONS
                    : PICKLEBALL_GAME_OPTIONS;
                  const opt = opts.find((o) => o.label === val);
                  if (!opt) return false;
                  if (opt.p1 > opt.p2) p1++;
                  else p2++;
                  if (p1 >= setsNeeded || p2 >= setsNeeded) return true;
                }
                return false;
              })();

              if (prevDecided) return null;

              const isDeciding = maxSets > 1 && i === maxSets - 1;

              return (
                <SetScoreRow
                  key={i}
                  index={i}
                  sport={sport}
                  thirdSetFormat={thirdSetFormat}
                  isDecidingSet={isDeciding}
                  value={setValues[i]}
                  tbValue={tbValues[i]}
                  onChange={handleSetChange}
                  onTbChange={handleTbChange}
                  p1Name={p1Name}
                  p2Name={p2Name}
                />
              );
            })}
          </div>

          {winnerName && (
            <div className="winner-preview">
              🏆 <strong>{winnerName}</strong> wins
            </div>
          )}

          {error && <div className="modal-error">{error}</div>}

          <div className="grid-2">
            <div className="field-group">
              <label>Date Played</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label>Location</label>
              <input
                type="text"
                placeholder="e.g. Court 3"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-back" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-next"
            onClick={handleSubmit}
            disabled={!result}
          >
            Submit Score
          </button>
        </div>
      </div>
    </div>
  );
}

export default ScoreEntryModal;
