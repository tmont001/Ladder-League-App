import Portal from '../shared/Portal';
import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { generateId, getParticipantName } from '../../utils/participants';

function ChallengeModal({ onClose }) {
  const {
    settings,
    isDoubles,
    participants,
    standings,
    currentRoundNumber,
    addChallenge,
  } = useLeague();
  const challengeSpots = settings.challengeSpots;

  const [challengerId, setChallengerId] = useState('');
  const [challengedId, setChallengedId] = useState('');
  const [error, setError] = useState('');

  // Build a rank map from standings (rank 1 = best)
  const rankMap = {};
  standings.forEach((s, i) => {
    rankMap[s.participant.id] = i + 1;
  });

  // Valid challengers: any participant
  const challengers = participants;

  // Valid targets: participants ranked above challenger within the window
  const validTargets = challengerId
    ? participants.filter((p) => {
        if (p.id === challengerId) return false;
        const challengerRank = rankMap[challengerId] ?? 9999;
        const targetRank = rankMap[p.id] ?? 9999;
        return (
          targetRank < challengerRank &&
          challengerRank - targetRank <= challengeSpots
        );
      })
    : [];

  const handleChallenger = (id) => {
    setChallengerId(id);
    setChallengedId('');
    setError('');
  };

  const handleSubmit = () => {
    if (!challengerId || !challengedId) {
      setError('Please select both a challenger and a target.');
      return;
    }
    const challenger = participants.find((p) => p.id === challengerId);
    const challenged = participants.find((p) => p.id === challengedId);

    const challengeMatch = {
      id: generateId(),
      round: currentRoundNumber,
      type: 'challenge',
      isBye: false,
      p1: challenger,
      p2: challenged,
      status: 'pending',
      result: null,
    };

    addChallenge(challengeMatch);
    onClose();
  };

  return (
    <Portal>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Issue a Challenge</div>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="modal-body">
            <div className="challenge-info">
              Players may challenge anyone ranked up to{' '}
              <strong>{challengeSpots}</strong> spot
              {challengeSpots !== 1 ? 's' : ''} above them.
            </div>

            <div className="field-group">
              <label>Challenger</label>
              <select
                value={challengerId}
                onChange={(e) => handleChallenger(e.target.value)}
              >
                <option value="">Select challenger…</option>
                {challengers.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{rankMap[p.id] ?? '—'} {getParticipantName(p, isDoubles)}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-group">
              <label>Challenging</label>
              <select
                value={challengedId}
                onChange={(e) => {
                  setChallengedId(e.target.value);
                  setError('');
                }}
                disabled={!challengerId}
              >
                <option value="">
                  {challengerId
                    ? validTargets.length === 0
                      ? 'No eligible targets (already at top or window empty)'
                      : 'Select opponent…'
                    : 'Select challenger first'}
                </option>
                {validTargets.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{rankMap[p.id] ?? '—'} {getParticipantName(p, isDoubles)}
                  </option>
                ))}
              </select>
              {challengerId && validTargets.length === 0 && (
                <div className="field-hint" style={{ color: 'var(--gold)' }}>
                  ⚠ No players within {challengeSpots} spot
                  {challengeSpots !== 1 ? 's' : ''} above this challenger.
                </div>
              )}
            </div>

            {error && <div className="modal-error">{error}</div>}
          </div>

          <div className="modal-footer">
            <button className="btn-back" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-next"
              onClick={handleSubmit}
              disabled={!challengerId || !challengedId}
            >
              Confirm Challenge
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default ChallengeModal;
