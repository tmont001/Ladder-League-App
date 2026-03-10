// src/App.js
import React, { useState, useEffect } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { PlayerIdentityProvider } from './context/PlayerIdentityContext';
import LeagueSetupStep1 from './components/LeagueSetupStep1';
import LeagueSetupStep2 from './components/LeagueSetupStep2';
import Dashboard from './components/dashboard/Dashboard';
import PlayerPicker from './components/PlayerPicker';
import {
  createLeague,
  createPlayers,
  createTeams,
  createMatches,
  saveInitialRankings,
} from './lib/db';
import { getActiveLeagueId, setActiveLeagueId, fetchLeague } from './lib/db';
import { fetchLeague as dbFetchLeague } from './lib/db';
import { getStoredToken } from './lib/session';

function AppContent() {
  const [step, setStep] = useState(1);
  const [leagueSettings, setLeagueSettings] = useState(null);
  const [leagueData, setLeagueData] = useState(null);
  const [effectiveSettings, setEffectiveSettings] = useState(null);
  const [launching, setLaunching] = useState(false);

  const handleStep1Next = (settings) => {
    setLeagueSettings(settings);
    setStep(2);
  };

  // Called by Step2 when the user confirms launch
  const handleLaunch = async (generatedLeague, finalSettings) => {
    setLaunching(true);
    try {
      // 1. Persist league to DB
      const dbLeague = await createLeague(finalSettings);
      const leagueId = dbLeague.id;

      // 2. Persist players (first player created is admin)
      const players = generatedLeague.seededParticipants;
      const dbPlayers = await createPlayers(
        leagueId,
        players.map((p, i) => ({ ...p, isAdmin: i === 0 })),
      );

      // 3. If doubles, persist teams
      let dbTeams = [];
      if (
        finalSettings.singlesOrDoubles === 'doubles' &&
        generatedLeague.seededParticipants[0]?.players
      ) {
        dbTeams = await createTeams(
          leagueId,
          generatedLeague.seededParticipants,
        );
      }

      // 4. Persist matches
      const matchRows = generatedLeague.matches.map((m) => ({
        ...m,
        p1_player_id: m.p1?.id || null,
        p2_player_id: m.p2?.id || null,
      }));
      await createMatches(leagueId, matchRows);

      // 5. Save initial rankings
      await saveInitialRankings(
        leagueId,
        dbPlayers,
        finalSettings.singlesOrDoubles === 'doubles',
      );

      // 6. Save active league to localStorage
      setActiveLeagueId(leagueId);

      const settingsWithId = { ...finalSettings, id: leagueId };
      setEffectiveSettings(settingsWithId);
      setLeagueData({ ...generatedLeague, seededParticipants: dbPlayers });
      setStep(3);
    } catch (err) {
      console.error('[App] launch error:', err.message);
      // Fallback: run in-memory without DB
      setEffectiveSettings(finalSettings);
      setLeagueData(generatedLeague);
      setStep(3);
    } finally {
      setLaunching(false);
    }
  };

  const activeSettings = effectiveSettings || leagueSettings;

  return (
    <div className="app">
      {step === 1 && (
        <LeagueSetupStep1
          onNext={handleStep1Next}
          initialSettings={leagueSettings}
        />
      )}
      {step === 2 && (
        <LeagueSetupStep2
          settings={leagueSettings}
          onLaunch={handleLaunch}
          onBack={() => setStep(1)}
          externalLaunching={launching}
        />
      )}
      {step === 3 && (
        <PlayerIdentityProvider leagueId={activeSettings?.id}>
          <Dashboard settings={activeSettings} leagueData={leagueData} />
        </PlayerIdentityProvider>
      )}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
