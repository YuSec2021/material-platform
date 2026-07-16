import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  apiClient,
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
  type AuthUser,
} from "../api/client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  login: (username: string) => Promise<void>;
  logout: () => void;
  refreshCurrentUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshCurrentUser = useCallback(async () => {
    const session = readAuthSession();
    if (!session) {
      setUser(null);
      setStatus("unauthenticated");
      return;
    }

    try {
      const currentUser = await apiClient.auth.me();
      setUser(currentUser);
      setStatus("authenticated");
    } catch {
      clearAuthSession();
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refreshCurrentUser();
  }, [refreshCurrentUser]);

  const login = useCallback(async (username: string) => {
    const normalizedUsername = username.trim();
    const userRole = normalizedUsername === "super_admin" ? "super_admin" : "user";
    writeAuthSession({ username: normalizedUsername, role: userRole });

    try {
      const loggedInUser = await apiClient.auth.login(normalizedUsername);
      setUser(loggedInUser);
      setStatus("authenticated");
    } catch (error) {
      clearAuthSession();
      setUser(null);
      setStatus("unauthenticated");
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      refreshCurrentUser,
    }),
    [login, logout, refreshCurrentUser, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
