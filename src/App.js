import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import LeagueSetupStep1 from './components/LeagueSetupStep1';
import LeagueSetupStep2 from './components/LeagueSetupStep2';
import LeagueSetupStep3 from './components/LeagueSetupStep3';
import Dashboard from './components/dashboard/Dashboard';

function AppContent() {
  const [step, setStep] = useState(1);
  const [leagueSettings, setLeagueSettings] = useState(null);
  const [playerData, setPlayerData] = useState(null);
  const [leagueData, setLeagueData] = useState(null);

  const handleStep1Next = (settings) => {
    setLeagueSettings(settings);
    setStep(2);
  };

  const handleStep2Next = (data) => {
    setPlayerData(data);
    setStep(3);
  };

  const handleLaunch = (generatedLeague) => {
    setLeagueData(generatedLeague);
    setStep(4);
  };

  return (
    <div className="app">
      {step === 1 && <LeagueSetupStep1 onNext={handleStep1Next} />}
      {step === 2 && (
        <LeagueSetupStep2
          settings={leagueSettings}
          onNext={handleStep2Next}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <LeagueSetupStep3
          settings={leagueSettings}
          playerData={playerData}
          onLaunch={handleLaunch}
          onBack={() => setStep(2)}
        />
      )}
      {step === 4 && (
        <Dashboard settings={leagueSettings} leagueData={leagueData} />
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
