import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';
import { getParticipantName } from '../../utils/participants';
import ScoreEntryModal from './ScoreEntryModal';
import ChallengeModal from './ChallengeModal';

function StatusBadge({ status, type }) {
  const map = {
    pending: {
      label: type === 'challenge' ? 'Challenge' : 'Pending',
      cls: 'badge-pending',
    },
    completed: { label: 'Completed', cls: 'badge-completed' },
    skipped: { label: 'Skipped', cls: 'badge-skipped' },
  };
  const { label, cls } = map[status] || map.pending;
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

function MatchCard({ match, onEnterScore, onResolve }) {
  const { isDoubles } = useLeague();
  const p1Name = getParticipantName(match.p1, isDoubles);
  const p2Name = getParticipantName(match.p2, isDoubles);
  const isPending = match.status === 'pending';
  const isDone = match.status === 'completed';

  return (
    <div
      className={`match-card ${isDone ? 'match-card-done' : ''} ${match.isBye ? 'match-card-bye' : ''}`}
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
                className={`match-player-name ${isDone && match.result?.winnerId === match.p1?.id ? 'match-winner' : ''}`}
              >
                {p1Name}
              </span>
              {isDone && match.result ? (
                <span className="match-score-display">
                  {match.result.setScores.map((s, i) => (
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
                className={`match-player-name ${isDone && match.result?.winnerId === match.p2?.id ? 'match-winner' : ''}`}
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
            <button
              className="btn-resolve"
              onClick={() => onResolve(match.id, 'skipped')}
            >
              Skip
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RoundSection({ round, onEnterScore, onResolve }) {
  const completedCount = round.matches.filter(
    (m) => m.status === 'completed' || m.status === 'skipped',
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
            onResolve={onResolve}
          />
        ))}
      </div>
    </div>
  );
}

function ScheduleTab() {
  const { rounds, resolveMatch } = useLeague();
  const [scoreMatch, setScoreMatch] = useState(null);
  const [showChallenge, setShowChallenge] = useState(false);

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
          onResolve={resolveMatch}
        />
      ))}

      {scoreMatch && (
        <ScoreEntryModal
          match={scoreMatch}
          onClose={() => setScoreMatch(null)}
        />
      )}
      {showChallenge && (
        <ChallengeModal onClose={() => setShowChallenge(false)} />
      )}
    </div>
  );
}

export default ScheduleTab;
