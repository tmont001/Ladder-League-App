import React from 'react';
import { useLeague } from '../../context/LeagueContext';
import { getParticipantName } from '../../utils/participants';

function getParticipantRating(p, isDoubles) {
  if (isDoubles) {
    const avg =
      p.players.reduce((s, pl) => s + parseFloat(pl.ustaRating), 0) /
      p.players.length;
    return avg.toFixed(1);
  }
  return p.ustaRating;
}

function getRankBadgeClass(rank) {
  if (rank === 1) return 'rank-badge rank-gold';
  if (rank === 2) return 'rank-badge rank-silver';
  if (rank === 3) return 'rank-badge rank-bronze';
  return 'rank-badge';
}

function StandingsTab({ onChallenge = () => {}, onEnterScore = () => {} }) {
  const { standings, isDoubles, settings } = useLeague();

  if (standings.length === 0) {
    return (
      <div className="tab-empty">
        No standings yet. Complete some matches to see rankings.
      </div>
    );
  }

  return (
    <div className="standings-wrapper">
      <div className="standings-table">
        {/* Header */}
        <div className="standings-header">
          <div className="col-rank">#</div>
          <div className="col-name">Player{isDoubles ? ' / Team' : ''}</div>
          <div className="col-rating">Rating</div>
          <div className="col-stat">W</div>
          <div className="col-stat">L</div>
          <div className="col-stat">Sets W</div>
          <div className="col-stat">Sets L</div>
          <div className="col-stat">Games W</div>
          <div className="col-stat">Games L</div>
          <div className="col-actions" />
        </div>

        {/* Rows */}
        {standings.map((entry, i) => {
          const rank = i + 1;
          const p = entry.participant;
          const hasPlayed = entry.matchesPlayed > 0;

          return (
            <div
              key={p.id}
              className={`standings-row ${rank <= 3 ? 'standings-row-top' : ''} ${rank === 1 ? 'standings-row-first' : ''}`}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="col-rank">
                <span className={getRankBadgeClass(rank)}>{rank}</span>
              </div>
              <div className="col-name">
                <span className="standings-name">
                  {getParticipantName(p, isDoubles)}
                </span>
                {isDoubles && (
                  <span className="standings-doubles-names">
                    {p.players.map((pl) => pl.name).join(' · ')}
                  </span>
                )}
              </div>
              <div className="col-rating">
                <span className="player-rating-badge">
                  {getParticipantRating(p, isDoubles)}
                </span>
              </div>
              <div className="col-stat stat-highlight">{entry.matchesWon}</div>
              <div className="col-stat">{entry.matchesLost}</div>
              <div className="col-stat stat-highlight">{entry.setsWon}</div>
              <div className="col-stat">{entry.setsLost}</div>
              <div className="col-stat stat-highlight">{entry.gamesWon}</div>
              <div className="col-stat">{entry.gamesLost}</div>
              <div className="col-actions">
                {(() => {
                  let defaultTarget = null;
                  if (i > 0) {
                    const maxLookup = Math.max(
                      0,
                      i - (settings.challengeSpots || 0),
                    );
                    for (let j = i - 1; j >= maxLookup; j--) {
                      const candidate =
                        standings[j] && standings[j].participant;
                      if (candidate) {
                        defaultTarget = candidate.id;
                        break;
                      }
                    }
                  }

                  return (
                    <button
                      className="btn-small"
                      onClick={() => onChallenge(p.id, defaultTarget)}
                    >
                      Challenge
                    </button>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      <div className="standings-legend">
        Ranked by Sets Won · tiebreak: Games Won · then USTA Rating
      </div>
    </div>
  );
}

export default StandingsTab;
