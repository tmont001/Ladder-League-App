// src/context/PlayerIdentityContext.js
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

// A synthetic "organizer" identity used when the admin is not a player
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
  children,
}) {
  // If isOrganizer prop is true (just launched), skip token lookup entirely
  const orgFromStorage = leagueId ? isOrganizer(leagueId) : false;
  const startAsOrg = isOrgProp || orgFromStorage;

  const startingPlayer = startAsOrg
    ? ORGANIZER_IDENTITY
    : initialPlayer || null;
  const [currentPlayer, setCurrentPlayer] = useState(startingPlayer);
  const [loading, setLoading] = useState(
    !startAsOrg && !initialPlayer && !!leagueId,
  );

  // Check localStorage for a stored player token (returning player, not organizer)
  useEffect(() => {
    if (startAsOrg || !leagueId) {
      setLoading(false);
      return;
    }

    const stored = getStoredToken(leagueId);
    if (!stored) {
      setLoading(false);
      return;
    }

    fetchPlayerByToken(stored)
      .then((player) => {
        if (player && player.leagueId === leagueId) {
          setCurrentPlayer(player);
        } else {
          clearToken(leagueId);
        }
      })
      .catch(() => clearToken(leagueId))
      .finally(() => setLoading(false));
  }, [leagueId, startAsOrg]);

  const loginWithToken = useCallback(
    async (token) => {
      if (!leagueId) throw new Error('No active league.');

      const player = await fetchPlayerByToken(token.trim());
      if (!player || player.leagueId !== leagueId) {
        throw new Error('Code not found. Check the code and try again.');
      }
      storeToken(leagueId, token.trim());
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
      }}
    >
      {children}
    </PlayerIdentityContext.Provider>
  );
}

export function usePlayerIdentity() {
  return useContext(PlayerIdentityContext);
}
