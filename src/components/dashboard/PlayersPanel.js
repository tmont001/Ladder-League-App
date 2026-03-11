// src/components/dashboard/PlayersPanel.js
// Admin-only panel showing every player's session code so the
// admin can copy and share them via text or email.

import Portal from '../shared/Portal';
import React, { useState } from 'react';
import { useLeague } from '../../context/LeagueContext';

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button className="code-copy-btn" onClick={handleCopy}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

function PlayerCodeRow({ player, leagueUrl }) {
  const shareText = `Hi ${player.name}! Join ${leagueUrl} and enter your code: ${player.sessionToken}`;

  return (
    <div className="player-code-row">
      <div className="player-code-info">
        <div className="player-code-name">
          {player.name}
          {player.role === 'admin' && (
            <span className="player-code-admin-badge">Admin</span>
          )}
        </div>
        {player.rating && (
          <div className="player-code-rating">
            {player.ratingType || 'Rating'} {player.rating}
          </div>
        )}
      </div>

      <div className="player-code-token-wrap">
        <code className="player-code-token">{player.sessionToken}</code>
        <CopyButton text={player.sessionToken} />
      </div>

      <div className="player-code-share-wrap">
        <CopyButton text={shareText} />
        <span className="player-code-share-label">Copy invite message</span>
      </div>
    </div>
  );
}

function PlayersPanel({ onClose }) {
  const { participants, isDoubles } = useLeague();
  const leagueUrl = window.location.href;

  // In doubles mode participants are teams — get the individual players
  const players = isDoubles
    ? participants.flatMap((t) => t.players)
    : participants;

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

            <div className="player-codes-list">
              {players.map((player) => (
                <PlayerCodeRow
                  key={player.id}
                  player={player}
                  leagueUrl={leagueUrl}
                />
              ))}
            </div>

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
