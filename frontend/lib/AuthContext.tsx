"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AuthUser, apiMe, getToken, saveToken, saveUser, clearToken, getCachedUser } from "@/lib/auth";

type AuthCtx = {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login:  (token: string, user: AuthUser) => void;
  logout: () => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  user: null, token: null, loading: true,
  login: () => {}, logout: () => {}, refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]     = useState<AuthUser | null>(null);
  const [token, setToken]   = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const t = getToken();
    if (!t) { setLoading(false); return; }
    try {
      const u = await apiMe(t);
      setUser(u); setToken(t); saveUser(u);
    } catch {
      clearToken(); setUser(null); setToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Use cached user instantly, then verify with server
    const cached = getCachedUser();
    if (cached) { setUser(cached); setToken(getToken()); }
    refresh();
  }, []);

  const login = (t: string, u: AuthUser) => {
    saveToken(t); saveUser(u);
    setToken(t); setUser(u);
  };

  const logout = () => {
    clearToken(); setUser(null); setToken(null);
  };

  return <Ctx.Provider value={{ user, token, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
