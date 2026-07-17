import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { fetchPlayerByToken } from '../lib/db';
import {
  getStoredToken,
  storeToken,
  clearToken,
  isOrganizer,
} from '../lib/session';

const PlayerIdentityContext = createContext();

const ORGANIZER_IDENTITY = {
  id: '__organizer__',
  name: 'Organizer',
  role: 'admin',
  sessionToken: null,
};

export function PlayerIdentityProvider({
  leagueId,
  isOrganizer: isOrgProp,
  initialPlayer,
  onOrganizerSignOut,
  children,
}) {
  const orgFromStorage = leagueId ? isOrganizer(leagueId) : false;
  const startAsOrg = isOrgProp || orgFromStorage;

  const startingPlayer = startAsOrg
    ? ORGANIZER_IDENTITY
    : initialPlayer || null;
  const [currentPlayer, setCurrentPlayer] = useState(startingPlayer);
  const [loading, setLoading] = useState(
    !startAsOrg && !initialPlayer && !!leagueId,
  );

  useEffect(() => {
    if (startAsOrg || !leagueId) {
      setLoading(false);
      return;
    }

    // If we already have a player from the join flow, no lookup needed
    if (initialPlayer) {
      setLoading(false);
      return;
    }

    const stored = getStoredToken(leagueId);

    // Purge any stale local-mode tokens — they only exist in memory and
    // will never be found in Supabase, causing a 406 error
    if (!stored || stored.startsWith('local-')) {
      if (stored) clearToken(leagueId);
      setLoading(false);
      return;
    }

    fetchPlayerByToken(stored)
      .then((player) => {
        if (player && player.leagueId === leagueId) {
          setCurrentPlayer(player);
        } else {
          // Token exists in storage but doesn't match — clear it
          clearToken(leagueId);
        }
      })
      .catch(() => clearToken(leagueId))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, startAsOrg]);

  const loginWithToken = useCallback(
    async (token) => {
      if (!leagueId) throw new Error('No active league.');

      const trimmed = token.trim();

      // Guard: reject local tokens immediately without hitting the DB
      if (trimmed.startsWith('local-')) {
        throw new Error(
          'That code is from an offline session and cannot be used to log in. Ask your admin to share a real league code.',
        );
      }

      const player = await fetchPlayerByToken(trimmed);
      if (!player) {
        throw new Error('Code not found. Double-check the code and try again.');
      }
      if (player.leagueId !== leagueId) {
        throw new Error('This code belongs to a different league.');
      }
      storeToken(leagueId, trimmed);
      setCurrentPlayer(player);
      return player;
    },
    [leagueId],
  );

  const logout = useCallback(() => {
    if (leagueId) clearToken(leagueId);
    setCurrentPlayer(null);
  }, [leagueId]);

  const isAdmin = currentPlayer?.role === 'admin';
  const isOrgIdentity = currentPlayer?.id === '__organizer__';

  return (
    <PlayerIdentityContext.Provider
      value={{
        currentPlayer,
        loading,
        loginWithToken,
        logout,
        isAdmin,
        isOrgIdentity,
        orgSignOut: isOrgIdentity ? onOrganizerSignOut : undefined,
      }}
    >
      {children}
    </PlayerIdentityContext.Provider>
  );
}

export function usePlayerIdentity() {
  return useContext(PlayerIdentityContext);
}
