import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';
import { generateLeague } from '../utils/matchGenerator';
import { deriveStandings, isRoundComplete } from '../utils/standingsEngine';

const LeagueContext = createContext();

export function LeagueProvider({
  settings = { singlesOrDoubles: 'singles', rounds: 1 },
  initialLeagueData = { seededParticipants: [], rounds: [], matches: [] },
  children,
}) {
  const isDoubles = settings && settings.singlesOrDoubles === 'doubles';

  const [rounds, setRounds] = useState(initialLeagueData.rounds || []);
  const [matches, setMatches] = useState(initialLeagueData.matches || []);
  const [participants] = useState(initialLeagueData.seededParticipants || []);
  const [notifications, setNotifications] = useState([]);
  const [outboxEmails, setOutboxEmails] = useState([]);

  // ref to access latest outbox from interval closure
  const outboxRef = useRef(outboxEmails);
  useEffect(() => {
    outboxRef.current = outboxEmails;
  }, [outboxEmails]);

  // Flush outbox to backend periodically
  useEffect(() => {
    const intervalSec = parseInt(process.env.REACT_APP_OUTBOX_FLUSH_SECONDS || '30', 10);
    const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:4001';

    let stopped = false;

    const flushOnce = async () => {
      if (stopped) return;
      const pending = (outboxRef.current || []).slice();
      if (!pending.length) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;

      for (const item of pending) {
        try {
          const res = await fetch(`${apiBase}/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: item.to || [], subject: item.subject, body: item.body }),
          });
          if (res.ok) {
            // remove from outbox
            setOutboxEmails((prev) => prev.filter((e) => e.id !== item.id));
          }
        } catch (err) {
          // network error — keep in outbox and try later
        }
      }
    };

    // initial flush shortly after mount
    const initial = setTimeout(() => flushOnce(), 1500);
    const iv = setInterval(() => flushOnce(), Math.max(5000, intervalSec * 1000));

    return () => {
      stopped = true;
      clearTimeout(initial);
      clearInterval(iv);
    };
  }, [setOutboxEmails]);

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
    // record a simple in-memory notification and outbox email stub
    setNotifications((n) => [
      ...n,
      {
        id: `notif_${challengeMatch.id}`,
        type: 'challenge_created',
        matchId: challengeMatch.id,
        createdAt: new Date().toISOString(),
        payload: {
          challenger: challengeMatch.p1,
          challenged: challengeMatch.p2,
        },
      },
    ]);
    setOutboxEmails((o) => [
      ...o,
      {
        id: `email_${challengeMatch.id}`,
        to: [],
        subject: `New challenge: ${challengeMatch.p1.name} → ${challengeMatch.p2.name}`,
        body: `You have a new challenge from ${challengeMatch.p1.name}.`,
        createdAt: new Date().toISOString(),
      },
    ]);
  }, []);

  // Add an ad-hoc match to the current round
  const addMatch = useCallback((match) => {
    setMatches((prev) => [...prev, match]);
    setRounds((prev) =>
      prev.map((round) => {
        if (round.roundNumber !== match.round) return round;
        return { ...round, matches: [...round.matches, match] };
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
        notifications,
        outboxEmails,
        standings,
        currentRoundNumber,
        submitResult,
        resolveMatch,
        addChallenge,
        addMatch,
        setNotifications,
        setOutboxEmails,
      }}
    >
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
