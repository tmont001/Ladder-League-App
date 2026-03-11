// src/context/LeagueContext.js
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { supabase } from '../lib/supabase';
import {
  fetchMatches,
  fetchPlayers,
  fetchTeams,
  submitMatchResult,
  confirmMatchResult,
  openDispute,
  skipMatch,
  createMatches,
  createChallenge,
  acceptChallenge,
  fetchChallenges,
  fetchNotifications,
  markNotificationsRead,
} from '../lib/db';
import { deriveStandings, isRoundComplete } from '../utils/matchGenerator';

const LeagueContext = createContext();

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// Rebuild rounds[] from flat matches array
function buildRoundsFromMatches(matches, participants, isDoubles) {
  const roundMap = {};
  matches.forEach((m) => {
    const rn = m.round_number || m.round || 1;
    if (!roundMap[rn]) roundMap[rn] = [];
    roundMap[rn].push(hydrateMatch(m, participants, isDoubles));
  });
  return Object.keys(roundMap)
    .sort((a, b) => Number(a) - Number(b))
    .map((rn) => {
      const roundMatches = roundMap[rn];
      return {
        roundNumber: Number(rn),
        matches: roundMatches,
        isComplete: isRoundComplete({ matches: roundMatches }),
      };
    });
}

// DB match row → UI shape
function hydrateMatch(dbMatch, participants, isDoubles) {
  const find = (id) => {
    if (!id) return null;
    return participants.find((p) => p.id === id) || null;
  };
  const p1Id = isDoubles ? dbMatch.p1_team_id : dbMatch.p1_player_id;
  const p2Id = isDoubles ? dbMatch.p2_team_id : dbMatch.p2_player_id;
  return {
    id: dbMatch.id,
    round: dbMatch.round_number || dbMatch.round || 1,
    type: dbMatch.type || 'scheduled',
    isBye: dbMatch.is_bye || false,
    p1: find(p1Id) || dbMatch.p1 || null,
    p2: find(p2Id) || dbMatch.p2 || null,
    status: dbMatch.status || 'pending',
    result: dbMatch.result || null,
    submittedBy: dbMatch.submitted_by || null,
    submittedAt: dbMatch.submitted_at || null,
    autoConfirmAfter: dbMatch.auto_confirm_after || null,
  };
}

