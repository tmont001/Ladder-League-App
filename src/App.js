import React, { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import LeagueSetupStep1 from './components/LeagueSetupStep1';
import LeagueSetupStep2 from './components/LeagueSetupStep2';

function AppContent() {
  const [step, setStep] = useState(1);
  const [leagueSettings, setLeagueSettings] = useState(null);
  const [playerData, setPlayerData] = useState(null);

  const handleStep1Next = (settings) => {
    setLeagueSettings(settings);
    setStep(2);
  };

  const handleStep2Next = (data) => {
    setPlayerData(data);
    setStep(3);
    // Step 3 coming next
    console.log('Player data saved:', data);
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
        <div
          style={{
            color: 'var(--cream)',
            fontFamily: 'DM Sans, sans-serif',
            textAlign: 'center',
            marginTop: '4rem',
          }}
        >
          <h2>Step 3: Review &amp; Launch — Coming Soon</h2>
          <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>
            {playerData?.players?.length} players ready for{' '}
            <strong>{leagueSettings?.leagueName}</strong>
          </p>
          <button
            onClick={() => setStep(2)}
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
            ← Back
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
