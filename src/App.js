// src/App.js
import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { PlayerIdentityProvider } from './context/PlayerIdentityContext';
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
//   1 → League settings
//   2 → Add players
//   3 → Launch codes screen (organizer saves/shares codes)
//   4 → Dashboard

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

  const handleLaunch = async (generatedLeague, finalSettings) => {
    setLaunching(true);
    try {
      // ── Persist to Supabase ────────────────────────────────
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

      // Mark this browser as the organizer for this league
      setActiveLeagueId(leagueId);
      setOrganizer(leagueId);

      setEffectiveSettings({ ...finalSettings, id: leagueId });
      setLeagueData({ ...generatedLeague, seededParticipants: dbPlayers });
    } catch (err) {
      // ── In-memory fallback (no DB) ─────────────────────────
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
    setStep(3); // → codes screen
  };

  const handleEnterDashboard = () => {
    setStep(4);
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

      {step === 3 && leagueData && (
        <LaunchCodesScreen
          leagueName={activeSettings?.leagueName}
          participants={leagueData.seededParticipants}
          isDoubles={activeSettings?.singlesOrDoubles === 'doubles'}
          onEnterDashboard={handleEnterDashboard}
        />
      )}

      {step === 4 && (
        // isOrganizer=true → Dashboard skips PlayerPicker, shows admin controls
        <PlayerIdentityProvider
          leagueId={activeSettings?.id}
          isOrganizer={true}
        >
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
