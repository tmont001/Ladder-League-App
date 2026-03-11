import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { usePlayerIdentity } from '../../context/PlayerIdentityContext';
import ScoreEntryModal from './ScoreEntryModal';
import ChallengeModal from './ChallengeModal';

function getParticipantName(p, isDoubles) {
  if (!p) return 'BYE';
  return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
}

function StatusBadge({ status, type }) {
  const map = {
    pending: {
      label: type === 'challenge' ? 'Challenge' : 'Pending',
      cls: 'badge-pending',
    },
    awaiting_confirmation: { label: 'Awaiting Confirm', cls: 'badge-awaiting' },
    confirmed: { label: 'Confirmed', cls: 'badge-confirmed' },
    disputed: { label: 'Disputed', cls: 'badge-disputed' },
    skipped: { label: 'Skipped', cls: 'badge-skipped' },
  };
  const { label, cls } = map[status] || map.pending;
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

function AutoConfirmCountdown({ isoString }) {
  if (!isoString) return null;
  const diff = new Date(isoString).getTime() - Date.now();
  if (diff <= 0)
    return <span className="auto-confirm-label">Auto-confirming soon…</span>;
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return (
    <span className="auto-confirm-label">
      Auto-confirms in {hrs > 0 ? `${hrs}h ` : ''}
      {mins}m
    </span>
  );
}

function MatchCard({ match, onEnterScore, onConfirm, onDispute, onSkip }) {
  const { isDoubles } = useLeague();
  const { currentPlayer } = usePlayerIdentity();

  const p1Name = getParticipantName(match.p1, isDoubles);
  const p2Name = getParticipantName(match.p2, isDoubles);

  const isPending = match.status === 'pending';
  const isAwaiting = match.status === 'awaiting_confirmation';
  const isConfirmed = match.status === 'confirmed';
  const isDisputed = match.status === 'disputed';

  // Can the current player confirm? They must be the opponent (not the submitter)
  const canConfirm =
    isAwaiting &&
    currentPlayer &&
    match.submittedBy !== currentPlayer.id &&
    (match.p1?.id === currentPlayer.id || match.p2?.id === currentPlayer.id);

  return (
    <div
      className={`match-card ${isConfirmed ? 'match-card-done' : ''} ${match.isBye ? 'match-card-bye' : ''} ${isDisputed ? 'match-card-disputed' : ''}`}
    >
      <div className="match-card-left">
        <div className="match-players">
          {match.isBye ? (
            <span className="match-player-name">
              {p1Name} <span className="bye-tag">BYE</span>
            </span>
          ) : (
            <>
              <span
                className={`match-player-name ${isConfirmed && match.result?.winnerId === match.p1?.id ? 'match-winner' : ''}`}
              >
                {p1Name}
              </span>
              {isConfirmed && match.result ? (
                <span className="match-score-display">
                  {match.result.setScores?.map((s, i) => (
                    <span key={i} className="match-set-score">
                      {s.p1}–{s.p2}
                      {s.tiebreak && (
                        <span className="match-tb-score"> ({s.tiebreak})</span>
                      )}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="match-vs-text">vs</span>
              )}
              <span
                className={`match-player-name ${isConfirmed && match.result?.winnerId === match.p2?.id ? 'match-winner' : ''}`}
              >
                {p2Name}
              </span>
            </>
          )}
        </div>

        {match.result?.date && (
          <div className="match-meta">
            {match.result.date}
            {match.result.location && <> · {match.result.location}</>}
          </div>
        )}

        {isAwaiting && (
          <div className="match-meta">
            Score submitted ·{' '}
            <AutoConfirmCountdown isoString={match.autoConfirmAfter} />
          </div>
        )}
      </div>

      <div className="match-card-right">
        <StatusBadge status={match.status} type={match.type} />

        {isPending && !match.isBye && (
          <div className="match-actions">
            <button
              className="btn-score-entry"
              onClick={() => onEnterScore(match)}
            >
              Enter Score
            </button>
            <button className="btn-resolve" onClick={() => onSkip(match.id)}>
              Skip
            </button>
          </div>
        )}

        {isAwaiting && (
          <div className="match-actions">
            {canConfirm ? (
              <>
                <button
                  className="btn-score-entry"
                  onClick={() => onConfirm(match)}
                >
                  ✓ Confirm
                </button>
                <button
                  className="btn-resolve"
                  onClick={() => onDispute(match)}
                >
                  Dispute
                </button>
              </>
            ) : (
              <span className="match-waiting-label">Waiting for opponent</span>
            )}
          </div>
        )}

        {isDisputed && (
          <div className="match-actions">
            <span className="match-disputed-label">⚠ Pending admin review</span>
          </div>
        )}
      </div>
    </div>
  );
}

function RoundSection({ round, onEnterScore, onConfirm, onDispute, onSkip }) {
  const completedCount = round.matches.filter((m) =>
    ['confirmed', 'skipped'].includes(m.status),
  ).length;
  const totalNonBye = round.matches.filter((m) => !m.isBye).length;

  return (
    <div className="round-section">
      <div className="round-header">
        <div className="round-title">
          Round {round.roundNumber}
          {round.isComplete && (
            <span className="round-complete-badge">Complete</span>
          )}
        </div>
        <div className="round-progress-text">
          {completedCount}/{totalNonBye} matches done
        </div>
      </div>

      <div className="round-progress-bar">
        <div
          className="round-progress-fill"
          style={{
            width:
              totalNonBye > 0
                ? `${(completedCount / totalNonBye) * 100}%`
                : '0%',
          }}
        />
      </div>

      <div className="round-matches">
        {round.matches.map((match) => (
          <MatchCard
            key={match.id}
            match={match}
            onEnterScore={onEnterScore}
            onConfirm={onConfirm}
            onDispute={onDispute}
            onSkip={onSkip}
          />
        ))}
      </div>
    </div>
  );
}

// ── Dispute modal ─────────────────────────────────────────────

function DisputeModal({ match, onClose }) {
  const { isDoubles, disputeResult } = useLeague();
  const { currentPlayer } = usePlayerIdentity();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await disputeResult(match.id, currentPlayer?.id, reason.trim());
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Dispute Score</div>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--text)',
              marginBottom: '0.5rem',
            }}
          >
            Describe what's incorrect about the submitted score. An admin will
            review within 24 hours.
          </p>
          <textarea
            className="bulk-textarea"
            placeholder="e.g. The score was 6-4, 3-6, 7-5, not 6-4, 6-3"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <div className="modal-footer">
          <button className="btn-back" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-next"
            onClick={handleSubmit}
            disabled={!reason.trim() || loading}
          >
            {loading ? 'Submitting…' : 'Submit Dispute'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ScheduleTab ──────────────────────────────────────────

function ScheduleTab() {
  const { rounds, confirmResult } = useLeague();
  const { currentPlayer } = usePlayerIdentity();

  const [scoreMatch, setScoreMatch] = useState(null);
  const [disputeMatch, setDisputeMatch] = useState(null);
  const [showChallenge, setShowChallenge] = useState(false);

  const handleConfirm = async (match) => {
    if (!currentPlayer) return;
    await confirmResult(match.id, currentPlayer.id);
  };

  return (
    <div className="schedule-wrapper">
      <div className="schedule-toolbar">
        <button
          className="btn-challenge-open"
          onClick={() => setShowChallenge(true)}
        >
          + Issue Challenge
        </button>
      </div>

      {rounds.map((round) => (
        <RoundSection
          key={round.roundNumber}
          round={round}
          onEnterScore={setScoreMatch}
          onConfirm={handleConfirm}
          onDispute={setDisputeMatch}
          onSkip={(id) => {
            /* resolveMatch(id) */
          }}
        />
      ))}

      {scoreMatch && (
        <ScoreEntryModal
          match={scoreMatch}
          onClose={() => setScoreMatch(null)}
        />
      )}
      {disputeMatch && (
        <DisputeModal
          match={disputeMatch}
          onClose={() => setDisputeMatch(null)}
        />
      )}
      {showChallenge && (
        <ChallengeModal onClose={() => setShowChallenge(false)} />
      )}
    </div>
  );
}

export default ScheduleTab;
