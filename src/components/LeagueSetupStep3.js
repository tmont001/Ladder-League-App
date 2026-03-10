import React, { useState } from 'react';
import ThemeToggle from './shared/ThemeToggle';
import { TennisRacquetIcon, PickleballPaddleIcon } from './SportIcons';
import { generateLeague } from '../utils/matchGenerator';

// ─── Helpers ──────────────────────────────────────────────

const FORMAT_LABELS = {
  best_of_1: 'Best of 1',
  best_of_3: 'Best of 3',
  best_of_5: 'Best of 5',
};

function getSportIcon(sport, size = 16) {
  return sport === 'tennis' ? (
    <TennisRacquetIcon size={size} color="currentColor" />
  ) : (
    <PickleballPaddleIcon size={size} color="currentColor" />
  );
}

function getParticipantName(p, isDoubles) {
  return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
}

function getParticipantRating(p, isDoubles) {
  if (isDoubles) {
    const avg =
      p.players.reduce((s, pl) => s + parseFloat(pl.ustaRating), 0) /
      p.players.length;
    return avg.toFixed(1);
  }
  return p.ustaRating;
}

// ─── Settings Summary Card ────────────────────────────────

function SettingsSummary({ settings }) {
  const isDoubles = settings.singlesOrDoubles === 'doubles';

  const rows = [
    {
      label: 'Sport',
      value: (
        <span className="summary-sport-value">
          {getSportIcon(settings.sport, 14)}
          {settings.sport.charAt(0).toUpperCase() + settings.sport.slice(1)}
        </span>
      ),
    },
    {
      label: 'Format',
      value: `${isDoubles ? 'Doubles' : 'Singles'} · ${FORMAT_LABELS[settings.format]}`,
    },
    { label: 'Rounds', value: settings.rounds },
    { label: 'Challenge Window', value: `±${settings.challengeSpots} spots` },
    {
      label: 'Round Advance',
      value: settings.autoAdvance ? 'Auto + Manual' : 'Manual only',
    },
  ];

  return (
    <div className="summary-card">
      <div className="summary-card-title">League Settings</div>
      <div className="summary-rows">
        {rows.map((r) => (
          <div className="summary-row" key={r.label}>
            <span className="summary-row-label">{r.label}</span>
            <span className="summary-row-value">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Roster Preview ───────────────────────────────────────

function RosterPreview({ playerData, settings }) {
  const isDoubles = settings.singlesOrDoubles === 'doubles';
  const participants = isDoubles ? playerData.teams : playerData.players;
  const [expanded, setExpanded] = useState(false);

  const PREVIEW_LIMIT = 5;
  const shown = expanded ? participants : participants.slice(0, PREVIEW_LIMIT);
  const remaining = participants.length - PREVIEW_LIMIT;

  return (
    <div className="summary-card">
      <div className="summary-card-title">
        Roster
        <span className="label-count">{participants.length}</span>
      </div>
      <div className="roster-list">
        {shown.map((p, i) => (
          <div className="roster-row" key={p.id}>
            <span className="roster-seed">{i + 1}</span>
            <span className="roster-name">
              {getParticipantName(p, isDoubles)}
            </span>
            <span className="player-rating-badge">
              {getParticipantRating(p, isDoubles)}
            </span>
          </div>
        ))}
      </div>
      {!expanded && remaining > 0 && (
        <button className="btn-show-more" onClick={() => setExpanded(true)}>
          + {remaining} more
        </button>
      )}
      {expanded && participants.length > PREVIEW_LIMIT && (
        <button className="btn-show-more" onClick={() => setExpanded(false)}>
          Show less
        </button>
      )}
    </div>
  );
}

// ─── Round 1 Preview ──────────────────────────────────────

function Round1Preview({ rounds, isDoubles }) {
  if (!rounds || rounds.length === 0) return null;
  const round1 = rounds[0];

  return (
    <div className="summary-card">
      <div className="summary-card-title">Round 1 Matchups</div>
      <div className="matchup-list">
        {round1.matches.map((match, i) => (
          <div className="matchup-row" key={match.id}>
            <span className="matchup-num">{i + 1}</span>
            {match.isBye ? (
              <span className="matchup-bye">
                <span className="matchup-player">
                  {getParticipantName(match.p1, isDoubles)}
                </span>
                <span className="matchup-bye-badge">BYE</span>
              </span>
            ) : (
              <span className="matchup-vs">
                <span className="matchup-player">
                  {getParticipantName(match.p1, isDoubles)}
                </span>
                <span className="matchup-divider">vs</span>
                <span className="matchup-player">
                  {getParticipantName(match.p2, isDoubles)}
                </span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────

function LeagueSetupStep3({ settings, playerData, onLaunch, onBack }) {
  const isDoubles = settings.singlesOrDoubles === 'doubles';
  const [launching, setLaunching] = useState(false);

  // Pre-generate Round 1 preview (full generation happens on launch)
  const preview = React.useMemo(
    () => generateLeague(settings, playerData),
    [settings, playerData],
  );

  const handleLaunch = () => {
    setLaunching(true);
    // Small delay for the animation to feel intentional
    setTimeout(() => {
      const leagueData = generateLeague(settings, playerData);
      onLaunch(leagueData);
    }, 600);
  };

  return (
    <div className="wizard-card wizard-card-wide">
      <div className="card-accent" />

      {/* ── Header ── */}
      <div className="card-header">
        <div className="card-header-top">
          <div>
            <div className="brand">Ladder League</div>
            <div className="step-indicator">
              Step 3 of 3 — Review &amp; Launch
            </div>
          </div>
          <ThemeToggle />
        </div>
        <div className="step-dots">
          <div className="dot done" />
          <div className="dot done" />
          <div className="dot active" />
        </div>
      </div>

      <div className="card-body">
        {/* League name banner */}
        <div className="league-name-banner">
          <span className="league-name-sport-icon">
            {getSportIcon(settings.sport, 20)}
          </span>
          <span className="league-name-text">{settings.leagueName}</span>
        </div>

        {/* Two-column summary grid */}
        <div className="review-grid">
          <SettingsSummary settings={settings} />
          <RosterPreview playerData={playerData} settings={settings} />
        </div>

        {/* Round 1 preview */}
        <Round1Preview rounds={preview.rounds} isDoubles={isDoubles} />

        {/* Ready notice */}
        <div className="launch-notice">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Seeding is based on USTA rating. Matches are generated using
          round-robin scheduling. Challenges can be issued from the Schedule
          view after launch.
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="card-footer card-footer-two">
        <button className="btn-back" onClick={onBack} disabled={launching}>
          ← Back
        </button>
        <button
          className={`btn-next btn-launch ${launching ? 'btn-launching' : ''}`}
          onClick={handleLaunch}
          disabled={launching}
        >
          {launching ? (
            <>
              <span className="launch-spinner" />
              Generating League…
            </>
          ) : (
            '🚀 Launch League'
          )}
        </button>
      </div>
    </div>
  );
}

export default LeagueSetupStep3;
