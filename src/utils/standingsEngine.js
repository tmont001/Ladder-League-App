// Standings calculation moved out of matchGenerator for clarity and reuse
export function deriveStandings(participants, matches, isDoubles) {
  const stats = {};

  participants.forEach((p) => {
    stats[p.id] = {
      participant: p,
      matchesPlayed: 0,
      matchesWon: 0,
      matchesLost: 0,
      setsWon: 0,
      setsLost: 0,
      gamesWon: 0,
      gamesLost: 0,
      ustaRating: isDoubles
        ? p.players.reduce((s, pl) => s + parseFloat(pl.ustaRating), 0) /
          p.players.length
        : parseFloat(p.ustaRating),
    };
  });

  matches.forEach((match) => {
    if (match.status !== 'completed' || !match.result) return;
    const { winnerId, p1Sets, p2Sets, p1Games, p2Games } = match.result;

    const p1Id = match.p1.id;
    const p2Id = match.p2?.id;
    if (!p2Id) return; // bye

    if (stats[p1Id]) {
      stats[p1Id].matchesPlayed++;
      stats[p1Id].setsWon += p1Sets;
      stats[p1Id].setsLost += p2Sets;
      stats[p1Id].gamesWon += p1Games;
      stats[p1Id].gamesLost += p2Games;
      if (winnerId === p1Id) stats[p1Id].matchesWon++;
      else stats[p1Id].matchesLost++;
    }

    if (stats[p2Id]) {
      stats[p2Id].matchesPlayed++;
      stats[p2Id].setsWon += p2Sets;
      stats[p2Id].setsLost += p1Sets;
      stats[p2Id].gamesWon += p2Games;
      stats[p2Id].gamesLost += p1Games;
      if (winnerId === p2Id) stats[p2Id].matchesWon++;
      else stats[p2Id].matchesLost++;
    }
  });

  return Object.values(stats).sort((a, b) => {
    if (b.setsWon !== a.setsWon) return b.setsWon - a.setsWon;
    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
    // prefer ranking_score (new numeric ladder score) if available, then fall back to ustaRating
    const aRankScore = Number(a.participant.ranking_score || 0);
    const bRankScore = Number(b.participant.ranking_score || 0);
    if (bRankScore !== aRankScore) return bRankScore - aRankScore;
    return Number(b.ustaRating) - Number(a.ustaRating);
  });
}

export function isRoundComplete(round) {
  return round.matches
    .filter((m) => !m.isBye)
    .every(
      (m) =>
        m.status === 'completed' ||
        m.status === 'forfeit' ||
        m.status === 'skipped',
    );
}
