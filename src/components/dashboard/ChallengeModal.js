import Portal from '../shared/Portal';
import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { usePlayerIdentity } from '../../context/PlayerIdentityContext';
import { useToast } from '../shared/ToastProvider';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';

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
  const { currentPlayer, isOrgIdentity } = usePlayerIdentity();
  const challengeSpots = settings.challengeSpots || 2;

  // Doubles challenges require a design decision (which player issues/receives,
  // how challenger_team_id maps to a challenge row). Until then, block doubles.
  const doublesInfoRef = useAccessibleDialog(isDoubles, onClose);
  if (isDoubles) {
    return (
      <Portal>
        <div className="modal-overlay" onClick={onClose}>
          <div className="modal" ref={doublesInfoRef} role="dialog" aria-modal="true" aria-labelledby="challenge-info-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" id="challenge-info-title">Issue a Challenge</div>
              <button className="modal-close" onClick={onClose}>✕</button>
            </div>
            <div className="modal-body">
              <div className="challenge-info">
                Doubles challenges are coming soon. Stay tuned for updates.
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-back" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </Portal>
    );
  }

  // For players: they are always the challenger; only the challenged is selected.
  // For organizers: both dropdowns are shown (existing UX preserved).
  const playerAsChallenger = !isOrgIdentity && currentPlayer;
  const initialChallengerId = playerAsChallenger ? currentPlayer.id : '';

  return (
    <ChallengeForm
      participants={participants}
      standings={standings}
      challengeSpots={challengeSpots}
      isDoubles={isDoubles}
      isOrgIdentity={isOrgIdentity}
      currentPlayer={currentPlayer}
      initialChallengerId={initialChallengerId}
      addChallenge={addChallenge}
      onClose={onClose}
    />
  );
}

function ChallengeForm({
  participants,
  standings,
  challengeSpots,
  isDoubles,
  isOrgIdentity,
  currentPlayer,
  initialChallengerId,
  addChallenge,
  onClose,
}) {
  const { showToast } = useToast();
  const [challengerId, setChallengerId] = useState(initialChallengerId);
  const [challengedId, setChallengedId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useAccessibleDialog(true, onClose, { disableEscape: submitting });

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
    const challengerToken = isOrgIdentity ? null : (currentPlayer?.sessionToken || null);
    setSubmitting(true);
    setError('');
    try {
      await addChallenge(challenger, challenged, challengerToken);
      showToast('Challenge issued.');
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create challenge.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Portal>
      <div className="modal-overlay" onClick={!submitting ? onClose : undefined}>
        <div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="challenge-form-title" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title" id="challenge-form-title">Issue a Challenge</div>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="modal-body">
            <div className="challenge-info">
              Players may challenge anyone ranked up to{' '}
              <strong>{challengeSpots}</strong> spot
              {challengeSpots !== 1 ? 's' : ''} above them.
            </div>

            {isOrgIdentity && (
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
            )}

            {!isOrgIdentity && (
              <div className="field-group">
                <label>Challenger</label>
                <div className="field-value">
                  #{rankMap[challengerId] ?? '—'}{' '}
                  {currentPlayer?.name || ''}
                </div>
              </div>
            )}

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
