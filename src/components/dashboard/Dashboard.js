import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LeagueProvider, useLeague } from '../../context/LeagueContext';
import { usePlayerIdentity } from '../../context/PlayerIdentityContext';
import { useTheme } from '../../context/ThemeContext';
import ThemeToggle from '../shared/ThemeToggle';
import PlayerPicker from '../PlayerPicker';
import { TennisRacquetIcon, PickleballPaddleIcon } from '../SportIcons';
import StandingsTab from './StandingsTab';
import ScheduleTab from './ScheduleTab';
import StatsTab from './StatsTab';
import PlayersPanel from './PlayersPanel';
import SettingsModal from './SettingsModal';
import ErrorBoundary from '../shared/ErrorBoundary';
import { listMyLeagues } from '../../lib/db';
import { useDismissibleLayer } from '../../hooks/useDismissibleLayer';
import { useToast } from '../shared/ToastProvider';

const TABS = [
  {
    id: 'standings',
    label: 'Standings',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
];

function NotificationBell() {
  const { unreadCount, notifications, readAllNotifications } = useLeague();
  const { currentPlayer } = usePlayerIdentity();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const handleKeydown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open]);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0 && currentPlayer?.sessionToken)
      readAllNotifications(currentPlayer.sessionToken);
  };

  return (
    <div className="notif-bell-wrap" ref={wrapRef}>
      <button className="notif-bell-btn" onClick={handleOpen} aria-label="Notifications" aria-expanded={open}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">Notifications</div>
          {notifications.length === 0 ? (
            <div className="notif-empty">Nothing new</div>
          ) : (
            notifications.slice(0, 10).map((n) => (
              <div key={n.id} className={`notif-item ${n.read ? 'notif-read' : 'notif-unread'}`}>
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

function PlayerChip({ onShowPlayers, onShowSettings, onShowGettingStarted }) {
  const { currentPlayer, logout, isOrgIdentity, orgSignOut } = usePlayerIdentity();
  const { isDark, toggleTheme } = useTheme();
  const [showMenu, setShowMenu] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  const menuRef = useDismissibleLayer(showMenu, useCallback(() => setShowMenu(false), []));

  if (!currentPlayer) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await orgSignOut();
    } catch {
      setSigningOut(false);
      setSignOutError('Sign out failed. Please try again.');
    }
  };

  return (
    <div className="player-chip-wrap" ref={menuRef}>
      <button className="player-chip" onClick={() => setShowMenu((v) => !v)} aria-expanded={showMenu}>
        <span className="player-chip-avatar">
          {currentPlayer.name.charAt(0).toUpperCase()}
        </span>
        <span className="player-chip-name">{currentPlayer.name.split(' ')[0]}</span>
      </button>
      {showMenu && (
        <div className="player-chip-menu">
          <div className="player-chip-fullname">{currentPlayer.name}</div>
          {currentPlayer.role === 'admin' && (
            <div className="player-chip-role">Admin</div>
          )}
          {signOutError && (
            <div role="alert" className="player-chip-error">{signOutError}</div>
          )}

          {/* Mobile-only: Players, Settings, Getting Started */}
          {onShowPlayers && (
            <button
              className="player-chip-action player-chip-action-mobile"
              onClick={() => { setShowMenu(false); onShowPlayers(); }}
            >
              Players
            </button>
          )}
          {onShowSettings && (
            <button
              className="player-chip-action player-chip-action-mobile"
              onClick={() => { setShowMenu(false); onShowSettings(); }}
            >
              Settings
            </button>
          )}
          {isOrgIdentity && onShowGettingStarted && (
            <button
              className="player-chip-action player-chip-action-mobile"
              onClick={() => { setShowMenu(false); onShowGettingStarted(); }}
            >
              Getting Started
            </button>
          )}
          {/* Mobile-only: Theme toggle */}
          <button
            className="player-chip-action player-chip-action-mobile"
            onClick={toggleTheme}
          >
            {isDark ? 'Light Mode' : 'Dark Mode'}
          </button>

          {isOrgIdentity && orgSignOut ? (
            <button className="player-chip-logout" onClick={handleSignOut} disabled={signingOut}>
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          ) : (
            <button className="player-chip-logout" onClick={logout}>
              Switch Player
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LeagueSwitcher({ currentLeagueId, leagueName, onSwitch, onBackToMyLeagues }) {
  const [open, setOpen] = useState(false);
  const [leagues, setLeagues] = useState([]);
  const switcherRef = useDismissibleLayer(open, useCallback(() => setOpen(false), []));

  useEffect(() => {
    listMyLeagues()
      .then(setLeagues)
      .catch(() => {});
  }, []);

  const others = leagues.filter(
    (l) => l.league_id !== currentLeagueId && l.status !== 'archived',
  );

  if (!open) {
    return (
      <div className="league-switcher-wrap" ref={switcherRef}>
        <button
          className="league-switcher-btn"
          onClick={() => setOpen(true)}
          aria-label="Switch league"
          aria-haspopup="listbox"
          aria-expanded={false}
        >
          <span>{leagueName}</span>
          <span className="league-switcher-caret" aria-hidden="true">▾</span>
        </button>
      </div>
    );
  }

  const active   = others.filter((l) => l.status === 'active');
  const ended    = others.filter((l) => l.status === 'ended');

  return (
    <div className="league-switcher-wrap" ref={switcherRef}>
      <button
        className="league-switcher-btn"
        onClick={() => setOpen(false)}
        aria-label="Close league switcher"
        aria-expanded={true}
      >
        <span>{leagueName}</span>
        <span className="league-switcher-caret" aria-hidden="true">▴</span>
      </button>
      <div className="league-switcher-menu" role="listbox" aria-label="Switch league">
        <div className="league-switcher-item league-switcher-item-current" role="option" aria-selected="true">
          {leagueName}
        </div>

        {active.length > 0 && (
          <>
            <div className="league-switcher-group-label">Active</div>
            {active.map((l) => (
              <button
                key={l.league_id}
                className="league-switcher-item"
                role="option"
                aria-selected="false"
                onClick={() => { setOpen(false); onSwitch(l.league_id); }}
              >
                {l.name}
              </button>
            ))}
          </>
        )}

        {ended.length > 0 && (
          <>
            <div className="league-switcher-group-label">Ended</div>
            {ended.map((l) => (
              <button
                key={l.league_id}
                className="league-switcher-item league-switcher-item-ended"
                role="option"
                aria-selected="false"
                onClick={() => { setOpen(false); onSwitch(l.league_id); }}
              >
                {l.name}
              </button>
            ))}
          </>
        )}

        <div className="league-switcher-footer">
          <button
            className="league-switcher-all"
            onClick={() => { setOpen(false); onBackToMyLeagues(); }}
          >
            All Leagues →
          </button>
        </div>
      </div>
    </div>
  );
}

function OnboardingChecklist({ settings, matches, challenges, isDoubles, dismissed, onDismiss }) {
  if (dismissed || !settings?.id) return null;

  const hasResult = matches?.some((m) => m.status === 'confirmed' || m.status === 'resolved');
  const hasChallenge = (challenges?.length ?? 0) > 0;
  const isLadder = settings.mode === 'ladder';
  const showChallengeStep =
    isLadder && !isDoubles && settings?.challengesEnabled !== false;

  const steps = [
    { label: 'League created',              done: true },
    { label: 'Share player access codes',   done: false },
    { label: 'First result recorded',       done: hasResult },
    ...(showChallengeStep
      ? [{ label: 'First challenge issued', done: hasChallenge }]
      : []),
  ];

  return (
    <div className="onboarding-card">
      <div className="onboarding-header">
        <span className="onboarding-title">Getting started</span>
        <button className="onboarding-dismiss" onClick={onDismiss} aria-label="Dismiss checklist">
          Dismiss
        </button>
      </div>
      <ul className="onboarding-steps">
        {steps.map((step) => (
          <li key={step.label} className={`onboarding-step ${step.done ? 'onboarding-step-done' : ''}`}>
            <span className={`onboarding-check ${step.done ? 'onboarding-check-done' : ''}`}>
              {step.done ? '✓' : ''}
            </span>
            <span>{step.label}</span>
          </li>
        ))}
      </ul>
      <div className="onboarding-guidance">
        <p><strong>Organizers</strong> sign in via Magic Link from the home screen.</p>
        <p><strong>Players</strong> join using their unique access code at the join screen.</p>
      </div>
    </div>
  );
}

function DashboardContent({ onSettingsSave, onBackToMyLeagues, onSwitchLeague }) {
  const { settings, rounds, currentRoundNumber, loadNotifications, saveSettings, matches, challenges, isDoubles } =
    useLeague();
  const { currentPlayer, isAdmin, isOrgIdentity } = usePlayerIdentity();
  const { showToast } = useToast();
  const [activeTab, setActiveTab]         = useState('standings');
  const [showPlayers, setShowPlayers]     = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [savingSettings, setSavingSettings]   = useState(false);
  const [saveSettingsError, setSaveSettingsError] = useState(null);

  const checklistStorageKey = `ll_onboarding_dismissed_${settings?.id}`;
  const [checklistDismissed, setChecklistDismissed] = useState(() => {
    if (localStorage.getItem(`ll_onboarding_dismissed_${settings?.id}`)) return true;
    const ageMs = Date.now() - new Date(settings?.createdAt || 0).getTime();
    return ageMs > 7 * 24 * 60 * 60 * 1000;
  });
  const handleDismissChecklist = useCallback(() => {
    localStorage.setItem(checklistStorageKey, '1');
    setChecklistDismissed(true);
  }, [checklistStorageKey]);
  const handleReopenChecklist = useCallback(() => {
    localStorage.removeItem(checklistStorageKey);
    setChecklistDismissed(false);
  }, [checklistStorageKey]);

  const handleSettingsSave = async (s) => {
    setSavingSettings(true);
    setSaveSettingsError(null);
    try {
      await saveSettings(s);
      onSettingsSave(s);
      setShowSettings(false);
      showToast('Settings saved.');
    } catch (err) {
      console.error('[Dashboard] settings save failed:', err);
      setSaveSettingsError('Something went wrong. Please try again.');
    } finally {
      setSavingSettings(false);
    }
  };

  const notifInflight = useRef(false);
  const refreshNotifs = useCallback(async () => {
    const token = currentPlayer?.sessionToken;
    if (!token || isOrgIdentity || notifInflight.current) return;
    notifInflight.current = true;
    try { await loadNotifications(token); }
    finally { notifInflight.current = false; }
  }, [currentPlayer?.sessionToken, isOrgIdentity, loadNotifications]);

  useEffect(() => {
    refreshNotifs();
    const interval = setInterval(refreshNotifs, 45000);
    window.addEventListener('focus', refreshNotifs);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', refreshNotifs);
    };
  }, [refreshNotifs]);

  const sport            = settings?.sport ?? '';
  const singlesOrDoubles = settings?.singlesOrDoubles ?? '';
  const SportIcon        = sport === 'tennis' ? TennisRacquetIcon : PickleballPaddleIcon;

  return (
    <div className="dashboard">
      {/* ── Top Bar ── */}
      <div className="dashboard-topbar">
        <div className="dashboard-brand">
          <span className="dashboard-sport-icon">
            <SportIcon size={22} color="currentColor" />
          </span>
          <div>
            {isOrgIdentity && onSwitchLeague ? (
              <LeagueSwitcher
                currentLeagueId={settings?.id}
                leagueName={settings.leagueName}
                onSwitch={onSwitchLeague}
                onBackToMyLeagues={onBackToMyLeagues}
              />
            ) : (
              <div className="dashboard-league-name">{settings.leagueName}</div>
            )}
            <div className="dashboard-meta">
              {sport.charAt(0).toUpperCase() + sport.slice(1)}{' '}
              ·{' '}
              {singlesOrDoubles.charAt(0).toUpperCase() + singlesOrDoubles.slice(1)}{' '}
              · Round {currentRoundNumber}/{settings.rounds}
              {settings.mode && (
                <span className="dashboard-mode-pill">
                  {settings.mode === 'ladder' ? 'Ladder' : 'Round Robin'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="dashboard-topbar-right">
          {isOrgIdentity && onBackToMyLeagues && (
            <button
              className="btn-sm"
              onClick={onBackToMyLeagues}
              title="Back to My Leagues"
              aria-label="Back to My Leagues"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span className="btn-sm-label">My Leagues</span>
              <span className="btn-sm-label-short" aria-hidden="true">Leagues</span>
            </button>
          )}

          {isAdmin && (
            <>
              {/* Hidden at ≤600px — moved to PlayerChip mobile menu */}
              <button
                className="btn-sm btn-topbar-desktop"
                onClick={() => setShowPlayers(true)}
                aria-label="Players"
                title="Players"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="btn-sm-label">Players</span>
              </button>
              {settings?.status === 'active' && (
                <button
                  className="btn-sm btn-topbar-desktop"
                  onClick={() => setShowSettings(true)}
                  title="League Settings"
                  aria-label="League Settings"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span className="btn-sm-label">Settings</span>
                </button>
              )}
            </>
          )}

          <NotificationBell />

          <PlayerChip
            onShowPlayers={isAdmin ? () => setShowPlayers(true) : null}
            onShowSettings={isAdmin && settings?.status === 'active' ? () => setShowSettings(true) : null}
            onShowGettingStarted={isOrgIdentity ? handleReopenChecklist : null}
          />

          {/* Hidden at ≤600px — theme control available in PlayerChip menu */}
          <span className="theme-toggle-wrap-desktop">
            <ThemeToggle />
          </span>
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

      {(settings?.status === 'ended' || settings?.status === 'archived') && (
        <div
          className={`dashboard-readonly-banner dashboard-readonly-banner-${settings.status}`}
          role="status"
        >
          <span>
            {settings.status === 'ended'
              ? 'This league has ended. Scores and standings are preserved but no new results can be submitted.'
              : 'This league is archived. It is read-only.'}
          </span>
        </div>
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
      <nav className="dashboard-nav" aria-label="Dashboard sections" role="tablist">
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
      <main id="main-content" className="dashboard-content" role="tabpanel" aria-live="polite">
        {/* Onboarding checklist — organizer only */}
        {isOrgIdentity && activeTab === 'standings' && (
          <OnboardingChecklist
            settings={settings}
            matches={matches}
            challenges={challenges}
            isDoubles={isDoubles}
            dismissed={checklistDismissed}
            onDismiss={handleDismissChecklist}
          />
        )}
        {activeTab === 'standings' && <StandingsTab />}
        {activeTab === 'schedule'  && <ScheduleTab />}
        {activeTab === 'stats'     && <StatsTab />}
      </main>
    </div>
  );
}

function DashboardInner({ onSettingsSave, onBackToMyLeagues, onSwitchLeague }) {
  const { currentPlayer, loading } = usePlayerIdentity();
  const { settings, loadingDb }    = useLeague();
  if (loading || loadingDb)
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <div className="loading-text">Loading league…</div>
      </div>
    );
  if (!currentPlayer)
    return <PlayerPicker leagueName={settings?.leagueName} sport={settings?.sport} />;
  return (
    <DashboardContent
      onSettingsSave={onSettingsSave}
      onBackToMyLeagues={onBackToMyLeagues}
      onSwitchLeague={onSwitchLeague}
    />
  );
}

function Dashboard({ settings, leagueData, onSettingsSave, onBackToMyLeagues, onSwitchLeague }) {
  return (
    <LeagueProvider settings={settings} initialLeagueData={leagueData}>
      <ErrorBoundary screen="dashboard" leagueId={settings?.id}>
        <DashboardInner
          onSettingsSave={onSettingsSave}
          onBackToMyLeagues={onBackToMyLeagues}
          onSwitchLeague={onSwitchLeague}
        />
      </ErrorBoundary>
    </LeagueProvider>
  );
}

export default Dashboard;
