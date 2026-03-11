// src/components/PlayerPicker.js
import React, { useState } from 'react';
import { usePlayerIdentity } from '../context/PlayerIdentityContext';
import ThemeToggle from './shared/ThemeToggle';

function PlayerPicker({ leagueName }) {
  const { loginWithToken } = usePlayerIdentity();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!token.trim()) return;
    setLoading(true);
    setError('');
    try {
      await loginWithToken(token.trim());
    } catch (err) {
      setError(err.message || 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="wizard-card">
      <div className="card-accent" />
      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">Who are you?</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="card-body">
        {leagueName && (
          <div
            className="league-name-banner"
            style={{ marginBottom: '1.5rem' }}
          >
            <span className="league-name-text">{leagueName}</span>
          </div>
        )}

        <div className="field-group">
          <label>Your Player Code</label>
          <input
            type="text"
            className="player-token-input"
            placeholder="Enter the code shared with you…"
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setError('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <div className="field-hint">
            Your league admin shared a unique code with you. Enter it here to
            access the league.
          </div>
        </div>

        {error && <div className="picker-error">⚠ {error}</div>}

        <div className="picker-help">
          <div className="picker-help-title">Don't have a code?</div>
          <div className="picker-help-body">
            Ask your league admin — they can find all player codes by clicking
            the
            <strong> Players</strong> button in the dashboard top bar.
          </div>
        </div>

        <div className="picker-help" style={{ marginTop: '0.5rem' }}>
          <div className="picker-help-title">Are you the league admin?</div>
          <div className="picker-help-body">
            Your player code was shown on the codes screen after launching the
            league, and is always visible in the <strong>Players</strong> panel
            in the dashboard. If you created the league on this device, try
            opening it in the same browser — you may still be logged in.
          </div>
        </div>
      </div>

      <div className="card-footer">
        <button
          className="btn-next"
          onClick={handleSubmit}
          disabled={!token.trim() || loading}
        >
          {loading ? 'Checking…' : 'Enter League →'}
        </button>
      </div>
    </div>
  );
}

export default PlayerPicker;
