import React, { useState, useEffect } from 'react';
import { LeagueProvider, useLeague } from '../../context/LeagueContext';
import { usePlayerIdentity } from '../../context/PlayerIdentityContext';
import ThemeToggle from '../shared/ThemeToggle';
import PlayerPicker from '../PlayerPicker';
import { TennisRacquetIcon, PickleballPaddleIcon } from '../SportIcons';
import StandingsTab from './StandingsTab';
import ScheduleTab from './ScheduleTab';
import StatsTab from './StatsTab';
import PlayersPanel from './PlayersPanel';
import SettingsModal from './SettingsModal';
import ErrorBoundary from '../shared/ErrorBoundary';

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
  // Messages tab omitted: MessengerTab is in-memory only and not delivered to
  // other users. Messages are lost on page refresh and are invisible to anyone
  // else in the league.
];

function NotificationBell() {
  const { unreadCount, notifications, readAllNotifications } = useLeague();
  const { currentPlayer } = usePlayerIdentity();
  const [open, setOpen] = useState(false);
  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0 && currentPlayer)
      readAllNotifications(currentPlayer.id);
  };
  return (
    <div className="notif-bell-wrap">
      <button
        className="notif-bell-btn"
        onClick={handleOpen}
        aria-label="Notifications"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="notif-dropdown" onClick={(e) => e.stopPropagation()}>
          <div className="notif-dropdown-header">Notifications</div>
          {notifications.length === 0 ? (
            <div className="notif-empty">Nothing new</div>
          ) : (
            notifications.slice(0, 10).map((n) => (
              <div
                key={n.id}
                className={`notif-item ${n.read ? 'notif-read' : 'notif-unread'}`}
              >
                <div className="notif-message">{n.message}</div>
                <div className="notif-time">{formatTimeAgo(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function PlayerChip() {
  const { currentPlayer, logout } = usePlayerIdentity();
  const [showMenu, setShowMenu] = useState(false);
  if (!currentPlayer) return null;
  return (
    <div className="player-chip-wrap">
      <button className="player-chip" onClick={() => setShowMenu((v) => !v)}>
        <span className="player-chip-avatar">
          {currentPlayer.name.charAt(0).toUpperCase()}
        </span>
        <span className="player-chip-name">
          {currentPlayer.name.split(' ')[0]}
        </span>
      </button>
      {showMenu && (
        <div className="player-chip-menu">
          <div className="player-chip-fullname">{currentPlayer.name}</div>
          {currentPlayer.role === 'admin' && (
            <div className="player-chip-role">Admin</div>
          )}
          <button className="player-chip-logout" onClick={logout}>
            Switch Player
          </button>
        </div>
      )}
    </div>
  );
}

function DashboardContent({ onSettingsSave }) {
  const { settings, rounds, currentRoundNumber, loadNotifications, saveSettings } =
    useLeague();
  const { currentPlayer, isAdmin } = usePlayerIdentity();
  const [activeTab, setActiveTab] = useState('standings');
  const [showPlayers, setShowPlayers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSettingsError, setSaveSettingsError] = useState(null);

  const handleSettingsSave = async (s) => {
    setSavingSettings(true);
    setSaveSettingsError(null);
    try {
      await saveSettings(s);
      onSettingsSave(s);
      setShowSettings(false);
    } catch (err) {
      console.error('[Dashboard] settings save failed:', err);
      setSaveSettingsError('Something went wrong. Please try again.');
    } finally {
      setSavingSettings(false);
    }
  };

  useEffect(() => {
    if (currentPlayer?.id) loadNotifications(currentPlayer.id);
  }, [currentPlayer?.id, loadNotifications]);

  const sport = settings?.sport ?? '';
  const singlesOrDoubles = settings?.singlesOrDoubles ?? '';
  const SportIcon =
    sport === 'tennis' ? TennisRacquetIcon : PickleballPaddleIcon;

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
              {sport.charAt(0).toUpperCase() + sport.slice(1)}{' '}
              ·{' '}
              {singlesOrDoubles.charAt(0).toUpperCase() +
                singlesOrDoubles.slice(1)}{' '}
              · Round {currentRoundNumber} of {settings.rounds}
            </div>
          </div>
        </div>
        <div className="dashboard-topbar-right">
          {isAdmin && (
            <>
              <button className="btn-sm" onClick={() => setShowPlayers(true)}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                Players
              </button>
              <button
                className="btn-sm"
                onClick={() => setShowSettings(true)}
                title="League Settings"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
                Settings
              </button>
            </>
          )}
          <NotificationBell />
          <PlayerChip />
          <ThemeToggle />
        </div>
      </div>

      {showPlayers && <PlayersPanel onClose={() => setShowPlayers(false)} />}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={handleSettingsSave}
          onClose={() => { setShowSettings(false); setSaveSettingsError(null); }}
          saving={savingSettings}
          saveError={saveSettingsError}
        />
      )}

      {/* Progress strip */}
      <div className="dashboard-progress-strip">
        {rounds.map((r) => (
          <div
            key={r.roundNumber}
            className={`progress-pip ${r.isComplete ? 'pip-done' : r.roundNumber === currentRoundNumber ? 'pip-active' : 'pip-idle'}`}
            title={`Round ${r.roundNumber}${r.isComplete ? ' — Complete' : ''}`}
          />
        ))}
      </div>

      {/* Nav Tabs */}
      <nav
        className="dashboard-nav"
        aria-label="Dashboard sections"
        role="tablist"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`nav-tab ${activeTab === tab.id ? 'nav-tab-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Tab Content */}
      <main
        id="main-content"
        className="dashboard-content"
        role="tabpanel"
        aria-live="polite"
      >
        {activeTab === 'standings' && <StandingsTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'stats' && <StatsTab />}
      </main>
    </div>
  );
}

function DashboardInner({ onSettingsSave }) {
  const { currentPlayer, loading } = usePlayerIdentity();
  const { settings, loadingDb } = useLeague();
  // Block DashboardContent until both the player identity AND the league
  // settings are fully resolved. loadingDb is true when a player joined with
  // minimal settings (no sport/singlesOrDoubles) and fetchLeague hasn't run yet.
  if (loading || loadingDb)
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <div className="loading-text">Loading league…</div>
      </div>
    );
  if (!currentPlayer)
    return (
      <PlayerPicker leagueName={settings?.leagueName} sport={settings?.sport} />
    );
  return <DashboardContent onSettingsSave={onSettingsSave} />;
}

function Dashboard({ settings, leagueData, onSettingsSave }) {
  return (
    <LeagueProvider settings={settings} initialLeagueData={leagueData}>
      <ErrorBoundary>
        <DashboardInner onSettingsSave={onSettingsSave} />
      </ErrorBoundary>
    </LeagueProvider>
  );
}

export default Dashboard;
