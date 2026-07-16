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
  fetchLeague,
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
  updateLeagueSettings,
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
  // Only hit Supabase for real UUIDs — local-* IDs mean we're running in-memory
  const isLive = leagueId && !String(leagueId).startsWith('local-');
  const [liveSettings, setLiveSettings] = useState(settings);
  const isDoubles = liveSettings?.singlesOrDoubles === 'doubles';

  // Keep liveSettings in sync when App.js updates effectiveSettings (e.g. after a save)
  useEffect(() => {
    setLiveSettings((prev) => ({ ...prev, ...settings }));
  }, [settings]);

  const [participants, setParticipants] = useState(
    initialLeagueData?.seededParticipants || [],
  );
  const [rawMatches, setRawMatches] = useState(
    initialLeagueData?.matches || [],
  );
  const [challenges, setChallenges] = useState([]);
  const [notifications, setNotifications] = useState([]);
  // Start in loading state when we have a live league but settings are incomplete
  // (e.g. player joined with minimal { id } settings before fetchLeague ran).
  // When settings.sport is already defined (organizer from create flow, or a
  // restoration that called fetchLeague first), we stay at false so DashboardContent
  // renders immediately without a spinner regression.
  const [loadingDb, setLoadingDb] = useState(isLive && !settings?.sport);

  // ── Load from DB ─────────────────────────────────────────
  // isDoubles is intentionally excluded from the dependency array: we determine
  // the doubles mode from fetchLeague inside load() to avoid a stale-closure issue
  // when a player rejoins after a page refresh with minimal settings.
  useEffect(() => {
    if (!isLive) return;
    setLoadingDb(true);
    async function load() {
      try {
        const leagueFromDb = await fetchLeague(leagueId);
        const isDbDoubles = leagueFromDb.singlesOrDoubles === 'doubles';
        const [dbPlayers, dbTeams, dbMatches, dbChallenges] = await Promise.all([
          fetchPlayers(leagueId),
          isDbDoubles ? fetchTeams(leagueId) : Promise.resolve([]),
          fetchMatches(leagueId),
          fetchChallenges(leagueId),
        ]);
        setLiveSettings((prev) => ({ ...prev, ...leagueFromDb }));
        setParticipants(isDbDoubles ? dbTeams : dbPlayers);
        setRawMatches(dbMatches);
        setChallenges(dbChallenges);
      } catch (err) {
        console.error('[LeagueContext] load error:', err.message);
      } finally {
        setLoadingDb(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, isLive]);

  // ── Real-time: matches ────────────────────────────────────
  useEffect(() => {
    if (!isLive) return;
    const ch = supabase
      .channel(`matches-${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'ladder',
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
  }, [leagueId, isLive]);

  // ── Real-time: challenges ─────────────────────────────────
  useEffect(() => {
    if (!isLive) return;
    const ch = supabase
      .channel(`challenges-${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'ladder',
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
  }, [leagueId, isLive]);

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
      if (isLive) {
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
    [isLive],
  );

  const confirmResult = useCallback(
    async (matchId, confirmedByPlayerId) => {
      if (isLive) {
        await confirmMatchResult(matchId, confirmedByPlayerId);
      } else {
        setRawMatches((prev) =>
          prev.map((m) =>
            m.id === matchId ? { ...m, status: 'confirmed' } : m,
          ),
        );
      }
    },
    [isLive],
  );

  const disputeResult = useCallback(
    async (matchId, openedByPlayerId, reason, counterScore) => {
      if (isLive) {
        await openDispute(matchId, openedByPlayerId, reason, counterScore);
      } else {
        setRawMatches((prev) =>
          prev.map((m) =>
            m.id === matchId ? { ...m, status: 'disputed' } : m,
          ),
        );
      }
    },
    [isLive],
  );

  const resolveMatch = useCallback(
    async (matchId) => {
      if (isLive) {
        await skipMatch(matchId);
      } else {
        setRawMatches((prev) =>
          prev.map((m) => (m.id === matchId ? { ...m, status: 'skipped' } : m)),
        );
      }
    },
    [isLive],
  );

  const saveSettings = useCallback(
    async (newSettings) => {
      if (!isLive) return;
      const patch = {
        name: newSettings.leagueName,
        format: newSettings.format,
        third_set_format: newSettings.thirdSetFormat,
        challenge_spots: Number(newSettings.challengeSpots),
        auto_advance: newSettings.autoAdvance,
      };
      await updateLeagueSettings(leagueId, patch);
    },
    [isLive, leagueId],
  );

  const addChallenge = useCallback(
    async (challengerParticipant, challengedParticipant) => {
      const noResponseDays = liveSettings?.challengeRules?.noResponseDays ?? 5;
      if (isLive) {
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
    [isLive, leagueId, currentRoundNumber, liveSettings],
  );

  // Add a scheduled match from messenger event proposals
  const addScheduledMatch = useCallback(
    async (p1Participant, p2Participant, eventDate) => {
      const m = {
        id: generateId(),
        round: currentRoundNumber,
        round_number: currentRoundNumber,
        type: 'scheduled',
        is_bye: false,
        isBye: false,
        p1: p1Participant,
        p2: p2Participant,
        p1_player_id: p1Participant?.id || null,
        p2_player_id: p2Participant?.id || null,
        status: 'pending',
        result: null,
        scheduledDate: eventDate || null,
      };
      if (isLive) {
        try {
          await createMatches(leagueId, [{ ...m }]);
        } catch {
          setRawMatches((prev) => [...prev, m]);
        }
      } else {
        setRawMatches((prev) => [...prev, m]);
      }
    },
    [isLive, leagueId, currentRoundNumber],
  );

  const loadNotifications = useCallback(
    async (playerId) => {
      if (!isLive || !playerId) return;
      const data = await fetchNotifications(playerId);
      setNotifications(data);
    },
    [isLive],
  );

  const readAllNotifications = useCallback(
    async (playerId) => {
      if (!isLive || !playerId) return;
      await markNotificationsRead(playerId);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    },
    [isLive],
  );

  return (
    <LeagueContext.Provider
      value={{
        settings: liveSettings,
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
        saveSettings,
        addChallenge,
        loadNotifications,
        readAllNotifications,
        addScheduledMatch,
      }}
    >
      {children}
    </LeagueContext.Provider>
  );
}

export function useLeague() {
  return useContext(LeagueContext);
}