export function LeagueProvider({ settings, initialLeagueData, children }) {
  const leagueId = settings?.id;
  const isDoubles = settings?.singlesOrDoubles === 'doubles';

  const [participants, setParticipants] = useState(
    initialLeagueData?.seededParticipants || [],
  );
  const [rawMatches, setRawMatches] = useState(
    initialLeagueData?.matches || [],
  );
  const [challenges, setChallenges] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loadingDb, setLoadingDb] = useState(!!leagueId);

  // ── Load from DB ─────────────────────────────────────────
  useEffect(() => {
    if (!leagueId) {
      setLoadingDb(false);
      return;
    }
    async function load() {
      try {
        const [dbPlayers, dbTeams, dbMatches, dbChallenges] = await Promise.all(
          [
            fetchPlayers(leagueId),
            isDoubles ? fetchTeams(leagueId) : Promise.resolve([]),
            fetchMatches(leagueId),
            fetchChallenges(leagueId),
          ],
        );
        setParticipants(isDoubles ? dbTeams : dbPlayers);
        setRawMatches(dbMatches);
        setChallenges(dbChallenges);
      } catch (err) {
        console.error('[LeagueContext] load error:', err.message);
      } finally {
        setLoadingDb(false);
      }
    }
    load();
  }, [leagueId, isDoubles]);

  // ── Real-time: matches ────────────────────────────────────
  useEffect(() => {
    if (!leagueId) return;
    const ch = supabase
      .channel(`matches-${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'matches',
          filter: `league_id=eq.${leagueId}`,
        },
        ({ eventType, new: n, old: o }) => {
          setRawMatches((prev) => {
            if (eventType === 'INSERT') return [...prev, n];
            if (eventType === 'UPDATE')
              return prev.map((m) => (m.id === n.id ? n : m));
            if (eventType === 'DELETE')
              return prev.filter((m) => m.id !== o.id);
            return prev;
          });
        },
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [leagueId]);

  // ── Real-time: challenges ─────────────────────────────────
  useEffect(() => {
    if (!leagueId) return;
    const ch = supabase
      .channel(`challenges-${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenges',
          filter: `league_id=eq.${leagueId}`,
        },
        ({ eventType, new: n }) => {
          setChallenges((prev) => {
            if (eventType === 'INSERT') return [n, ...prev];
            if (eventType === 'UPDATE')
              return prev.map((c) => (c.id === n.id ? n : c));
            return prev;
          });
        },
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [leagueId]);

  // ── Derived ───────────────────────────────────────────────
  const hydratedMatches = useMemo(
    () => rawMatches.map((m) => hydrateMatch(m, participants, isDoubles)),
    [rawMatches, participants, isDoubles],
  );

  const rounds = useMemo(
    () => buildRoundsFromMatches(rawMatches, participants, isDoubles),
    [rawMatches, participants, isDoubles],
  );

  const standings = useMemo(
    () => deriveStandings(participants, hydratedMatches, isDoubles),
    [participants, hydratedMatches, isDoubles],
  );

  const currentRoundNumber = useMemo(
    () => rounds.findIndex((r) => !r.isComplete) + 1 || rounds.length || 1,
    [rounds],
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  // ── Actions ───────────────────────────────────────────────

  const submitResult = useCallback(
    async (matchId, result, submittedByPlayerId) => {
      if (leagueId) {
        await submitMatchResult(matchId, result, submittedByPlayerId);
      } else {
        setRawMatches((prev) =>
          prev.map((m) =>
            m.id === matchId
              ? {
                  ...m,
                  status: 'awaiting_confirmation',
                  result,
                  submitted_by: submittedByPlayerId,
                }
              : m,
          ),
        );
      }
    },
    [leagueId],
  );

  const confirmResult = useCallback(
    async (matchId, confirmedByPlayerId) => {
      if (leagueId) {
        await confirmMatchResult(matchId, confirmedByPlayerId);
      } else {
        setRawMatches((prev) =>
          prev.map((m) =>
            m.id === matchId ? { ...m, status: 'confirmed' } : m,
          ),
        );
      }
    },
    [leagueId],
  );

  const disputeResult = useCallback(
    async (matchId, openedByPlayerId, reason, counterScore) => {
      if (leagueId) {
        await openDispute(matchId, openedByPlayerId, reason, counterScore);
      } else {
        setRawMatches((prev) =>
          prev.map((m) =>
            m.id === matchId ? { ...m, status: 'disputed' } : m,
          ),
        );
      }
    },
    [leagueId],
  );

  const resolveMatch = useCallback(
    async (matchId) => {
      if (leagueId) {
        await skipMatch(matchId);
      } else {
        setRawMatches((prev) =>
          prev.map((m) => (m.id === matchId ? { ...m, status: 'skipped' } : m)),
        );
      }
    },
    [leagueId],
  );

  const addChallenge = useCallback(
    async (challengerParticipant, challengedParticipant) => {
      const noResponseDays = settings?.challengeRules?.noResponseDays ?? 5;
      if (leagueId) {
        const challenge = await createChallenge(
          leagueId,
          challengerParticipant,
          challengedParticipant,
          noResponseDays,
        );
        const matchRows = [
          {
            round: currentRoundNumber,
            round_number: currentRoundNumber,
            type: 'challenge',
            isBye: false,
            is_bye: false,
            p1_player_id: challengerParticipant.id,
            p2_player_id: challengedParticipant.id,
            status: 'pending',
            result: null,
          },
        ];
        const [matchRow] = await createMatches(leagueId, matchRows);
        await acceptChallenge(challenge.id, matchRow.id);
      } else {
        const m = {
          id: generateId(),
          round: currentRoundNumber,
          round_number: currentRoundNumber,
          type: 'challenge',
          is_bye: false,
          isBye: false,
          p1: challengerParticipant,
          p2: challengedParticipant,
          p1_player_id: challengerParticipant.id,
          p2_player_id: challengedParticipant.id,
          status: 'pending',
          result: null,
        };
        setRawMatches((prev) => [...prev, m]);
      }
    },
    [leagueId, currentRoundNumber, settings],
  );

  const loadNotifications = useCallback(
    async (playerId) => {
      if (!leagueId || !playerId) return;
      const data = await fetchNotifications(playerId);
      setNotifications(data);
    },
    [leagueId],
  );

  const readAllNotifications = useCallback(
    async (playerId) => {
      if (!leagueId || !playerId) return;
      await markNotificationsRead(playerId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    },
    [leagueId],
  );

  return (
    <LeagueContext.Provider
      value={{
        settings,
        isDoubles,
        participants,
        rounds,
        matches: hydratedMatches,
        standings,
        challenges,
        notifications,
        unreadCount,
        currentRoundNumber,
        loadingDb,
        submitResult,
        confirmResult,
        disputeResult,
        resolveMatch,
        addChallenge,
        loadNotifications,
        readAllNotifications,
      }}
    >
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
