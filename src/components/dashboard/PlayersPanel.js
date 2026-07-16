// src/components/dashboard/PlayersPanel.js
// Admin-only panel showing every player's session code.
// Loads codes via the get_player_codes RPC so that session_token
// is never present in the shared LeagueContext participants array.

import React, { useState, useEffect } from 'react';
import Portal from '../shared/Portal';
import { useLeague } from '../../context/LeagueContext';
import { fetchPlayerCodes } from '../../lib/db';

function CopyButton({ text, label = 'Copy', copiedLabel = '✓ Copied' }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button className="code-copy-btn" onClick={handleCopy}>
      {copied ? copiedLabel : label}
    </button>
  );
}

function PlayerCodeRow({ player, leagueUrl }) {
  const token = player.session_token || '—';
  const shareText = `Hi ${player.name}! Join ${leagueUrl} and enter your code: ${token}`;

  return (
    <div className="player-code-row">
      <div className="player-code-info">
        <div className="player-code-name">
          {player.name}
          {player.role === 'admin' && (
            <span className="player-code-admin-badge">Admin</span>
          )}
        </div>
      </div>

      <div className="player-code-token-wrap">
        <code className="player-code-token">{token}</code>
        <CopyButton text={token} label="Copy code" copiedLabel="✓ Code copied" />
      </div>

      <div className="player-code-share-wrap">
        <CopyButton
          text={shareText}
          label="Copy invite message"
          copiedLabel="✓ Invite copied"
        />
      </div>
    </div>
  );
}

function PlayersPanel({ onClose }) {
  const { settings } = useLeague();
  const leagueUrl = window.location.href;

  const leagueId = settings?.id;
  const isOffline = !leagueId || String(leagueId).startsWith('local-');

  const [playerCodes, setPlayerCodes] = useState([]);
  const [loadingCodes, setLoadingCodes] = useState(!isOffline);
  const [codesError, setCodesError] = useState(null);

  useEffect(() => {
    if (isOffline) return;
    fetchPlayerCodes(leagueId)
      .then(setPlayerCodes)
      .catch((err) => {
        console.warn('[PlayersPanel] failed to load codes:', err.message);
        setCodesError('Could not load player codes. Check your connection and try again.');
      })
      .finally(() => setLoadingCodes(false));
  }, [leagueId, isOffline]);

  return (
    <Portal>
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">Player Codes</div>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>

          <div className="modal-body">
            <div className="player-codes-explainer">
              Share each player's unique code with them. They'll enter it at{' '}
              <span className="player-codes-url">{leagueUrl}</span> to access
              their league account.
            </div>

            {isOffline ? (
              <div className="info-box" style={{ marginTop: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 3 }}>
                    Offline mode — codes unavailable
                  </div>
                  Player codes are only retrievable when connected to Supabase.
                </div>
              </div>
            ) : loadingCodes ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-muted)' }}>
                Loading codes…
              </div>
            ) : codesError ? (
              <div className="picker-error" role="alert">
                ⚠ {codesError}
              </div>
            ) : (
              <div className="player-codes-list">
                {playerCodes.map((player) => (
                  <PlayerCodeRow
                    key={player.id}
                    player={player}
                    leagueUrl={leagueUrl}
                  />
                ))}
              </div>
            )}

            <div className="player-codes-tip">
              💡 Tip: Use "Copy invite message" to send a ready-to-send text or
              email with the URL and code together.
            </div>
          </div>

          <div className="modal-footer">
            <button className="btn-next" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export default PlayersPanel;
