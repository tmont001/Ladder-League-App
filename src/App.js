import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import LeagueSetupStep1 from './components/LeagueSetupStep1';
import LeagueSetupStep2 from './components/LeagueSetupStep2';
import LeagueSetupStep3 from './components/LeagueSetupStep3';

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
    setStep(4); // Dashboard — coming next
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
        <div
          style={{
            color: 'var(--cream)',
            fontFamily: 'DM Sans, sans-serif',
            textAlign: 'center',
            padding: '4rem 2rem',
          }}
        >
          <div
            style={{
              color: 'var(--lime)',
              fontFamily: 'Bebas Neue, sans-serif',
              fontSize: '2rem',
              letterSpacing: '0.08em',
            }}
          >
            {leagueSettings?.leagueName}
          </div>
          <p
            style={{
              marginTop: '0.75rem',
              color: 'var(--muted)',
              fontSize: '0.85rem',
            }}
          >
            {leagueData?.seededParticipants?.length} participants · Round 1 of{' '}
            {leagueSettings?.rounds} generated
          </p>
          <p
            style={{
              marginTop: '2rem',
              color: 'var(--muted)',
              fontSize: '0.8rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            Dashboard coming next
          </p>
          <button
            onClick={() => setStep(3)}
            style={{
              marginTop: '1.5rem',
              background: 'none',
              border: '1px solid var(--lime)',
              color: 'var(--lime)',
              padding: '0.5rem 1.2rem',
              cursor: 'pointer',
              borderRadius: '2px',
              fontFamily: 'DM Sans, sans-serif',
            }}
          >
            ← Back to Review
          </button>
        </div>
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
