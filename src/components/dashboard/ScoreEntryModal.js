import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';

// ─── Valid score ranges per sport ─────────────────────────

function getTennisP1Options(isSuperTb) {
  if (isSuperTb) return Array.from({ length: 21 }, (_, i) => i); // 0-20 for super TB
  return [0, 1, 2, 3, 4, 5, 6, 7]; // 0-7 (7 only for tiebreak)
}

function getTennisP2Options(isSuperTb) {
  return getTennisP1Options(isSuperTb);
}

function getPickleballOptions() {
  return Array.from({ length: 30 }, (_, i) => i); // 0-29
}

// Validate a completed tennis set score
function isValidTennisSet(p1, p2, isSuperTb) {
  if (p1 === '' || p2 === '') return false;
  const a = parseInt(p1, 10),
    b = parseInt(p2, 10);
  if (isNaN(a) || isNaN(b)) return false;
  if (isSuperTb) {
    // first to 10, win by 2
    const hi = Math.max(a, b),
      lo = Math.min(a, b);
    return hi >= 10 && hi - lo >= 2;
  }
  if (a === 7 && (b === 6 || b === 5)) return true;
  if (b === 7 && (a === 6 || a === 5)) return true;
  if (a === 6 && b <= 4) return true;
  if (b === 6 && a <= 4) return true;
  return false;
}

function isValidPickleballGame(p1, p2) {
  if (p1 === '' || p2 === '') return false;
  const a = parseInt(p1, 10),
    b = parseInt(p2, 10);
  if (isNaN(a) || isNaN(b)) return false;
  const hi = Math.max(a, b),
    lo = Math.min(a, b);
  return hi >= 11 && hi - lo >= 2;
}

// Is this tennis set a tiebreak (7-6)?
function isTennisSetTiebreak(p1, p2) {
  return (
    (parseInt(p1, 10) === 7 && parseInt(p2, 10) === 6) ||
    (parseInt(p1, 10) === 6 && parseInt(p2, 10) === 7)
  );
}

function getSetCount(format) {
  if (format === 'best_of_1') return 1;
  if (format === 'best_of_3') return 3;
  if (format === 'best_of_5') return 5;
  return 3;
}

function getParticipantName(p, isDoubles) {
  return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
}

// ─── Single set score row ────────────────────────────────

