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
  const [launchError, setLaunchError] = useState(null);
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
    setLaunchError(null);

    try {
      const dbLeague = await createLeague(finalSettings);
      const leagueId = dbLeague.id;
      const isDoubles = finalSettings.singlesOrDoubles === 'doubles';

      let dbParticipants;

      if (isDoubles) {
        const localTeams = generatedLeague.seededParticipants;

        // De-duplicate players across teams before inserting.
        // Each player has one local ID; the Map collapses any duplicates.
        const allLocalPlayers = Array.from(
          new Map(
            localTeams
              .flatMap((team) => team.players)
              .map((player) => [player.id, player]),
          ).values(),
        );

        const { idMap: playerIdMap } = await createPlayers(
          leagueId,
          allLocalPlayers.map((p) => ({ ...p, isAdmin: false })),
        );

        // Pre-generate team UUIDs client-side.
        // ladder.teams has a table-level grant, so explicit id is allowed.
        const teamIdMap = {};
        localTeams.forEach((t) => {
          teamIdMap[t.id] = crypto.randomUUID();
        });

        // Remap team objects: pre-generated UUIDs + DB player IDs.
        const remappedTeams = localTeams.map((team) => ({
          id: teamIdMap[team.id],
          players: team.players.map((p) => ({ ...p, id: playerIdMap[p.id] })),
        }));

        await createTeams(leagueId, remappedTeams);

        await createMatches(leagueId, generatedLeague.matches, true, teamIdMap);

        // Build dbTeams for rankings — all IDs already known, no DB call needed.
        const dbTeams = localTeams.map((team) => ({
          id: teamIdMap[team.id],
          players: team.players.map((p) => ({ ...p, id: playerIdMap[p.id] })),
        }));

        await saveInitialRankings(leagueId, dbTeams, true);
        dbParticipants = dbTeams;

      } else {
        const localPlayers = generatedLeague.seededParticipants;

        const { dbPlayers, idMap: playerIdMap } = await createPlayers(
          leagueId,
          localPlayers.map((p) => ({ ...p, isAdmin: false })),
        );

        await createMatches(leagueId, generatedLeague.matches, false, playerIdMap);

        await saveInitialRankings(leagueId, dbPlayers, false);
        dbParticipants = dbPlayers;
      }

      setActiveLeagueId(leagueId);
      setOrganizer(leagueId);
      setEffectiveSettings({ ...finalSettings, id: leagueId });
      setLeagueData({ ...generatedLeague, seededParticipants: dbParticipants });
      setScreen('codes');

    } catch (err) {
      console.error('[App] League launch failed:', err);
      setLaunchError(
        'We couldn’t create the league. Nothing was launched. Please try again.',
      );
    } finally {
      setLaunching(false);
    }
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
              onBack={() => { setScreen('setup1'); setLaunchError(null); }}
              externalLaunching={launching}
              launchError={launchError}
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
