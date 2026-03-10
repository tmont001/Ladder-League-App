import React, { useState } from 'react';
import { LeagueProvider, useLeague } from '../../context/LeagueContext';
import ThemeToggle from '../shared/ThemeToggle';
import { TennisRacquetIcon, PickleballPaddleIcon } from '../SportIcons';
import StandingsTab from './StandingsTab';
import ScheduleTab from './ScheduleTab';
import StatsTab from './StatsTab';
import ChallengeModal from './ChallengeModal';
import ScoreEntryModal from './ScoreEntryModal';
import AdhocMatchModal from './AdhocMatchModal';

const TABS = [
  {
    id: 'standings',
    label: 'Standings',
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'schedule',
    label: 'Schedule',
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: 'stats',
    label: 'Stats',
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

function DashboardContent() {
  const { settings, rounds, currentRoundNumber } = useLeague();
  const [activeTab, setActiveTab] = useState('standings');
  const [scoreMatch, setScoreMatch] = useState(null);
  const [showChallenge, setShowChallenge] = useState(false);
  const [initialChallengerId, setInitialChallengerId] = useState(null);
  const [initialChallengedId, setInitialChallengedId] = useState(null);
  const [highlightedMatchId, setHighlightedMatchId] = useState(null);
  const [showAdhocMatch, setShowAdhocMatch] = useState(false);
  const [adhocStarterId, setAdhocStarterId] = useState(null);

  const SportIcon =
    settings.sport === 'tennis' ? TennisRacquetIcon : PickleballPaddleIcon;
  const totalCompleted = rounds.filter((r) => r.isComplete).length;

  return (
    <div className="dashboard">
      {/* ── Top Bar ── */}
      <div className="dashboard-topbar">
        <div className="dashboard-brand">
          <span className="dashboard-sport-icon">
            <SportIcon size={22} color="currentColor" />
          </span>
          <div>
            <div className="dashboard-league-name">{settings.leagueName}</div>
            <div className="dashboard-meta">
              {settings.sport.charAt(0).toUpperCase() + settings.sport.slice(1)}{' '}
              ·{' '}
              {settings.singlesOrDoubles.charAt(0).toUpperCase() +
                settings.singlesOrDoubles.slice(1)}{' '}
              · Round {currentRoundNumber} of {settings.rounds}
            </div>
          </div>
        </div>
        <ThemeToggle />
      </div>

      {/* ── Progress strip ── */}
      <div className="dashboard-progress-strip">
        {rounds.map((r) => (
          <div
            key={r.roundNumber}
            className={`progress-pip ${r.isComplete ? 'pip-done' : r.roundNumber === currentRoundNumber ? 'pip-active' : 'pip-idle'}`}
            title={`Round ${r.roundNumber}${r.isComplete ? ' — Complete' : ''}`}
          />
        ))}
      </div>

      {/* ── Nav Tabs ── */}
      <div className="dashboard-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'nav-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div className="dashboard-content">
        {activeTab === 'standings' && (
          <StandingsTab
            onChallenge={(participantId, defaultTargetId) => {
              setInitialChallengerId(participantId);
              setInitialChallengedId(defaultTargetId || null);
              setShowChallenge(true);
            }}
            onEnterScore={(participantId) => {
              // Find a pending match that includes this participant and open score entry
              const pending = rounds
                .flatMap((r) => r.matches)
                .find(
                  (m) =>
                    m.status === 'pending' &&
                    (m.p1?.id === participantId || m.p2?.id === participantId),
                );
              if (pending) {
                setActiveTab('schedule');
                setScoreMatch(pending);
                return;
              }
              // no pending match — open ad-hoc create match modal
              setAdhocStarterId(participantId);
              setShowAdhocMatch(true);
            }}
          />
        )}
        {activeTab === 'schedule' && (
          <ScheduleTab
            onEnterScore={setScoreMatch}
            onOpenChallenge={() => setShowChallenge(true)}
            highlightedMatchId={highlightedMatchId}
          />
        )}
        {activeTab === 'stats' && <StatsTab />}
      </div>

      {scoreMatch && (
        <ScoreEntryModal
          match={scoreMatch}
          onClose={() => setScoreMatch(null)}
        />
      )}

      {showChallenge && (
        <ChallengeModal
          initialChallengerId={initialChallengerId}
          initialChallengedId={initialChallengedId}
          onCreated={(challengeMatch) => {
            setShowChallenge(false);
            setInitialChallengerId(null);
            setInitialChallengedId(null);
            setActiveTab('schedule');
            setHighlightedMatchId(challengeMatch.id);
            // clear highlight after a short time
            setTimeout(() => setHighlightedMatchId(null), 2000);
          }}
          onClose={() => {
            setShowChallenge(false);
            setInitialChallengerId(null);
            setInitialChallengedId(null);
          }}
        />
      )}

      {showAdhocMatch && (
        <AdhocMatchModal
          starterParticipantId={adhocStarterId}
          onClose={() => {
            setShowAdhocMatch(false);
            setAdhocStarterId(null);
          }}
          onCreated={(match) => {
            setActiveTab('schedule');
            setScoreMatch(match);
            setHighlightedMatchId(match.id);
            setTimeout(() => setHighlightedMatchId(null), 2000);
          }}
        />
      )}
    </div>
  );
}

function Dashboard({ settings, leagueData }) {
  return (
    <LeagueProvider settings={settings} initialLeagueData={leagueData}>
      <DashboardContent />
    </LeagueProvider>
  );
}

export default Dashboard;
