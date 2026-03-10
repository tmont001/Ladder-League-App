import React from 'react';
import { useLeague } from '../../context/LeagueContext';

function getParticipantName(p, isDoubles) {
  return isDoubles ? p.players.map((pl) => pl.name).join(' & ') : p.name;
}

function pct(wins, played) {
  if (played === 0) return '—';
  return `${Math.round((wins / played) * 100)}%`;
}

function StatBar({ value, max, color = 'var(--lime)' }) {
  const width = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="stat-bar-track">
      <div
        className="stat-bar-fill"
        style={{ width: `${width}%`, background: color }}
      />
    </div>
  );
}

function StatCard({ entry, rank, isDoubles, maxSets, maxGames, maxMatches }) {
  const p = entry.participant;
  const name = getParticipantName(p, isDoubles);
  const winPct = pct(entry.matchesWon, entry.matchesPlayed);
  const setsRatio = `${entry.setsWon}–${entry.setsLost}`;
  const gamesRatio = `${entry.gamesWon}–${entry.gamesLost}`;

  return (
    <div
      className="stat-card"
      style={{ animationDelay: `${(rank - 1) * 50}ms` }}
    >
      <div className="stat-card-header">
        <div className="stat-rank-name">
          <span className="stat-rank">#{rank}</span>
          <span className="stat-name">{name}</span>
        </div>
        <span className="stat-win-pct">{winPct}</span>
      </div>

      <div className="stat-rows">
        <div className="stat-row">
          <span className="stat-row-label">Matches</span>
          <span className="stat-row-value">
            {entry.matchesWon}W · {entry.matchesLost}L
          </span>
          <StatBar value={entry.matchesWon} max={maxMatches} />
        </div>
        <div className="stat-row">
          <span className="stat-row-label">Sets</span>
          <span className="stat-row-value">{setsRatio}</span>
          <StatBar value={entry.setsWon} max={maxSets} color="var(--gold)" />
        </div>
        <div className="stat-row">
          <span className="stat-row-label">Games</span>
          <span className="stat-row-value">{gamesRatio}</span>
          <StatBar value={entry.gamesWon} max={maxGames} color="var(--muted)" />
        </div>
      </div>
    </div>
  );
}

function StatsTab() {
  const { standings, isDoubles } = useLeague();

  if (standings.length === 0) {
    return (
      <div className="tab-empty">
        No stats yet. Complete some matches first.
      </div>
    );
  }

  const maxSets = Math.max(...standings.map((s) => s.setsWon), 1);
  const maxGames = Math.max(...standings.map((s) => s.gamesWon), 1);
  const maxMatches = Math.max(...standings.map((s) => s.matchesWon), 1);

  return (
    <div className="stats-wrapper">
      <div className="stats-grid">
        {standings.map((entry, i) => (
          <StatCard
            key={entry.participant.id}
            entry={entry}
            rank={i + 1}
            isDoubles={isDoubles}
            maxSets={maxSets}
            maxGames={maxGames}
            maxMatches={maxMatches}
          />
        ))}
      </div>
    </div>
  );
}

export default StatsTab;
