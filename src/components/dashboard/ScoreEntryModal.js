import Portal from '../shared/Portal';
import React, { useState, useMemo } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { usePlayerIdentity } from '../../context/PlayerIdentityContext';

// ─── Valid score ranges ───────────────────────────────────

function getTennisOptions(isSuperTb) {
  return isSuperTb
    ? Array.from({ length: 21 }, (_, i) => i) // 0-20 super tiebreak
    : [0, 1, 2, 3, 4, 5, 6, 7];
}
function getPickleballOptions() {
  return Array.from({ length: 30 }, (_, i) => i);
}

function isValidTennisSet(p1, p2, isSuperTb) {
  if (p1 === '' || p2 === '') return false;
  const a = parseInt(p1, 10),
    b = parseInt(p2, 10);
  if (isNaN(a) || isNaN(b)) return false;
  if (isSuperTb) {
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

function getSetsNeeded(maxSets) {
  return Math.ceil(maxSets / 2);
}

function getParticipantName(p, isDoubles) {
  return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
}

// ─── Single set row ───────────────────────────────────────

function SetScoreRow({
  index,
  sport,
  thirdSetFormat,
  isDeciding,
  isTied,
  setScore,
  onSetChange,
  p1Name,
  p2Name,
}) {
  const isTennis = sport === 'tennis';
  // Super tiebreak / deciding set only shown when tied
  const isSuperTb = isDeciding && isTied && thirdSetFormat === 'super_tiebreak';
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

  const opts = isTennis ? getTennisOptions(isSuperTb) : getPickleballOptions();
  const tbOpts = Array.from({ length: 15 }, (_, i) => i);
  const hasScore = p1 !== '' && p2 !== '';
  const p1Short = p1Name.split(' ')[0];
  const p2Short = p2Name.split(' ')[0];

  return (
    <div
      className={`set-row${hasScore && !isValid ? ' set-row-invalid' : ''}`}
      role="group"
      aria-label={`${label} score`}
    >
      <div className="set-label" aria-hidden="true">
        {label}
        {isDeciding && isTied && !isSuperTb && (
          <span className="set-deciding-tag">deciding</span>
        )}
      </div>

      <div>
        <div className="set-dual-inputs">
          <div className="set-player-col">
            <label className="set-player-label" htmlFor={`set-${index}-p1`}>
              {p1Short}
            </label>
            <select
              id={`set-${index}-p1`}
              className="set-player-select"
              value={p1}
              onChange={(e) => onSetChange(index, 'p1', e.target.value)}
              aria-label={`${label} score for ${p1Name}`}
            >
              <option value="">—</option>
              {opts.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="set-dual-sep" aria-hidden="true">
            –
          </div>

          <div className="set-player-col">
            <label className="set-player-label" htmlFor={`set-${index}-p2`}>
              {p2Short}
            </label>
            <select
              id={`set-${index}-p2`}
              className="set-player-select"
              value={p2}
              onChange={(e) => onSetChange(index, 'p2', e.target.value)}
              aria-label={`${label} score for ${p2Name}`}
            >
              <option value="">—</option>
              {opts.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {hasScore && (
            <span
              className={`set-validity ${isValid ? 'valid' : 'invalid'}`}
              aria-label={isValid ? 'Valid score' : 'Invalid score'}
            >
              {isValid ? '✓' : '✗'}
            </span>
          )}
        </div>

        {showTb && (
          <div
            className="tb-score-row"
            role="group"
            aria-label="Tiebreak score"
          >
            <span className="tb-label">Tiebreak score</span>
            <div className="set-dual-inputs">
              <div className="set-player-col">
                <label className="set-player-label" htmlFor={`tb-${index}-p1`}>
                  {p1Short}
                </label>
                <select
                  id={`tb-${index}-p1`}
                  className="set-player-select"
                  value={tbP1}
                  onChange={(e) => onSetChange(index, 'tbP1', e.target.value)}
                  aria-label={`Tiebreak score for ${p1Name}`}
                >
                  <option value="">—</option>
                  {tbOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="set-dual-sep" aria-hidden="true">
                –
              </div>
              <div className="set-player-col">
                <label className="set-player-label" htmlFor={`tb-${index}-p2`}>
                  {p2Short}
                </label>
                <select
                  id={`tb-${index}-p2`}
                  className="set-player-select"
                  value={tbP2}
                  onChange={(e) => onSetChange(index, 'tbP2', e.target.value)}
                  aria-label={`Tiebreak score for ${p2Name}`}
                >
                  <option value="">—</option>
                  {tbOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <span aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────

function ScoreEntryModal({ match, onClose }) {
  const { settings, isDoubles, submitResult } = useLeague();
  const { currentPlayer } = usePlayerIdentity();
  const sport = settings.sport;
  const format = settings.format;
  const thirdSetFormat = settings.thirdSetFormat || 'full_set';
  const isTennis = sport === 'tennis';
  const maxSets = getSetCount(format);
  const setsNeeded = getSetsNeeded(maxSets);

  const p1Name = match.p1 ? getParticipantName(match.p1, isDoubles) : '?';
  const p2Name = match.p2 ? getParticipantName(match.p2, isDoubles) : '?';

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
      if (field === 'p1' || field === 'p2') {
        next[idx] = { ...next[idx], tbP1: '', tbP2: '' };
      }
      return next;
    });
    setError('');
  };

  // ── Compute running set wins after each set index ─────────
  // Returns [p1wins, p2wins] considering only sets 0..i-1
  function winsAfter(beforeIdx) {
    let p1 = 0,
      p2 = 0;
    for (let j = 0; j < beforeIdx; j++) {
      const s = sets[j];
      const isSuperTb =
        maxSets > 1 && j === maxSets - 1 && thirdSetFormat === 'super_tiebreak';
      const valid = isTennis
        ? isValidTennisSet(s.p1, s.p2, isSuperTb)
        : isValidPickleballGame(s.p1, s.p2);
      if (valid) {
        const a = parseInt(s.p1, 10),
          b = parseInt(s.p2, 10);
        if (a > b) p1++;
        else p2++;
      }
    }
    return [p1, p2];
  }

  // ── Compute final result ─────────────────────────────────
  const result = useMemo(() => {
    if (!match.p1 || !match.p2) return null;
    let p1SetsWon = 0,
      p2SetsWon = 0;
    let p1GamesTotal = 0,
      p2GamesTotal = 0;
    const setScores = [];

    for (let i = 0; i < maxSets; i++) {
      const s = sets[i];
      // Deciding set is super tiebreak only when tied
      const isTied = p1SetsWon === p2SetsWon && p1SetsWon === setsNeeded - 1;
      const isSuperTb =
        maxSets > 1 &&
        i === maxSets - 1 &&
        isTied &&
        thirdSetFormat === 'super_tiebreak';
      const valid = isTennis
        ? isValidTennisSet(s.p1, s.p2, isSuperTb)
        : isValidPickleballGame(s.p1, s.p2);

      if (!valid) {
        if (p1SetsWon >= setsNeeded || p2SetsWon >= setsNeeded) break;
        return null;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets, date, location]);

  const winnerName = result
    ? result.winnerId === match.p1?.id
      ? p1Name
      : p2Name
    : null;

  const handleSubmit = async () => {
    if (!result) {
      setError('Please enter valid scores for all played sets.');
      return;
    }
    try {
      await submitResult(match.id, result, currentPlayer?.id || null);
      onClose();
    } catch (err) {
      const msg =
        err?.message ||
        (typeof err === 'string' ? err : 'Failed to submit. Please try again.');
      setError(msg);
    }
  };

  return (
    <Portal>
      <div
        className="modal-overlay"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-modal-title"
      >
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title" id="score-modal-title">
              Enter Score
            </div>
            <button
              className="modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="modal-body">
            <div
              className="modal-matchup"
              aria-label={`Match: ${p1Name} vs ${p2Name}`}
            >
              <span className="modal-player">{p1Name}</span>
              <span className="modal-vs" aria-hidden="true">
                vs
              </span>
              <span className="modal-player">{p2Name}</span>
            </div>

            <div className="set-rows">
              {sets.map((s, i) => {
                const [p1w, p2w] = winsAfter(i);
                // Hide once match is decided
                if (p1w >= setsNeeded || p2w >= setsNeeded) return null;

                const isDeciding = maxSets > 1 && i === maxSets - 1;
                // Deciding set only shown if we actually reach a tie
                const isTied = p1w === p2w && p1w === setsNeeded - 1;

                // Only render the deciding set row if we're tied (or it's not the deciding set)
                if (isDeciding && !isTied) return null;

                return (
                  <SetScoreRow
                    key={i}
                    index={i}
                    sport={sport}
                    thirdSetFormat={thirdSetFormat}
                    isDeciding={isDeciding}
                    isTied={isTied}
                    setScore={s}
                    onSetChange={handleSetChange}
                    p1Name={p1Name}
                    p2Name={p2Name}
                  />
                );
              })}
            </div>

            {winnerName && (
              <div className="winner-preview" role="status" aria-live="polite">
                🏆 <strong>{winnerName}</strong> wins
              </div>
            )}

            {error && (
              <div className="modal-error" role="alert">
                {error}
              </div>
            )}

            <div className="grid-2">
              <div className="field-group">
                <label htmlFor="score-date">Date Played</label>
                <input
                  id="score-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="field-group">
                <label htmlFor="score-location">Location</label>
                <input
                  id="score-location"
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
              aria-disabled={!result}
            >
              Submit Score
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default ScoreEntryModal;
