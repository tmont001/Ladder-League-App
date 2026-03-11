// src/components/LaunchCodesScreen.js
// ─────────────────────────────────────────────────────────────
// Shown to the organizer immediately after launching a league.
// Lists every player's unique code so they can share them out,
// then lets the admin enter the dashboard without a player code.
// ─────────────────────────────────────────────────────────────

import React, { useState } from 'react';
import ThemeToggle from './shared/ThemeToggle';

function CopyButton({ text, label = 'Copy' }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button className="code-copy-btn" onClick={handle}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}

function PlayerCodeRow({ player, leagueUrl }) {
  const token = player.sessionToken || '—';
  const invite = `Hi ${player.name}! You've been added to ${player.leagueName || 'a Ladder League'}. Open ${leagueUrl} and enter your code: ${token}`;

  return (
    <div className="launch-code-row">
      <div className="launch-code-player">
        <span className="launch-code-name">{player.name}</span>
        {player.rating && (
          <span className="launch-code-rating">
            {player.ratingType || ''} {player.rating}
          </span>
        )}
      </div>
      <code className="launch-code-token">{token}</code>
      <div className="launch-code-actions">
        <CopyButton text={token} label="Copy code" />
        <CopyButton text={invite} label="Copy invite" />
      </div>
    </div>
  );
}

function LaunchCodesScreen({
  leagueName,
  participants,
  isDoubles,
  onEnterDashboard,
}) {
  const leagueUrl = window.location.href;

  const players = isDoubles
    ? participants.flatMap((t) => t.players)
    : participants;

  const allCodes = players
    .map((p) => `${p.name}: ${p.sessionToken || '—'}`)
    .join('\n');

  const allInvites = players
    .map(
      (p) =>
        `Hi ${p.name}! Open ${leagueUrl} and enter your code: ${p.sessionToken || '—'}`,
    )
    .join('\n\n');

  return (
    <div className="wizard-card wizard-card-wide">
      <div className="card-accent" />

      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">
              League Created — Share Player Codes
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="card-body">
        <div className="launch-codes-hero">
          <div className="launch-codes-check">✓</div>
          <div className="launch-codes-title">{leagueName} is live.</div>
          <div className="launch-codes-subtitle">
            Share each player's code with them so they can log in. Players open
            this URL and enter their code to access the league.
          </div>
          <div className="launch-codes-url">{leagueUrl}</div>
        </div>

        <div className="launch-codes-toolbar">
          <span className="launch-codes-count">{players.length} players</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <CopyButton text={allCodes} label="Copy all codes" />
            <CopyButton text={allInvites} label="Copy all invites" />
          </div>
        </div>

        <div className="launch-codes-list">
          {players.map((p) => (
            <PlayerCodeRow
              key={p.id}
              player={{ ...p, leagueName }}
              leagueUrl={leagueUrl}
            />
          ))}
        </div>

        <div className="launch-codes-tip">
          💡 Save these codes now — you can find them again anytime from the
          <strong> Players</strong> button in the dashboard.
        </div>
      </div>

      <div className="card-footer">
        <button className="btn-next btn-launch" onClick={onEnterDashboard}>
          Enter Dashboard →
        </button>
      </div>
    </div>
  );
}

export default LaunchCodesScreen;
