import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import LeagueSetupStep1 from './components/LeagueSetupStep1';
import LeagueSetupStep2 from './components/LeagueSetupStep2';
import Dashboard from './components/dashboard/Dashboard';

function AppContent() {
  const [step, setStep] = useState(1);
  const [leagueSettings, setLeagueSettings] = useState(null);
  const [playerData, setPlayerData] = useState(null);
  const [leagueData, setLeagueData] = useState(null);
  const [effectiveSettings, setEffectiveSettings] = useState(null);

  const handleStep1Next = (settings) => {
    setLeagueSettings(settings);
    setStep(2);
  };

  // Step2 now calls onLaunch directly (no intermediate step3)
  const handleLaunch = (generatedLeague, finalSettings) => {
    setLeagueData(generatedLeague);
    setEffectiveSettings(finalSettings || leagueSettings);
    setStep(3);
  };

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
          initialData={playerData}
        />
      )}
      {step === 3 && (
        <Dashboard
          settings={effectiveSettings || leagueSettings}
          leagueData={leagueData}
        />
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
