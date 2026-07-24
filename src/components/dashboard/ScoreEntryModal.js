import Portal from '../shared/Portal';
import React, { useState, useMemo } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { usePlayerIdentity } from '../../context/PlayerIdentityContext';
import { ORG_SESSION_EXPIRED_MSG } from '../../lib/db';
import { useToast } from '../shared/ToastProvider';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';

// ─────────────────────────────────────────────────────────────
// Score options
// gamesPerSet: 4 | 6 | 8
//   Regular win:      g vs ≤ g-2        (e.g. 6-4, 6-3, 6-0)
//   Close win:        g vs g-1          (only when no tiebreak format)
//   Tiebreak win:     g+1 vs g          (e.g. 7-6, 5-4, 9-8)
// Super tiebreak:     first to 10, win by 2  → options 0–20
// ─────────────────────────────────────────────────────────────

function getTennisOptions(isSuperTb, gamesPerSet) {
  if (isSuperTb) return Array.from({ length: 21 }, (_, i) => i); // 0–20
  const g = gamesPerSet || 6;
  // Need 0 … g+1  (g+1 is the tiebreak-winner score, e.g. 7 in 6-game sets)
  return Array.from({ length: g + 2 }, (_, i) => i);
}

function getPickleballOptions(pickleballPoints) {
  const pts = pickleballPoints || 11;
  // Allow well past the base target to cover extended win-by-2 rallies
  return Array.from({ length: pts + 12 }, (_, i) => i);
}

// ─── Tennis set validation ────────────────────────────────────
// All four format-related params must be passed every time.
function isValidTennisSet(p1, p2, isSuperTb, gamesPerSet, tiebreakFormat) {
  if (p1 === '' || p2 === '') return false;
  const a = parseInt(p1, 10),
    b = parseInt(p2, 10);
  if (isNaN(a) || isNaN(b)) return false;

  // Super tiebreak (deciding set only): first to 10, win by 2
  if (isSuperTb) {
    const hi = Math.max(a, b),
      lo = Math.min(a, b);
    return hi >= 10 && hi - lo >= 2;
  }

  const g = gamesPerSet || 6;
  const fmt = tiebreakFormat || 'standard';

  // Clean win: reach g with opponent ≤ g-2  (e.g. 6-4, 6-3, 8-5, 4-2)
  if (a === g && b <= g - 2) return true;
  if (b === g && a <= g - 2) return true;

  // Extended clean win: g+1 vs g-1 (e.g. 7–5) — valid in all tiebreak formats
  if (a === g + 1 && b === g - 1) return true;
  if (b === g + 1 && a === g - 1) return true;

  // Close win (g vs g-1) — only valid when no tiebreak is used
  if (fmt === 'no_tiebreak') {
    if (a === g && b === g - 1) return true;
    if (b === g && a === g - 1) return true;
  }

  // Tiebreak win (g+1 vs g) — valid for standard and match_tiebreak formats
  if (fmt === 'standard' || fmt === 'match_tiebreak') {
    if (a === g + 1 && b === g) return true;
    if (b === g + 1 && a === g) return true;
  }

  return false;
}

// ─── Pickleball game validation ───────────────────────────────
function isValidPickleballGame(p1, p2, pickleballPoints) {
  if (p1 === '' || p2 === '') return false;
  const a = parseInt(p1, 10),
    b = parseInt(p2, 10);
  if (isNaN(a) || isNaN(b)) return false;
  const pts = pickleballPoints || 11;
  const hi = Math.max(a, b),
    lo = Math.min(a, b);
  // Must reach pts AND win by 2
  return hi >= pts && hi - lo >= 2;
}

