import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { generateLeague } from '../utils/matchGenerator';
import { deriveStandings, isRoundComplete } from '../utils/standingsEngine';

const LeagueContext = createContext();

export function LeagueProvider({ settings, initialLeagueData, children }) {
  const isDoubles = settings.singlesOrDoubles === 'doubles';

  const [rounds, setRounds] = useState(initialLeagueData.rounds);
  const [matches, setMatches] = useState(initialLeagueData.matches);
  const [participants] = useState(initialLeagueData.seededParticipants);

  // Derived standings — recomputed when participants/matches/isDoubles change
  const standings = useMemo(
    () => deriveStandings(participants, matches, isDoubles),
    [participants, matches, isDoubles],
  );

  // ── Submit a match result ────────────────────────────────
  const submitResult = useCallback((matchId, result) => {
    setMatches((prev) =>
      prev.map((m) => {
        if (m.id !== matchId) return m;
        return { ...m, status: 'completed', result };
      }),
    );

    setRounds((prev) =>
      prev.map((round) => {
        const updatedMatches = round.matches.map((m) => {
          if (m.id !== matchId) return m;
          return { ...m, status: 'completed', result };
        });
        const complete = isRoundComplete({ ...round, matches: updatedMatches });
        return { ...round, matches: updatedMatches, isComplete: complete };
      }),
    );
  }, []);

  // ── Mark a match as forfeit or skipped ──────────────────
  const resolveMatch = useCallback((matchId, status) => {
    setMatches((prev) =>
      prev.map((m) => (m.id === matchId ? { ...m, status } : m)),
    );
    setRounds((prev) =>
      prev.map((round) => {
        const updatedMatches = round.matches.map((m) =>
          m.id === matchId ? { ...m, status } : m,
        );
        const complete = isRoundComplete({ ...round, matches: updatedMatches });
        return { ...round, matches: updatedMatches, isComplete: complete };
      }),
    );
  }, []);

  // ── Add a challenge match ────────────────────────────────
  const addChallenge = useCallback((challengeMatch) => {
    setMatches((prev) => [...prev, challengeMatch]);
    setRounds((prev) =>
      prev.map((round) => {
        if (round.roundNumber !== challengeMatch.round) return round;
        return { ...round, matches: [...round.matches, challengeMatch] };
      }),
    );
  }, []);

  // ── Advance to next round (manual trigger) ───────────────
  const idx = rounds.findIndex((r) => !r.isComplete);
  const currentRoundNumber = idx === -1 ? rounds.length : idx + 1;

  return (
    <LeagueContext.Provider
      value={{
        settings,
        isDoubles,
        participants,
        rounds,
        matches,
        standings,
        currentRoundNumber,
        submitResult,
        resolveMatch,
        addChallenge,
      }}
    >
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
