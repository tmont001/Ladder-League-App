// ─── matchGenerator.js ────────────────────────────────────
// Generates scheduled rounds for the ladder league.
// Participants are either players (singles) or teams (doubles).
// Seeding is based on USTA rating descending, then alphabetical.

function generateId() {
  return Math.random().toString(36).slice(2, 11);
}

/**
 * Sorts participants by USTA rating descending, then name ascending.
 * For teams, uses the average rating of the two players.
 */
function seedParticipants(participants, isDoubles) {
  return [...participants].sort((a, b) => {
    const ratingA = isDoubles
      ? a.players.reduce((s, p) => s + parseFloat(p.ustaRating), 0) /
        a.players.length
      : parseFloat(a.ustaRating);
    const ratingB = isDoubles
      ? b.players.reduce((s, p) => s + parseFloat(p.ustaRating), 0) /
        b.players.length
      : parseFloat(b.ustaRating);

    if (ratingB !== ratingA) return ratingB - ratingA;

    const nameA = isDoubles ? a.players[0].name : a.name;
    const nameB = isDoubles ? b.players[0].name : b.name;
    return nameA.localeCompare(nameB);
  });
}

/**
 * Round-robin scheduling using the "circle method".
 * Returns an array of rounds, each round being an array of matchup pairs [i, j]
 * where i and j are indices into the seeded participants array.
 * If odd number of participants, one gets a bye each round (index = -1).
 */
function buildRoundRobinSchedule(count) {
  const hasBye = count % 2 !== 0;
  const n = hasBye ? count + 1 : count; // pad to even
  const rounds = [];

  // Build a rotation list: [0, 1, 2, ..., n-1], fix position 0, rotate rest
  const positions = Array.from({ length: n }, (_, i) => i);

  for (let round = 0; round < n - 1; round++) {
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const home = positions[i];
      const away = positions[n - 1 - i];
      // Skip "bye" slot (last position when padded)
      if (hasBye && (home === count || away === count)) {
        // This is the bye match — record who gets the bye
        const byeParticipant = home === count ? away : home;
        pairs.push({ p1Index: byeParticipant, p2Index: -1, isBye: true });
      } else {
        pairs.push({ p1Index: home, p2Index: away, isBye: false });
      }
    }
    rounds.push(pairs);

    // Rotate: keep position[0] fixed, rotate the rest
    const last = positions[n - 1];
    for (let i = n - 1; i > 1; i--) {
      positions[i] = positions[i - 1];
    }
    positions[1] = last;
  }

  return rounds;
}

/**
 * Main export: generates all scheduled matches for the league.
 *
 * @param {Object} settings  - from LeagueSetupStep1
 * @param {Object} playerData - { players, teams } from LeagueSetupStep2
 * @returns {{ seededParticipants, rounds, matches }}
 */
export function generateLeague(settings, playerData) {
  const isDoubles = settings.singlesOrDoubles === 'doubles';
  const rawParticipants = isDoubles ? playerData.teams : playerData.players;
  const seededParticipants = seedParticipants(rawParticipants, isDoubles);

  const rrSchedule = buildRoundRobinSchedule(seededParticipants.length);

  // We only use as many rounds as the setting dictates
  const usedRounds = rrSchedule.slice(0, settings.rounds);

  const matches = [];
  const rounds = usedRounds.map((pairs, roundIndex) => {
    const roundMatches = pairs.map((pair) => {
      const match = {
        id: generateId(),
        round: roundIndex + 1,
        type: 'scheduled',
        isBye: pair.isBye,
        p1: seededParticipants[pair.p1Index],
        p2: pair.isBye ? null : seededParticipants[pair.p2Index],
        status: 'pending', // 'pending' | 'completed' | 'forfeit' | 'skipped'
        result: null, // filled in when score is entered
      };
      matches.push(match);
      return match;
    });

    return {
      roundNumber: roundIndex + 1,
      matches: roundMatches,
      isComplete: false,
    };
  });

  return { seededParticipants, rounds, matches };
}

/**
 * Derives standings from completed matches.
 * Primary: sets won. Secondary: games won. Tertiary: USTA rating.
 *
 * @param {Array} participants  - seeded participants array
 * @param {Array} matches       - all matches
 * @param {boolean} isDoubles
 * @returns {Array} sorted standings entries
 */
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
    return Number(b.ustaRating) - Number(a.ustaRating);
  });
}

/**
 * Checks whether all non-bye matches in a round are resolved.
 */
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
