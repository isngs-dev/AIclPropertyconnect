"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { get, getTokens, post, setTokens } from "./api";

export type User = {
  id: string; email: string; mobile: string; full_name: string; address: string | null;
  role: "ADMIN" | "SHOP_OWNER"; is_active: boolean;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (body: Record<string, string>) => Promise<User>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
};

const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!getTokens()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await get<User>("/auth/me"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const finish = (r: any) => {
    setTokens(r);
    setUser(r.user);
    return r.user as User;
  };

  const value: Ctx = {
    user,
    loading,
    reload,
    login: async (email, password) => finish(await post("/auth/login", { email, password })),
    register: async (body) => finish(await post("/auth/register", body)),
    logout: async () => {
      const t = getTokens();
      if (t) await post("/auth/logout", { refresh_token: t.refresh_token }).catch(() => {});
      setTokens(null);
      setUser(null);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
