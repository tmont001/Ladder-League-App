import Portal from '../shared/Portal';
import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';

function getParticipantName(p, isDoubles) {
  return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
}

function ChallengeModal({ onClose }) {
  const {
    settings,
    isDoubles,
    participants,
    standings,
    addChallenge,
  } = useLeague();
  const challengeSpots = settings.challengeSpots || 2;

  const [challengerId, setChallengerId] = useState('');
  const [challengedId, setChallengedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const rankMap = {};
  standings.forEach((s, i) => {
    rankMap[s.participant.id] = i + 1;
  });

  const validTargets = challengerId
    ? participants.filter((p) => {
        if (p.id === challengerId) return false;
        const cRank = rankMap[challengerId] ?? 9999;
        const tRank = rankMap[p.id] ?? 9999;
        return tRank < cRank && cRank - tRank <= challengeSpots;
      })
    : [];

  const handleSubmit = async () => {
    if (!challengerId || !challengedId) {
      setError('Select both a challenger and a target.');
      return;
    }
    const challenger = participants.find((p) => p.id === challengerId);
    const challenged = participants.find((p) => p.id === challengedId);
    setSubmitting(true);
    try {
      await addChallenge(challenger, challenged);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create challenge.');
    } finally {
      setSubmitting(false);
    }
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
                onChange={(e) => {
                  setChallengerId(e.target.value);
                  setChallengedId('');
                  setError('');
                }}
              >
                <option value="">Select challenger…</option>
                {participants.map((p) => (
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
                      ? 'No eligible targets'
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
              disabled={!challengerId || !challengedId || submitting}
            >
              {submitting ? 'Saving…' : 'Confirm Challenge'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default ChallengeModal;
