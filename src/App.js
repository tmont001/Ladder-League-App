// src/App.js
import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { PlayerIdentityProvider } from './context/PlayerIdentityContext';
import HomeScreen from './components/HomeScreen';
import PlayerJoinScreen from './components/PlayerJoinScreen';
import LeagueSetupStep1 from './components/LeagueSetupStep1';
import LeagueSetupStep2 from './components/LeagueSetupStep2';
import LaunchCodesScreen from './components/LaunchCodesScreen';
import Dashboard from './components/dashboard/Dashboard';
import {
  createLeague,
  createPlayers,
  createTeams,
  createMatches,
  saveInitialRankings,
} from './lib/db';
import { setActiveLeagueId, setOrganizer } from './lib/session';

// Steps:
//   'home'        → Home screen (create or join)
//   'join'        → Player code entry
//   'setup1'      → League settings
//   'setup2'      → Add players
//   'codes'       → Launch codes (organizer saves/shares)
//   'dashboard'   → Live dashboard

function AppContent() {
  const [screen, setScreen] = useState('home');
  const [leagueSettings, setLeagueSettings] = useState(null);
  const [leagueData, setLeagueData] = useState(null);
  const [effectiveSettings, setEffectiveSettings] = useState(null);
  const [launching, setLaunching] = useState(false);
  // Player who joined via code (not the organizer)
  const [joinedPlayer, setJoinedPlayer] = useState(null);
  const [selectedSport, setSelectedSport] = useState('tennis');

  // ── Create flow ──────────────────────────────────────────
  const handleStep1Next = (settings) => {
    setLeagueSettings(settings);
    setScreen('setup2');
  };

  const handleLaunch = async (generatedLeague, finalSettings) => {
    setLaunching(true);
    try {
      const dbLeague = await createLeague(finalSettings);
      const leagueId = dbLeague.id;

      const dbPlayers = await createPlayers(
        leagueId,
        generatedLeague.seededParticipants.map((p) => ({
          ...p,
          isAdmin: false,
        })),
      );

      if (
        finalSettings.singlesOrDoubles === 'doubles' &&
        generatedLeague.seededParticipants[0]?.players
      ) {
        await createTeams(leagueId, generatedLeague.seededParticipants);
      }

      await createMatches(
        leagueId,
        generatedLeague.matches.map((m) => ({
          ...m,
          p1_player_id: m.p1?.id || null,
          p2_player_id: m.p2?.id || null,
        })),
      );

      await saveInitialRankings(
        leagueId,
        dbPlayers,
        finalSettings.singlesOrDoubles === 'doubles',
      );

      setActiveLeagueId(leagueId);
      setOrganizer(leagueId);

      setEffectiveSettings({ ...finalSettings, id: leagueId });
      setLeagueData({ ...generatedLeague, seededParticipants: dbPlayers });
    } catch (err) {
      console.warn(
        '[App] Supabase unavailable, running in-memory:',
        err.message,
      );

      const participants = generatedLeague.seededParticipants.map((p) => ({
        ...p,
        sessionToken: p.sessionToken || `local-${p.id}`,
        role: 'player',
      }));

      setEffectiveSettings({ ...finalSettings, id: `local-${Date.now()}` });
      setLeagueData({ ...generatedLeague, seededParticipants: participants });
    }

    setLaunching(false);
    setScreen('codes');
  };

  // ── Join flow ────────────────────────────────────────────
  const handleJoined = (player) => {
    setJoinedPlayer(player);
    // Build minimal settings from the player's league data
    setEffectiveSettings(player.leagueSettings || { id: player.leagueId });
    setScreen('dashboard');
  };

  const activeSettings = effectiveSettings || leagueSettings;
  const activeSport = activeSettings?.sport || selectedSport;
  // Organizer: came through create flow. Player: came through join flow.
  const isOrganizerSession = screen === 'dashboard' && !joinedPlayer;

  return (
    <ThemeProvider sport={activeSport}>
      <div className="app">
        <main id="main-content">
          {screen === 'home' && (
            <HomeScreen
              onCreateLeague={() => setScreen('setup1')}
              onJoinLeague={() => setScreen('join')}
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
              onBack={() => setScreen('setup1')}
              externalLaunching={launching}
            />
          )}

          {screen === 'codes' && leagueData && (
            <LaunchCodesScreen
              leagueId={effectiveSettings?.id}
              leagueName={activeSettings?.leagueName}
              isDoubles={activeSettings?.singlesOrDoubles === 'doubles'}
              onEnterDashboard={() => setScreen('dashboard')}
            />
          )}

          {screen === 'dashboard' && (
            <PlayerIdentityProvider
              leagueId={activeSettings?.id}
              isOrganizer={isOrganizerSession}
              initialPlayer={joinedPlayer}
            >
              <Dashboard
                settings={activeSettings}
                leagueData={leagueData}
                onSettingsSave={(updated) =>
                  setEffectiveSettings((prev) => ({ ...prev, ...updated }))
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
  return <AppContent />;
}

export default App;