function SetScoreRow({
  index,
  sport,
  thirdSetFormat,
  isDeciding,
  setScore,
  onSetChange,
  p1Name,
  p2Name,
}) {
  const isTennis = sport === 'tennis';
  const isSuperTb = isDeciding && thirdSetFormat === 'super_tiebreak';

  const { p1, p2, tbP1, tbP2 } = setScore;

  const isValid = isTennis
    ? isValidTennisSet(p1, p2, isSuperTb)
    : isValidPickleballGame(p1, p2);

  const showTb =
    isTennis && !isSuperTb && isValid && isTennisSetTiebreak(p1, p2);

  const label = isSuperTb
    ? 'Super TB'
    : isTennis
      ? `Set ${index + 1}`
      : `Game ${index + 1}`;

  // Build score options
  const p1Opts = isTennis
    ? getTennisP1Options(isSuperTb)
    : getPickleballOptions();
  const p2Opts = isTennis
    ? getTennisP2Options(isSuperTb)
    : getPickleballOptions();

  // Tiebreak score options: first to 7 (win by 2), displayed as p1score/p2score
  const tbOpts = Array.from({ length: 15 }, (_, i) => i); // 0-14

  const hasScore = p1 !== '' && p2 !== '';

  return (
    <div
      className={`set-row set-row-dual ${hasScore && !isValid ? 'set-row-invalid' : ''}`}
    >
      <span className="set-label">
        {label}
        {isDeciding && !isSuperTb && (
          <span className="set-deciding-tag">deciding</span>
        )}
      </span>

      <div className="set-dual-inputs">
        {/* P1 score */}
        <div className="set-player-score">
          <span className="set-player-label">{p1Name.split(' ')[0]}</span>
          <select
            className="score-dropdown"
            value={p1}
            onChange={(e) => onSetChange(index, 'p1', e.target.value)}
          >
            <option value="">—</option>
            {p1Opts.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <span className="set-dual-sep">–</span>

        {/* P2 score */}
        <div className="set-player-score">
          <select
            className="score-dropdown"
            value={p2}
            onChange={(e) => onSetChange(index, 'p2', e.target.value)}
          >
            <option value="">—</option>
            {p2Opts.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <span className="set-player-label">{p2Name.split(' ')[0]}</span>
        </div>

        {/* Validity tick */}
        {hasScore && (
          <span className={`set-validity ${isValid ? 'valid' : 'invalid'}`}>
            {isValid ? '✓' : '✗'}
          </span>
        )}
      </div>

      {/* Tiebreak score row — appears when set is 7-6 */}
      {showTb && (
        <div className="tb-score-row">
          <span className="tb-label">Tiebreak</span>
          <div className="set-dual-inputs">
            <div className="set-player-score">
              <span className="set-player-label">{p1Name.split(' ')[0]}</span>
              <select
                className="score-dropdown score-dropdown-sm"
                value={tbP1}
                onChange={(e) => onSetChange(index, 'tbP1', e.target.value)}
              >
                <option value="">—</option>
                {tbOpts.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <span className="set-dual-sep">–</span>
            <div className="set-player-score">
              <select
                className="score-dropdown score-dropdown-sm"
                value={tbP2}
                onChange={(e) => onSetChange(index, 'tbP2', e.target.value)}
              >
                <option value="">—</option>
                {tbOpts.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <span className="set-player-label">{p2Name.split(' ')[0]}</span>
            </div>
          </div>
        </div>
      )}
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

  // Each set: { p1, p2, tbP1, tbP2 }
  const [sets, setSets] = useState(
    Array.from({ length: maxSets }, () => ({
      p1: '',
      p2: '',
      tbP1: '',
      tbP2: '',
    })),
  );
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');

  const handleSetChange = (idx, field, val) => {
    setSets((prev) => {
      const next = prev.map((s, i) => (i === idx ? { ...s, [field]: val } : s));
      // Reset tiebreak if set score changed
      if (field === 'p1' || field === 'p2') {
        next[idx] = { ...next[idx], tbP1: '', tbP2: '' };
      }
      return next;
    });
    setError('');
  };

  // How many sets each player has won so far (for hiding unneeded rows)
  const runningTotals = sets.reduce(
    (acc, s, i) => {
      const isSuperTb =
        i === maxSets - 1 && thirdSetFormat === 'super_tiebreak';
      const valid = isTennis
        ? isValidTennisSet(s.p1, s.p2, isSuperTb)
        : isValidPickleballGame(s.p1, s.p2);
      if (!valid) return acc;
      const a = parseInt(s.p1, 10),
        b = parseInt(s.p2, 10);
      return [acc[0] + (a > b ? 1 : 0), acc[1] + (b > a ? 1 : 0)];
    },
    [0, 0],
  );

  // ── Compute final result ─────────────────────────────────
  const computeResult = () => {
    let p1SetsWon = 0,
      p2SetsWon = 0;
    let p1GamesTotal = 0,
      p2GamesTotal = 0;
    const setScores = [];

    for (let i = 0; i < maxSets; i++) {
      const s = sets[i];
      const isSuperTb =
        i === maxSets - 1 && thirdSetFormat === 'super_tiebreak';
      const valid = isTennis
        ? isValidTennisSet(s.p1, s.p2, isSuperTb)
        : isValidPickleballGame(s.p1, s.p2);

      if (!valid) {
        // If match already decided, ignore trailing empty rows
        if (p1SetsWon >= setsNeeded || p2SetsWon >= setsNeeded) break;
        return null; // incomplete
      }

      const a = parseInt(s.p1, 10),
        b = parseInt(s.p2, 10);
      if (a > b) p1SetsWon++;
      else p2SetsWon++;
      p1GamesTotal += a;
      p2GamesTotal += b;

      const tbScore =
        s.tbP1 !== '' && s.tbP2 !== '' ? `${s.tbP1}–${s.tbP2}` : null;
      setScores.push({ p1: a, p2: b, tiebreak: tbScore });

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
      setError('Please enter valid scores for all played sets.');
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
            {sets.map((s, i) => {
              // Hide this set row if the match was already decided by previous sets
              let p1 = 0,
                p2 = 0;
              for (let j = 0; j < i; j++) {
                const prev = sets[j];
                const isSuperTb =
                  j === maxSets - 1 && thirdSetFormat === 'super_tiebreak';
                const valid = isTennis
                  ? isValidTennisSet(prev.p1, prev.p2, isSuperTb)
                  : isValidPickleballGame(prev.p1, prev.p2);
                if (valid) {
                  const a = parseInt(prev.p1, 10),
                    b = parseInt(prev.p2, 10);
                  if (a > b) p1++;
                  else p2++;
                }
              }
              if (p1 >= setsNeeded || p2 >= setsNeeded) return null;

              return (
                <SetScoreRow
                  key={i}
                  index={i}
                  sport={sport}
                  thirdSetFormat={thirdSetFormat}
                  isDeciding={maxSets > 1 && i === maxSets - 1}
                  setScore={s}
                  onSetChange={handleSetChange}
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
