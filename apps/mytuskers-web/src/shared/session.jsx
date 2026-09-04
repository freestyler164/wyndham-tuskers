import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

export const SessionContext = createContext(null);

export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }) {
  const [session, setSession] = useState({ user: null, teams: [], loading: true });
  const [activeTeamId, setActiveTeamIdState] = useState(localStorage.getItem('mytuskers.activeTeamId') || '');

  const refresh = async () => {
    try {
      const data = await api('/v1/me');
      setSession({ ...data, loading: false });
      const allowed = data.teams.some((team) => team.teamId === activeTeamId);
      if (!allowed && data.teams[0]) setActiveTeamId(data.teams[0].teamId);
    } catch {
      setSession({ user: null, teams: [], loading: false });
    }
  };

  const setActiveTeamId = (teamId) => {
    setActiveTeamIdState(teamId);
    if (teamId) localStorage.setItem('mytuskers.activeTeamId', teamId);
  };

  useEffect(() => {
    refresh();
  }, []);

  const activeTeam = session.teams.find((team) => team.teamId === activeTeamId) || session.teams[0] || null;
  const value = useMemo(() => ({
    ...session,
    activeTeam,
    activeTeamId: activeTeam?.teamId || '',
    setActiveTeamId,
    setSession,
    refresh,
  }), [session, activeTeam, activeTeamId]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
