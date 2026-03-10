import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';

// ─── Score validation ─────────────────────────────────────

function validateTennisSet(a, b) {
  a = parseInt(a, 10);
  b = parseInt(b, 10);
  if (isNaN(a) || isNaN(b)) return false;
  if (a < 0 || b < 0) return false;
  // Normal set: one player wins 6, other has 4 or less, OR 7-6 tiebreak, OR 7-5
  if (a === 7 && (b === 6 || b === 5)) return true;
  if (b === 7 && (a === 6 || a === 5)) return true;
  if (a === 6 && b <= 4) return true;
  if (b === 6 && a <= 4) return true;
  return false;
}

function validatePickleballGame(a, b) {
  a = parseInt(a, 10);
  b = parseInt(b, 10);
  if (isNaN(a) || isNaN(b)) return false;
  if (a < 0 || b < 0) return false;
  // Win by 2, first to 11 (or more in overtime)
  const winner = Math.max(a, b);
  const loser = Math.min(a, b);
  if (winner < 11) return false;
  return winner - loser >= 2;
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

// ─── A single set/game score row ─────────────────────────

function SetRow({ index, sport, scores, onChange, isDoubles, p1Name, p2Name }) {
  const label = sport === 'tennis' ? `Set ${index + 1}` : `Game ${index + 1}`;
  const validate =
    sport === 'tennis' ? validateTennisSet : validatePickleballGame;
  const isValid =
    scores[0] !== '' && scores[1] !== '' && validate(scores[0], scores[1]);
  const isEmpty = scores[0] === '' && scores[1] === '';

  return (
    <div className={`set-row ${!isEmpty && !isValid ? 'set-row-invalid' : ''}`}>
      <span className="set-label">{label}</span>
      <div className="set-inputs">
        <input
          type="number"
          min="0"
          max={sport === 'tennis' ? 7 : 99}
          className="score-input"
          placeholder="0"
          value={scores[0]}
          onChange={(e) => onChange(index, 0, e.target.value)}
        />
        <span className="score-dash">–</span>
        <input
          type="number"
          min="0"
          max={sport === 'tennis' ? 7 : 99}
          className="score-input"
          placeholder="0"
          value={scores[1]}
          onChange={(e) => onChange(index, 1, e.target.value)}
        />
      </div>
      {!isEmpty && (
        <span className={`set-validity ${isValid ? 'valid' : 'invalid'}`}>
          {isValid ? '✓' : '✗'}
        </span>
      )}
    </div>
  );
}

// ─── Main Modal ───────────────────────────────────────────

function ScoreEntryModal({ match, onClose }) {
  const { settings, isDoubles, submitResult } = useLeague();
  const sport = settings.sport;
  const format = settings.format;
  const maxSets = getSetCount(format);

  const p1Name = getParticipantName(match.p1, isDoubles);
  const p2Name = getParticipantName(match.p2, isDoubles);

  // scores[setIndex] = [p1Score, p2Score]
  const [scores, setScores] = useState(
    Array.from({ length: maxSets }, () => ['', '']),
  );
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');

  const handleScoreChange = (setIdx, playerIdx, val) => {
    setScores((prev) => {
      const next = prev.map((s) => [...s]);
      next[setIdx][playerIdx] = val;
      return next;
    });
    setError('');
  };

  // ── Compute winner from entered scores ───────────────────
  const computeResult = () => {
    const validate =
      sport === 'tennis' ? validateTennisSet : validatePickleballGame;
    const playedSets = scores.filter(([a, b]) => a !== '' && b !== '');
    if (playedSets.length === 0) return null;

    let p1SetsWon = 0,
      p2SetsWon = 0;
    let p1GamesTotal = 0,
      p2GamesTotal = 0;

    for (const [a, b] of playedSets) {
      if (!validate(a, b)) return null;
      const ai = parseInt(a, 10),
        bi = parseInt(b, 10);
      if (ai > bi) p1SetsWon++;
      else p2SetsWon++;
      p1GamesTotal += ai;
      p2GamesTotal += bi;
    }

    const setsNeeded = Math.ceil(maxSets / 2);
    const winnerId =
      p1SetsWon >= setsNeeded
        ? match.p1.id
        : p2SetsWon >= setsNeeded
          ? match.p2.id
          : null;

    if (!winnerId) return null;

    return {
      winnerId,
      p1Sets: p1SetsWon,
      p2Sets: p2SetsWon,
      p1Games: p1GamesTotal,
      p2Games: p2GamesTotal,
      setScores: playedSets.map(([a, b]) => ({
        p1: parseInt(a),
        p2: parseInt(b),
      })),
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
      setError('Please enter valid scores to determine a winner.');
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
          {/* Match header */}
          <div className="modal-matchup">
            <span className="modal-player">{p1Name}</span>
            <span className="modal-vs">vs</span>
            <span className="modal-player">{p2Name}</span>
          </div>

          {/* Score rows */}
          <div className="set-rows">
            {scores.map((s, i) => (
              <SetRow
                key={i}
                index={i}
                sport={sport}
                scores={s}
                onChange={handleScoreChange}
                isDoubles={isDoubles}
                p1Name={p1Name}
                p2Name={p2Name}
              />
            ))}
          </div>

          {/* Winner preview */}
          {winnerName && (
            <div className="winner-preview">
              🏆 <strong>{winnerName}</strong> wins
            </div>
          )}

          {error && <div className="modal-error">{error}</div>}

          {/* Date & Location */}
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