// Returns true when this set ended in a tiebreak (g+1 vs g)
function isTennisSetTiebreak(p1, p2, gamesPerSet, tiebreakFormat) {
  if ((tiebreakFormat || 'standard') === 'no_tiebreak') return false;
  const g = gamesPerSet || 6;
  const a = parseInt(p1, 10),
    b = parseInt(p2, 10);
  return (a === g + 1 && b === g) || (b === g + 1 && a === g);
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

// ─── Single set row ───────────────────────────────────────────

function SetScoreRow({
  index,
  sport,
  thirdSetFormat,
  tiebreakFormat,
  gamesPerSet,
  pickleballPoints,
  isDeciding,
  isTied,
  setScore,
  onSetChange,
  p1Name,
  p2Name,
}) {
  const isTennis = sport === 'tennis' || sport === 'padel';
  const isSuperTb = isDeciding && isTied && thirdSetFormat === 'super_tiebreak';
  const { p1, p2, tbP1, tbP2 } = setScore;

  const isValid = isTennis
    ? isValidTennisSet(p1, p2, isSuperTb, gamesPerSet, tiebreakFormat)
    : isValidPickleballGame(p1, p2, pickleballPoints);

  const showTb =
    isTennis &&
    !isSuperTb &&
    isValid &&
    isTennisSetTiebreak(p1, p2, gamesPerSet, tiebreakFormat);

  const label = isSuperTb
    ? 'Super TB'
    : isTennis
      ? `Set ${index + 1}`
      : `Game ${index + 1}`;

  const opts = isTennis
    ? getTennisOptions(isSuperTb, gamesPerSet)
    : getPickleballOptions(pickleballPoints);

  // Tiebreak point options: first to 7, win by 2 → realistically 0–14 covers it
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

        {/* Tiebreak score row — shown when set ends at g+1 vs g */}
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

// ─── Main Modal ───────────────────────────────────────────────

function ScoreEntryModal({ match, onClose }) {
  const { settings, isDoubles, submitResult, recordOfficialResult } = useLeague();
  const { currentPlayer, isOrgIdentity, orgSessionExpired } = usePlayerIdentity();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useAccessibleDialog(true, onClose, { disableEscape: submitting });

  const sport = settings.sport;
  const format = settings.format;
  const thirdSetFormat = settings.thirdSetFormat || 'full_set';
  const tiebreakFormat = settings.tiebreakFormat || 'standard';
  const gamesPerSet = settings.gamesPerSet || 6;
  const pickleballPoints = settings.pickleballPoints || 11;
  const isTennis = sport === 'tennis' || sport === 'padel';
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

  // Count validated set wins before a given index
  function winsAfter(beforeIdx) {
    let p1 = 0,
      p2 = 0;
    for (let j = 0; j < beforeIdx; j++) {
      const s = sets[j];
      const tied = p1 === p2 && p1 === setsNeeded - 1;
      const superTb =
        maxSets > 1 &&
        j === maxSets - 1 &&
        tied &&
        thirdSetFormat === 'super_tiebreak';
      const valid = isTennis
        ? isValidTennisSet(s.p1, s.p2, superTb, gamesPerSet, tiebreakFormat)
        : isValidPickleballGame(s.p1, s.p2, pickleballPoints);
      if (valid) {
        const a = parseInt(s.p1, 10),
          b = parseInt(s.p2, 10);
        if (a > b) p1++;
        else p2++;
      }
    }
    return [p1, p2];
  }

  // ── Compute final result ──────────────────────────────────
  const result = useMemo(() => {
    if (!match.p1 || !match.p2) return null;
    let p1SetsWon = 0,
      p2SetsWon = 0;
    let p1GamesTotal = 0,
      p2GamesTotal = 0;
    const setScores = [];

    for (let i = 0; i < maxSets; i++) {
      const s = sets[i];
      const isTied = p1SetsWon === p2SetsWon && p1SetsWon === setsNeeded - 1;
      const superTb =
        maxSets > 1 &&
        i === maxSets - 1 &&
        isTied &&
        thirdSetFormat === 'super_tiebreak';
      const valid = isTennis
        ? isValidTennisSet(s.p1, s.p2, superTb, gamesPerSet, tiebreakFormat)
        : isValidPickleballGame(s.p1, s.p2, pickleballPoints);

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
    setSubmitting(true);
    try {
      if (isOrgIdentity) {
        await recordOfficialResult(match.id, result);
        showToast('Score recorded.');
      } else {
        await submitResult(match.id, result, currentPlayer?.sessionToken || null);
        showToast('Score submitted. Waiting for opponent confirmation.');
      }
      onClose();
    } catch (err) {
      if (isOrgIdentity && err.message === ORG_SESSION_EXPIRED_MSG && orgSessionExpired) {
        orgSessionExpired();
        return;
      }
      setError(err?.message || 'Failed to submit. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Portal>
      <div
        className="modal-overlay"
        onClick={!submitting ? onClose : undefined}
      >
        <div
          className="modal"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="score-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <div className="modal-title" id="score-modal-title">
              {isOrgIdentity ? 'Record Official Score' : 'Enter Score'}
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
              aria-label={`${p1Name} vs ${p2Name}`}
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
                if (p1w >= setsNeeded || p2w >= setsNeeded) return null;

                const isDeciding = maxSets > 1 && i === maxSets - 1;
                const isTied = p1w === p2w && p1w === setsNeeded - 1;

                // Only show deciding set row when scores are actually tied
                if (isDeciding && !isTied) return null;

                return (
                  <SetScoreRow
                    key={i}
                    index={i}
                    sport={sport}
                    thirdSetFormat={thirdSetFormat}
                    tiebreakFormat={tiebreakFormat}
                    gamesPerSet={gamesPerSet}
                    pickleballPoints={pickleballPoints}
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
              disabled={!result || submitting}
              aria-disabled={!result || submitting}
            >
              {submitting
                ? (isOrgIdentity ? 'Recording…' : 'Submitting…')
                : (isOrgIdentity ? 'Record Official Result' : 'Submit Score')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default ScoreEntryModal;
