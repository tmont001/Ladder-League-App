import Portal from '../shared/Portal';
import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { getParticipantName, generateId } from '../../utils/participants';

function AdhocMatchModal({ starterParticipantId, onClose, onCreated }) {
  const { participants, currentRoundNumber, addMatch, isDoubles } = useLeague();
  const [opponentId, setOpponentId] = useState('');
  const [error, setError] = useState('');

  const { standings } = useLeague();
  const starter = participants.find((p) => p.id === starterParticipantId);
  const options = participants.filter((p) => p.id !== starterParticipantId);
  // suggest top 3 opponents (highest-ranked available)
  const topOpponents = standings
    .map((s) => s.participant)
    .filter((p) => p.id !== starterParticipantId)
    .slice(0, 3);

  const handleSubmit = () => {
    if (!opponentId) {
      setError('Please select an opponent.');
      return;
    }
    const opponent = participants.find((p) => p.id === opponentId);
    const match = {
      id: generateId(),
      round: currentRoundNumber,
      type: 'adhoc',
      isBye: false,
      p1: starter,
      p2: opponent,
      status: 'pending',
      result: null,
    };
    addMatch(match);
    if (onCreated) onCreated(match);
    onClose();
  };

  return (
    <Portal>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Create Match</div>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="modal-body">
            <div className="field-group">
              <label>Player</label>
              <div style={{ padding: '0.5rem 0' }}>
                {getParticipantName(starter, isDoubles)}
              </div>
            </div>

            <div className="field-group">
              <label>Opponent</label>
              <div style={{ marginBottom: 8 }}>
                {topOpponents.map((p) => (
                  <button
                    key={p.id}
                    className="btn-icon"
                    style={{ marginRight: 6 }}
                    onClick={() => {
                      setOpponentId(p.id);
                      setError('');
                    }}
                  >
                    {getParticipantName(p, isDoubles)}
                  </button>
                ))}
              </div>
              <select
                value={opponentId}
                onChange={(e) => {
                  setOpponentId(e.target.value);
                  setError('');
                }}
              >
                <option value="">Select opponent…</option>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {getParticipantName(p, isDoubles)}
                  </option>
                ))}
              </select>
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
              disabled={!opponentId}
            >
              Create & Enter Score
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default AdhocMatchModal;
