"use client";

import { createContext, useContext } from "react";

type AuthState = {
  userId: string | null;
  userEmail: string | null;
};

const AuthContext = createContext<AuthState>({ userId: null, userEmail: null });

export function AuthProvider({
  userId,
  userEmail,
  children,
}: AuthState & { children: React.ReactNode }) {
  return (
    <AuthContext.Provider value={{ userId, userEmail }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
