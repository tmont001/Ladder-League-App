// src/components/dashboard/Dashboard.js
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

// ── Notification bell ─────────────────────────────────────────

function NotificationBell() {
  const { unreadCount, notifications, readAllNotifications } = useLeague();
  const { currentPlayer } = usePlayerIdentity();
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen((v) => !v);
    if (!open && unreadCount > 0 && currentPlayer) {
      readAllNotifications(currentPlayer.id);
    }
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

// ── Player chip (top bar) ─────────────────────────────────────

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

// ── Dashboard content (shown after identity confirmed) ────────

function DashboardContent() {
  const { settings, rounds, currentRoundNumber, loadNotifications } =
    useLeague();
  const { currentPlayer, isAdmin } = usePlayerIdentity();
  const [activeTab, setActiveTab] = useState('standings');
  const [showPlayers, setShowPlayers] = useState(false);

  // Load notifications when player identity is known
  useEffect(() => {
    if (currentPlayer?.id) {
      loadNotifications(currentPlayer.id);
    }
  }, [currentPlayer?.id, loadNotifications]);

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
        <div className="dashboard-topbar-right">
          {isAdmin && (
            <button
              className="btn-players-panel"
              onClick={() => setShowPlayers(true)}
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
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Players
            </button>
          )}
          <NotificationBell />
          <PlayerChip />
          <ThemeToggle />
        </div>
      </div>

      {showPlayers && <PlayersPanel onClose={() => setShowPlayers(false)} />}

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
        {activeTab === 'standings' && <StandingsTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'stats' && <StatsTab />}
      </div>
    </div>
  );
}

// ── Root Dashboard — handles identity gate ────────────────────

function DashboardInner() {
  const { currentPlayer, loading } = usePlayerIdentity();
  const { settings } = useLeague();

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <div className="loading-text">Loading league…</div>
      </div>
    );
  }

  if (!currentPlayer) {
    return (
      <PlayerPicker leagueName={settings?.leagueName} sport={settings?.sport} />
    );
  }

  return <DashboardContent />;
}

function Dashboard({ settings, leagueData }) {
  return (
    <LeagueProvider settings={settings} initialLeagueData={leagueData}>
      <DashboardInner />
    </LeagueProvider>
  );
}

export default Dashboard;
