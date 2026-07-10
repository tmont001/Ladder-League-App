import React, { useState } from 'react';
import ThemeToggle from './shared/ThemeToggle';
import { fetchPlayerByToken } from '../lib/db';
import { storeToken } from '../lib/session';

// Clear any stale local-mode tokens from a previous offline session
function purgeLocalTokens() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('ll_session_')) {
      const val = localStorage.getItem(key);
      if (val?.startsWith('local-')) keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  return keysToRemove.length;
}

function PlayerJoinScreen({ onJoined, onBack }) {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;

    // Clear any stale local-mode tokens first
    purgeLocalTokens();

    // Reject local tokens immediately — they're from offline mode
    if (trimmed.startsWith('local-')) {
      setError(
        "This code is from an offline test session and won't work here. Ask your league admin for a real code from a Supabase-connected league.",
      );
      return;
    }

    setLoading(true);
    setError('');
    try {
      const player = await fetchPlayerByToken(trimmed);
      if (!player)
        throw new Error('Code not found. Double-check the code and try again.');
      storeToken(player.leagueId, trimmed);
      onJoined(player);
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
            <div className="step-indicator">Join Your League</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="card-body">
        <div className="field-group">
          <label htmlFor="player-token">Your Player Code</label>
          <input
            id="player-token"
            type="text"
            className="player-token-input"
            placeholder="e.g. a3kx9mzp1qrt"
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
            Your league admin shared a unique 12-character code with you after
            creating the league.
          </div>
        </div>

        {error && (
          <div className="picker-error" role="alert">
            ⚠ {error}
          </div>
        )}

        <div className="info-box">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 3 }}>
              Don't have a code?
            </div>
            Ask your league admin — they can find all player codes in the
            dashboard under the <strong>Players</strong> button.
          </div>
        </div>
      </div>

      <div className="card-footer card-footer-two">
        <button className="btn-back" onClick={onBack}>
          ← Back
        </button>
        <button
          className="btn-next"
          onClick={handleSubmit}
          disabled={!token.trim() || loading}
          style={{ flex: 1 }}
        >
          {loading ? 'Checking…' : 'Enter League →'}
        </button>
      </div>
    </div>
  );
}

export default PlayerJoinScreen;
