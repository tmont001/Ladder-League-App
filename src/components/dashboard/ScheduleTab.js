import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { usePlayerIdentity } from '../../context/PlayerIdentityContext';
import ScoreEntryModal from './ScoreEntryModal';
import ChallengeModal from './ChallengeModal';
import Portal from '../shared/Portal';

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
    declined: { label: 'Declined', cls: 'badge-skipped' },
    expired: { label: 'Expired', cls: 'badge-skipped' },
    accepted: { label: 'Accepted', cls: 'badge-confirmed' },
  };
  const { label, cls } = map[status] || map.pending;
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

function daysUntil(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso) - new Date()) / 86400000));
}

function IncomingChallengeCard({ challenge, playerMap, onRespond }) {
  const { currentPlayer } = usePlayerIdentity();
  const [respondingWith, setRespondingWith] = useState(null);
  const [error, setError] = useState(null);

  const isClientExpired =
    challenge.expires_at && new Date(challenge.expires_at) < new Date();
  const challengerName =
    playerMap[challenge.challenger_player_id]?.name || 'Unknown';

  const handleRespond = async (accept) => {
    if (respondingWith !== null) return;
    setRespondingWith(accept ? 'accept' : 'decline');
    setError(null);
    try {
      await onRespond(currentPlayer.sessionToken, challenge.id, accept);
    } catch (err) {
      setError(err?.message || 'Failed to respond. Please try again.');
      setRespondingWith(null);
    }
  };

  return (
    <div className={`match-card${isClientExpired ? ' match-card-done' : ' match-card-incoming'}`}>
      <div className="match-card-left">
        <div className="match-players">
          <span className="match-player-name">{challengerName}</span>
          <span className="match-vs-text">challenged you</span>
        </div>
        {isClientExpired ? (
          <div className="match-meta">This challenge has expired</div>
        ) : challenge.expires_at ? (
          <div className="match-meta">
            {daysUntil(challenge.expires_at)} day
            {daysUntil(challenge.expires_at) !== 1 ? 's' : ''} to respond
          </div>
        ) : null}
        {error && (
          <div
            className="picker-error"
            role="alert"
            style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', marginTop: '0.25rem' }}
          >
            {error}
          </div>
        )}
      </div>
      <div className="match-card-right">
        {isClientExpired ? (
          <StatusBadge status="expired" />
        ) : (
          <>
            <StatusBadge status="pending" />
            <div className="match-actions">
              <button
                className="btn-score-entry"
                onClick={() => handleRespond(true)}
                disabled={respondingWith !== null}
              >
                {respondingWith === 'accept' ? '…' : 'Accept'}
              </button>
              <button
                className="btn-resolve"
                onClick={() => handleRespond(false)}
                disabled={respondingWith !== null}
              >
                {respondingWith === 'decline' ? '…' : 'Decline'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OutgoingChallengeCard({ challenge, playerMap }) {
  const challengedName =
    playerMap[challenge.challenged_player_id]?.name || 'Unknown';
  const isClientExpired =
    challenge.status === 'pending' &&
    challenge.expires_at &&
    new Date(challenge.expires_at) < new Date();
  const displayStatus = isClientExpired ? 'expired' : challenge.status;

  return (
    <div className={`match-card ${displayStatus === 'declined' || displayStatus === 'expired' ? 'match-card-done' : ''}`}>
      <div className="match-card-left">
        <div className="match-players">
          <span className="match-player-name">vs {challengedName}</span>
        </div>
        {displayStatus === 'pending' && challenge.expires_at && (
          <div className="match-meta">
            Awaiting response · {daysUntil(challenge.expires_at)} day
            {daysUntil(challenge.expires_at) !== 1 ? 's' : ''} remaining
          </div>
        )}
        {isClientExpired && (
          <div className="match-meta">The deadline to respond has passed</div>
        )}
        {displayStatus === 'declined' && (
          <div className="match-meta">Challenge was declined</div>
        )}
      </div>
      <div className="match-card-right">
        <StatusBadge status={displayStatus} />
      </div>
    </div>
  );
}

function OrgChallengeCard({ challenge, playerMap }) {
  const challengerName =
    playerMap[challenge.challenger_player_id]?.name || 'Unknown';
  const challengedName =
    playerMap[challenge.challenged_player_id]?.name || 'Unknown';
  const isClientExpired =
    challenge.status === 'pending' &&
    challenge.expires_at &&
    new Date(challenge.expires_at) < new Date();
  const displayStatus = isClientExpired ? 'expired' : challenge.status;

  return (
    <div className="match-card">
      <div className="match-card-left">
        <div className="match-players">
          <span className="match-player-name">{challengerName}</span>
          <span className="match-vs-text">→</span>
          <span className="match-player-name">{challengedName}</span>
        </div>
        {isClientExpired && (
          <div className="match-meta">Challenge expired</div>
        )}
      </div>
      <div className="match-card-right">
        <StatusBadge status={displayStatus} />
      </div>
    </div>
  );
}

function ChallengesSection({ respondToChallenge }) {
  const { challenges, participants, isDoubles } = useLeague();
  const { currentPlayer, isOrgIdentity } = usePlayerIdentity();

  if (isDoubles) return null;

  const playerMap = {};
  (participants || []).forEach((p) => { playerMap[p.id] = p; });

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let incoming = [];
  let outgoing = [];
  let orgPending = [];

  if (isOrgIdentity) {
    orgPending = challenges.filter((c) => c.status === 'pending');
  } else if (currentPlayer) {
    incoming = challenges.filter(
      (c) =>
        c.challenged_player_id === currentPlayer.id && c.status === 'pending',
    );
    outgoing = challenges.filter(
      (c) =>
        c.challenger_player_id === currentPlayer.id &&
        (c.status === 'pending' ||
          (c.status === 'declined' &&
            new Date(c.created_at) > sevenDaysAgo)),
    );
  }

  if (incoming.length === 0 && outgoing.length === 0 && orgPending.length === 0) {
    return null;
  }

  return (
    <div className="round-section round-section-challenges">
      <div className="round-header">
        <div className="round-title">Challenges</div>
      </div>
      {incoming.length > 0 && (
        <div className="round-matches">
          {incoming.map((c) => (
            <IncomingChallengeCard
              key={c.id}
              challenge={c}
              playerMap={playerMap}
              onRespond={respondToChallenge}
            />
          ))}
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="round-matches">
          {outgoing.map((c) => (
            <OutgoingChallengeCard key={c.id} challenge={c} playerMap={playerMap} />
          ))}
        </div>
      )}
      {orgPending.length > 0 && (
        <div className="round-matches">
          {orgPending.map((c) => (
            <OrgChallengeCard key={c.id} challenge={c} playerMap={playerMap} />
          ))}
        </div>
      )}
    </div>
  );
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

function SubmittedResultSummary({ match, isDoubles }) {
  const result = match.result;
  if (!result) return null;
  const p1Name = getParticipantName(match.p1, isDoubles);
  const p2Name = getParticipantName(match.p2, isDoubles);
  const winnerName = result.winnerId === match.p1?.id ? p1Name : p2Name;
  const loserName  = result.winnerId === match.p1?.id ? p2Name : p1Name;
  const setScoreLine = result.setScores
    ?.map((sc) =>
      sc.tiebreak ? `${sc.p1}–${sc.p2} (${sc.tiebreak})` : `${sc.p1}–${sc.p2}`,
    )
    .join(', ');
  const dateStr = result.date
    ? new Date(result.date + 'T12:00:00').toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;
  const metaLine = [result.location, dateStr].filter(Boolean).join(' · ');
  return (
    <div style={{ fontSize: '0.78rem', lineHeight: 1.4, marginBottom: '0.35rem' }}>
      <div
        style={{
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          fontSize: '0.7rem',
          color: 'var(--text-dim, #888)',
          marginBottom: '0.1rem',
        }}
      >
        Submitted score
      </div>
      <div style={{ fontWeight: 600, color: 'var(--text)' }}>
        {winnerName} defeated {loserName}
      </div>
      <div style={{ color: 'var(--text)' }}>{setScoreLine}</div>
      {metaLine && (
        <div style={{ color: 'var(--text-dim, #888)', fontSize: '0.75rem' }}>
          {metaLine}
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, onEnterScore, onConfirm, onDispute, onSkip }) {
  const { isDoubles } = useLeague();
  const { currentPlayer, isAdmin } = usePlayerIdentity();
  const [skipConfirming, setSkipConfirming] = useState(false);
  const [skipPending, setSkipPending] = useState(false);
  const [skipError, setSkipError] = useState(null);

  const handleConfirmSkip = async () => {
    setSkipPending(true);
    setSkipError(null);
    try {
      await onSkip(match.id);
    } catch (err) {
      console.error('[ScheduleTab] skip failed:', err);
      setSkipError('Something went wrong. Please try again.');
      setSkipConfirming(false);
    } finally {
      setSkipPending(false);
    }
  };

  const p1Name = getParticipantName(match.p1, isDoubles);
  const p2Name = getParticipantName(match.p2, isDoubles);

  const isPending = match.status === 'pending';
  const isAwaiting = match.status === 'awaiting_confirmation';
  const isConfirmed = match.status === 'confirmed';
  const isDisputed = match.status === 'disputed';

  // A player can confirm if they're on the opposing side (not the submitter's).
  // For doubles, p1/p2 are team objects — test the nested players array.
  const isParticipant = isDoubles
    ? (match.p1?.players?.some((p) => p.id === currentPlayer?.id) ||
       match.p2?.players?.some((p) => p.id === currentPlayer?.id))
    : (match.p1?.id === currentPlayer?.id ||
       match.p2?.id === currentPlayer?.id);

  // Determine whether the current player is on the same side as the submitter.
  // For doubles this blocks both the submitter and their partner.
  let isSameSideAsSubmitter = false;
  if (match.submittedBy && currentPlayer) {
    if (isDoubles) {
      const subOnP1 = match.p1?.players?.some((p) => p.id === match.submittedBy);
      const subOnP2 = match.p2?.players?.some((p) => p.id === match.submittedBy);
      const curOnP1 = match.p1?.players?.some((p) => p.id === currentPlayer.id);
      const curOnP2 = match.p2?.players?.some((p) => p.id === currentPlayer.id);
      isSameSideAsSubmitter =
        (subOnP1 && curOnP1) || (subOnP2 && curOnP2);
    } else {
      isSameSideAsSubmitter = match.submittedBy === currentPlayer.id;
    }
  }

  const canConfirmAsPlayer =
    isAwaiting && currentPlayer && isParticipant && !isSameSideAsSubmitter;
  // Admin can confirm or override any awaiting / disputed match
  const canConfirm = canConfirmAsPlayer || (isAwaiting && isAdmin);

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
                  {match.result.setScores?.map((sc, i) => (
                    <span key={i} className="match-set-score">
                      {sc.p1}–{sc.p2}
                      {sc.tiebreak && (
                        <span className="match-tb-score"> ({sc.tiebreak})</span>
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
            {skipConfirming ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 4,
                }}
              >
                {skipError && (
                  <div
                    className="picker-error"
                    role="alert"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                  >
                    {skipError}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="btn-back"
                    onClick={() => {
                      setSkipConfirming(false);
                      setSkipError(null);
                    }}
                    disabled={skipPending}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn-resolve btn-skip-confirm"
                    onClick={handleConfirmSkip}
                    disabled={skipPending}
                  >
                    {skipPending ? 'Skipping…' : 'Confirm Skip'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn-resolve"
                onClick={() => setSkipConfirming(true)}
              >
                Skip
              </button>
            )}
          </div>
        )}

        {isAwaiting && (
          <div className="match-actions">
            <SubmittedResultSummary match={match} isDoubles={isDoubles} />
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
            <SubmittedResultSummary match={match} isDoubles={isDoubles} />
            {isAdmin ? (
              <button
                className="btn-score-entry"
                onClick={() => onConfirm(match)}
              >
                Override &amp; Confirm
              </button>
            ) : (
              <span className="match-disputed-label">
                ⚠ Pending admin review
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function RoundSection({ round, onEnterScore, onConfirm, onDispute, onSkip }) {
  const completed = round.matches.filter((m) =>
    ['confirmed', 'skipped'].includes(m.status),
  ).length;
  const totalNonBye = round.matches.filter((m) => !m.isBye).length;
  return (
    <div className="round-section">
      <div className="round-header">
        <div className="round-title">
          Round {round.roundNumber}{' '}
          {round.isComplete && (
            <span className="round-complete-badge">Complete</span>
          )}
        </div>
        <div className="round-progress-text">
          {completed}/{totalNonBye} matches done
        </div>
      </div>
      <div className="round-progress-bar">
        <div
          className="round-progress-fill"
          style={{
            width:
              totalNonBye > 0 ? `${(completed / totalNonBye) * 100}%` : '0%',
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

function DisputeModal({ match, onClose }) {
  const { disputeResult, isDoubles } = useLeague();
  const { currentPlayer } = usePlayerIdentity();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await disputeResult(match.id, currentPlayer?.sessionToken, reason.trim());
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to submit dispute. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Dispute Score</div>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            {match.result && (
              <div className="dispute-submitted-box">
                <SubmittedResultSummary match={match} isDoubles={isDoubles} />
              </div>
            )}
            <p className="dispute-description">
              Describe what's incorrect. An admin will review within 24 hours.
            </p>
            <textarea
              className="bulk-textarea"
              placeholder="e.g. The score was 6-4, 3-6, 7-5, not 6-4, 6-3"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              rows={3}
            />
            {error && (
              <div className="modal-error" role="alert">
                {error}
              </div>
            )}
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
    </Portal>
  );
}

function ScheduleTab() {
  const { rounds, confirmResult, resolveDispute, resolveMatch, settings, respondToChallenge } = useLeague();
  const { currentPlayer, isOrgIdentity } = usePlayerIdentity();
  const challengesEnabled =
    settings?.mode === 'ladder' && settings?.challengesEnabled !== false;
  const [scoreMatch, setScoreMatch] = useState(null);
  const [disputeMatch, setDisputeMatch] = useState(null);
  const [showChallenge, setShowChallenge] = useState(false);

  const handleConfirm = async (match) => {
    if (isOrgIdentity) {
      await resolveDispute(match.id);
    } else {
      await confirmResult(match.id, currentPlayer?.sessionToken || null);
    }
  };
  const handleSkip = async (matchId) => {
    await resolveMatch(matchId);
  };

  return (
    <div className="schedule-wrapper">
      <div className="schedule-toolbar">
        {challengesEnabled && (
          <button
            className="btn-outline"
            onClick={() => setShowChallenge(true)}
          >
            + Issue Challenge
          </button>
        )}
      </div>
      {challengesEnabled && (
        <ChallengesSection respondToChallenge={respondToChallenge} />
      )}
      {rounds.map((round) => (
        <RoundSection
          key={round.roundNumber}
          round={round}
          onEnterScore={setScoreMatch}
          onConfirm={handleConfirm}
          onDispute={setDisputeMatch}
          onSkip={handleSkip}
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
