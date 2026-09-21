import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Capability, UserDto } from "@justicegrid/shared";
import { hasCapability, hasUnscopedCapability } from "@justicegrid/shared";
import { api, ApiError, setAccessToken } from "../lib/api";

interface AuthContextValue {
  user: UserDto | null;
  /** `null` while the initial silent-refresh-on-load check is in flight. */
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (capability: Capability) => boolean;
  canUnscoped: (capability: Capability) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * On mount, tries a silent refresh (the httpOnly cookie survives a page
 * reload even though the in-memory access token doesn't) so a reload
 * doesn't bounce an already-logged-in user back to /login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const refreshRes = await fetch("/api/v1/auth/refresh", {
          method: "POST",
          credentials: "include",
        });
        if (!refreshRes.ok) return;
        const body = (await refreshRes.json()) as { data: { accessToken: string; user: UserDto } };
        setAccessToken(body.data.accessToken);
        setUser(body.data.user);
      } catch {
        // No valid session — stay logged out, land on /login.
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ accessToken: string; user: UserDto }>("/auth/login", {
      email,
      password,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Best-effort — clear local state regardless of server outcome.
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  const can = useCallback(
    (capability: Capability) => (user ? hasCapability(user.role, capability) : false),
    [user],
  );
  const canUnscoped = useCallback(
    (capability: Capability) => (user ? hasUnscopedCapability(user.role, capability) : false),
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, can, canUnscoped }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
