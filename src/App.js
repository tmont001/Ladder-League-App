// src/App.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { PlayerIdentityProvider } from './context/PlayerIdentityContext';
import { ToastProvider, useToast } from './components/shared/ToastProvider';
import ErrorBoundary from './components/shared/ErrorBoundary';
import HomeScreen from './components/HomeScreen';
import PlayerJoinScreen from './components/PlayerJoinScreen';
import LeagueSetupStep1 from './components/LeagueSetupStep1';
import LeagueSetupStep2 from './components/LeagueSetupStep2';
import LaunchCodesScreen from './components/LaunchCodesScreen';
import Dashboard from './components/dashboard/Dashboard';
import OrganizerSignIn from './components/auth/OrganizerSignIn';
import MyLeagues from './components/MyLeagues';
import {
  createLeagueAtomic,
  fetchLeague,
} from './lib/db';
import { registerGlobalErrorHandlers } from './lib/reportError';
import { supabase } from './lib/supabase';
import { signOutOrganizer } from './lib/auth';
import {
  setActiveLeagueId,
  setOrganizer,
  getActiveLeagueId,
  isOrganizer,
  clearActiveLeague,
  clearOrganizer,
  setLastOrgLeagueId,
  clearLastOrgLeagueId,
} from './lib/session';

// Steps:
//   'home'        → Home screen (create or join)
//   'my-leagues'  → Organizer league picker (after Magic Link sign-in)
//   'join'        → Player code entry
//   'setup1'      → League settings
//   'setup2'      → Add players
//   'codes'       → Launch codes (organizer saves/shares)
//   'dashboard'   → Live dashboard

registerGlobalErrorHandlers();

