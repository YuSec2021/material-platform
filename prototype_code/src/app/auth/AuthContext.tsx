import { createContext, useContext, useMemo, type ReactNode } from "react";

export type AuthUser = {
  id: string;
  name: string;
  role: string;
};

type AuthContextValue = {
  status: "authenticated";
  user: AuthUser;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const defaultUser: AuthUser = {
  id: "admin",
  name: "超级管理员",
  role: "system-admin",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo<AuthContextValue>(
    () => ({
      status: "authenticated",
      user: defaultUser,
    }),
    [],
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
