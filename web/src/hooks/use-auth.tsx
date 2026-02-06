"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

const AUTH_STORAGE_KEY = "budget-sync-auth-email";
const ALLOWED_EMAIL = process.env.NEXT_PUBLIC_ALLOWED_EMAIL || "";
const ALLOWED_PASSWORD = process.env.NEXT_PUBLIC_ALLOWED_PASSWORD || "";

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  email: string | null;
  login: (email: string, password: string) => { success: boolean; error?: string };
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Store for auth state - provides subscription and snapshot for useSyncExternalStore
let listeners: Array<() => void> = [];

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

function subscribeToAuth(callback: () => void): () => void {
  listeners = [...listeners, callback];
  return () => {
    listeners = listeners.filter((listener) => listener !== callback);
  };
}

function getAuthSnapshot(): string | null {
  const storedEmail = localStorage.getItem(AUTH_STORAGE_KEY);
  if (storedEmail && storedEmail === ALLOWED_EMAIL) {
    return storedEmail;
  }
  return null;
}

function getServerSnapshot(): string | null {
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const email = useSyncExternalStore(
    subscribeToAuth,
    getAuthSnapshot,
    getServerSnapshot,
  );

  const login = useCallback(
    (inputEmail: string, inputPassword: string): { success: boolean; error?: string } => {
      const normalizedEmail = inputEmail.trim().toLowerCase();

      if (!ALLOWED_EMAIL || !ALLOWED_PASSWORD) {
        return {
          success: false,
          error: "Authentication is not configured. Please set NEXT_PUBLIC_ALLOWED_EMAIL and NEXT_PUBLIC_ALLOWED_PASSWORD.",
        };
      }

      if (normalizedEmail !== ALLOWED_EMAIL.toLowerCase()) {
        return {
          success: false,
          error: "Invalid email or password.",
        };
      }

      if (inputPassword !== ALLOWED_PASSWORD) {
        return {
          success: false,
          error: "Invalid email or password.",
        };
      }

      localStorage.setItem(AUTH_STORAGE_KEY, normalizedEmail);
      emitChange();
      return { success: true };
    },
    []
  );

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    emitChange();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!email,
        isLoading: false,
        email,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