function AppContent() {
  const { showToast } = useToast();
  const [screen, setScreen] = useState('home');
  const [leagueSettings, setLeagueSettings] = useState(null);
  const [leagueData, setLeagueData] = useState(null);
  const [playerCodes, setPlayerCodes] = useState(null);
  const [effectiveSettings, setEffectiveSettings] = useState(null);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState(null);
  // Player who joined via code (not the organizer)
  const [joinedPlayer, setJoinedPlayer] = useState(null);
  const [selectedSport, setSelectedSport] = useState('tennis');

  // ── Session restoration ───────────────────────────────────
  // Computed synchronously (lazy initializer) so the spinner renders on the
  // very first paint — no HomeScreen flash before the fetchLeague resolves.
  // Pathname is checked here too so that visiting `/` never shows a spinner
  // even when an active league remains in localStorage.
  const [restoring, setRestoring] = useState(() => {
    if (window.location.pathname !== '/dashboard') return false;
    const storedId = getActiveLeagueId();
    return !!storedId && !storedId.startsWith('local-');
  });
  const [restoreError, setRestoreError] = useState(null);

  // ── Organizer auth state ─────────────────────────────────
  // authLoading starts true and is cleared by INITIAL_SESSION.
  // The home screen is withheld until this resolves so the
  // "Create League" button doesn't flash before auth is known.
  const [organizerSession, setOrganizerSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  // Message shown on OrganizerSignIn after an unexpected session expiry.
  const [orgExpiredMessage, setOrgExpiredMessage] = useState(null);
  // Set to true during an intentional signOut so the SIGNED_OUT listener
  // knows not to treat it as an unexpected token expiry.
  const intentionalSignOutRef = useRef(false);
  // Mirrors effectiveSettings.id for use inside the auth listener closure,
  // which cannot read React state directly.
  const leagueIdForAuthRef = useRef(null);

  // Detect a failed Magic Link callback (expired, already used, etc.).
  // Supabase appends #error=access_denied&error_code=otp_expired to the
  // redirect URL. Check both hash and query string for portability.
  const [linkExpiredOrInvalid, setLinkExpiredOrInvalid] = useState(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    return !!(
      hashParams.get('error') ||
      hashParams.get('error_code') ||
      searchParams.get('error') ||
      searchParams.get('error_code')
    );
  });

  // Keep leagueIdForAuthRef in sync so the auth listener can clear the
  // per-league organizer flag even though it closes over an empty dep array.
  useEffect(() => {
    leagueIdForAuthRef.current = effectiveSettings?.id ?? null;
  }, [effectiveSettings]);

  // Clean error params from the URL and route to the sign-in screen
  // so the user can request a fresh link.
  useEffect(() => {
    if (!linkExpiredOrInvalid) return;
    window.history.replaceState({}, '', window.location.pathname);
    setScreen('organizer-signin');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // fromInitialSession=true: page reload. The restoration effect may already
    // be fetching a league — don't route to My Leagues over it.
    // fromInitialSession=false: fresh Magic Link sign-in — always route to
    // My Leagues unless a specific action was queued.
    const consumePending = (session, fromInitialSession) => {
      if (!session) return;
      const action = localStorage.getItem('ll_pending_action');
      if (action === 'create-league') {
        localStorage.removeItem('ll_pending_action');
        setScreen('setup1');
        return;
      }
      if (fromInitialSession) {
        // A restoration is in progress if we're on /dashboard with a stored league.
        const storedId = getActiveLeagueId();
        const isRestoring =
          window.location.pathname === '/dashboard' &&
          !!storedId &&
          !storedId.startsWith('local-');
        if (!isRestoring) setScreen('my-leagues');
      } else {
        // Fresh sign-in: always go to My Leagues.
        setScreen('my-leagues');
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') {
          setOrganizerSession(session ?? null);
          setAuthLoading(false);
          consumePending(session, true);
          return;
        }
        if (event === 'SIGNED_IN') {
          setOrganizerSession(session);
          setOrgExpiredMessage(null);
          setAuthLoading(false);
          consumePending(session, false);
          return;
        }
        if (event === 'SIGNED_OUT') {
          setOrganizerSession(null);
          setAuthLoading(false);
          if (!intentionalSignOutRef.current) {
            // Unexpected sign-out: refresh token expired or revoked.
            // Clear all organizer-specific local state and route to sign-in.
            const lid = leagueIdForAuthRef.current;
            if (lid) clearOrganizer(lid);
            clearActiveLeague();
            clearLastOrgLeagueId();
            setEffectiveSettings(null);
            setLeagueSettings(null);
            setLeagueData(null);
            setOrgExpiredMessage(
              'Your organizer session expired. Please sign in again.',
            );
            setScreen('organizer-signin');
          }
          return;
        }
        // TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY, or any future
        // event: clear the loading gate so the home screen is never stuck.
        setAuthLoading(false);
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (window.location.pathname !== '/dashboard') return;
    const storedId = getActiveLeagueId();
    if (!storedId || storedId.startsWith('local-')) return;
    fetchLeague(storedId)
      .then((settings) => {
        setEffectiveSettings(settings);
        setScreen('dashboard');
      })
      .catch(() => {
        clearActiveLeague();
        setRestoreError(
          'Your previous league could not be loaded. It may have been deleted.',
        );
      })
      .finally(() => setRestoring(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Create flow ──────────────────────────────────────────
  const handleStep1Next = (settings) => {
    setLeagueSettings(settings);
    setScreen('setup2');
  };

  const handleLaunch = async (generatedLeague, finalSettings) => {
    if (launching) return;
    setLaunching(true);
    setLaunchError(null);

    try {
      const isDoubles = finalSettings.singlesOrDoubles === 'doubles';
      let players, teams = [], seededOrder;

      if (isDoubles) {
        const localTeams = generatedLeague.seededParticipants;
        const allLocalPlayers = Array.from(
          new Map(
            localTeams.flatMap((t) => t.players).map((p) => [p.id, p]),
          ).values(),
        );
        players = allLocalPlayers.map((p) => ({
          local_id:    p.id,
          name:        p.name,
          rating:      p.rating      || null,
          rating_type: p.ratingType  || null,
          utr_url:     p.utrUrl      || null,
        }));
        teams = localTeams.map((t) => ({
          local_id:         t.id,
          player_local_ids: t.players.map((p) => p.id),
        }));
        seededOrder = localTeams.map((t) => t.id);
      } else {
        const localPlayers = generatedLeague.seededParticipants;
        players = localPlayers.map((p) => ({
          local_id:    p.id,
          name:        p.name,
          rating:      p.rating      || null,
          rating_type: p.ratingType  || null,
          utr_url:     p.utrUrl      || null,
        }));
        seededOrder = localPlayers.map((p) => p.id);
      }

      const matches = finalSettings.mode === 'ladder'
        ? []
        : (generatedLeague.matches || []).map((m) => ({
            local_p1_id:  m.p1?.id   ?? null,
            local_p2_id:  m.isBye ? null : (m.p2?.id ?? null),
            round_number: m.round,
            type:         m.type    || 'scheduled',
            is_bye:       m.isBye  || false,
          }));

      const { leagueId, playerCodes: codes } = await createLeagueAtomic(
        finalSettings, players, teams, matches, seededOrder,
      );

      setActiveLeagueId(leagueId);
      setOrganizer(leagueId);
      setLastOrgLeagueId(leagueId);
      setEffectiveSettings({ ...finalSettings, id: leagueId });
      setLeagueData(generatedLeague);
      setPlayerCodes(codes || []);
      setScreen('codes');
      showToast('League launched! Share the codes below.');

    } catch (err) {
      console.error('[App] League launch failed:', err);
      setLaunchError(
        err.message || "We couldn't create the league. Nothing was launched. Please try again.",
      );
    } finally {
      setLaunching(false);
    }
  };

  // ── Organizer create-league entry point ──────────────────
  const handleCreateLeagueClick = () => {
    if (organizerSession) {
      setScreen('setup1');
    } else {
      localStorage.setItem('ll_pending_action', 'create-league');
      setScreen('organizer-signin');
    }
  };

  const handleOrganizerSignOut = async () => {
    // Throws on failure — PlayerChip catches and shows a generic retry
    // message, keeping the user on their current screen.
    intentionalSignOutRef.current = true;
    try {
      await signOutOrganizer();
    } finally {
      intentionalSignOutRef.current = false;
    }
    const leagueId = effectiveSettings?.id;
    if (leagueId) clearOrganizer(leagueId);
    clearActiveLeague();
    clearLastOrgLeagueId();
    setOrganizerSession(null);
    setEffectiveSettings(null);
    setLeagueSettings(null);
    setLeagueData(null);
    setScreen('home');
  };

  // Called by components when an organizer RPC returns not_authenticated.
  // Supabase's session is already gone; sign out explicitly so Supabase
  // clears client-side tokens, mark the sign-out intentional to suppress
  // the SIGNED_OUT handler's expiry branch, then clean up and route to
  // the sign-in screen.
  const handleOrgSessionExpired = useCallback(async () => {
    intentionalSignOutRef.current = true;
    try {
      await signOutOrganizer();
    } catch {
      // Session may already be gone — ignore the error.
    } finally {
      intentionalSignOutRef.current = false;
    }
    const leagueId = effectiveSettings?.id;
    if (leagueId) clearOrganizer(leagueId);
    clearActiveLeague();
    clearLastOrgLeagueId();
    setOrganizerSession(null);
    setEffectiveSettings(null);
    setLeagueSettings(null);
    setLeagueData(null);
    setOrgExpiredMessage(
      'Your organizer session expired. Please sign in again.',
    );
    setScreen('organizer-signin');
  }, [effectiveSettings]);

  const handleOpenLeague = async (leagueId) => {
    try {
      const settings = await fetchLeague(leagueId);
      setActiveLeagueId(leagueId);
      setOrganizer(leagueId);
      setLastOrgLeagueId(leagueId);
      setEffectiveSettings(settings);
      setLeagueData(null);
      setScreen('dashboard');
      window.history.pushState({}, '', '/dashboard');
    } catch {
      // Stay on My Leagues; the card remains visible for retry.
    }
  };

  const handleBackToMyLeagues = () => {
    const leagueId = effectiveSettings?.id;
    if (leagueId) clearOrganizer(leagueId);
    clearActiveLeague();
    setEffectiveSettings(null);
    setLeagueData(null);
    setPlayerCodes(null);
    setScreen('my-leagues');
    window.history.pushState({}, '', '/');
  };

  // Called by MyLeagues after a successful duplicate-as-new-season launch.
  // Routes directly to the codes screen so the organizer can share tokens.
  const handleDuplicateLaunch = useCallback(({ leagueId, playerCodes: codes, settings }) => {
    setActiveLeagueId(leagueId);
    setOrganizer(leagueId);
    setLastOrgLeagueId(leagueId);
    setEffectiveSettings(settings ? { ...settings, id: leagueId } : { id: leagueId });
    setLeagueData(null);
    setPlayerCodes(codes || []);
    setScreen('codes');
    showToast('New season created! Share the codes below.');
  }, [showToast]);

  // ── Join flow ────────────────────────────────────────────
  const handleJoined = (player) => {
    setJoinedPlayer(player);
    // Build minimal settings from the player's league data
    setEffectiveSettings(player.leagueSettings || { id: player.leagueId });
    // Store the active league so the restoration effect can reload it on
    // refresh — mirrors what handleLaunch does for the organizer flow.
    setActiveLeagueId(player.leagueId);
    setScreen('dashboard');
    window.history.pushState({}, '', '/dashboard');
  };

  const activeSettings = effectiveSettings || leagueSettings;
  const activeSport = activeSettings?.sport || selectedSport;
  // Read organizer flag from localStorage so both the create flow and a
  // post-refresh restore correctly identify the organizer browser session.
  // isOrganizer() returns false for player sessions, fixing a bug where
  // joinedPlayer=null on refresh caused players to be treated as organizer.
  const isOrganizerSession = effectiveSettings?.id
    ? isOrganizer(effectiveSettings.id)
    : false;

  return (
    <ThemeProvider sport={activeSport}>
      <div className="app">
        <main id="main-content">
          {(restoring || authLoading) && (
            <div className="dashboard-loading">
              <div className="loading-spinner" />
              <div className="loading-text">
                {restoring ? 'Restoring your league…' : ' '}
              </div>
            </div>
          )}
          {restoreError && (
            <div className="error-boundary-fallback">
              <div className="error-boundary-message">{restoreError}</div>
              <button
                className="btn-next"
                onClick={() => {
                  clearActiveLeague();
                  setRestoreError(null);
                  window.history.pushState({}, '', '/');
                }}
              >
                Go Home
              </button>
            </div>
          )}
          {!restoring && !authLoading && !restoreError && screen === 'home' && (
            <HomeScreen
              onCreateLeague={handleCreateLeagueClick}
              onJoinLeague={() => setScreen('join')}
            />
          )}

          {screen === 'my-leagues' && organizerSession && (
            <MyLeagues
              onOpenLeague={handleOpenLeague}
              onCreateLeague={() => setScreen('setup1')}
              onSignOut={handleOrganizerSignOut}
              onSessionExpired={handleOrgSessionExpired}
              onDuplicateLaunch={handleDuplicateLaunch}
            />
          )}

          {screen === 'organizer-signin' && (
            <OrganizerSignIn
              onBack={() => {
                localStorage.removeItem('ll_pending_action');
                setLinkExpiredOrInvalid(false);
                setOrgExpiredMessage(null);
                setScreen('home');
              }}
              linkExpired={linkExpiredOrInvalid}
              sessionExpired={orgExpiredMessage}
            />
          )}

          {screen === 'join' && (
            <PlayerJoinScreen
              onJoined={handleJoined}
              onBack={() => setScreen('home')}
            />
          )}

          {screen === 'setup1' && (
            <LeagueSetupStep1
              onNext={handleStep1Next}
              initialSettings={leagueSettings}
              onBack={() => setScreen('home')}
              onSportChange={setSelectedSport}
            />
          )}

          {screen === 'setup2' && (
            <LeagueSetupStep2
              settings={leagueSettings}
              onLaunch={handleLaunch}
              onBack={() => { setScreen('setup1'); setLaunchError(null); }}
              externalLaunching={launching}
              launchError={launchError}
            />
          )}

          {screen === 'codes' && effectiveSettings?.id && (
            <LaunchCodesScreen
              leagueId={effectiveSettings?.id}
              leagueName={activeSettings?.leagueName}
              isDoubles={activeSettings?.singlesOrDoubles === 'doubles'}
              initialPlayerCodes={playerCodes}
              onEnterDashboard={() => {
                setPlayerCodes(null);
                setScreen('dashboard');
                window.history.pushState({}, '', '/dashboard');
              }}
            />
          )}

          {screen === 'dashboard' && (
            <PlayerIdentityProvider
              key={activeSettings?.id}
              leagueId={activeSettings?.id}
              isOrganizer={isOrganizerSession}
              initialPlayer={joinedPlayer}
              onOrganizerSignOut={handleOrganizerSignOut}
              onOrgSessionExpired={handleOrgSessionExpired}
            >
              <Dashboard
                settings={activeSettings}
                leagueData={leagueData}
                onSettingsSave={(updated) =>
                  setEffectiveSettings((prev) => ({ ...prev, ...updated }))
                }
                onBackToMyLeagues={
                  organizerSession ? handleBackToMyLeagues : undefined
                }
                onSwitchLeague={
                  organizerSession ? handleOpenLeague : undefined
                }
              />
            </PlayerIdentityProvider>
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}
function App() {
  const handleHome = () => {
    clearActiveLeague();
    window.location.replace('/');
  };
  return (
    <ErrorBoundary screen="app" onHome={handleHome}>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
