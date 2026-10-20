import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { clearStoredSession, readStoredSession } from "./storedSession";

interface AuthState {
  session: Session | null;
  loading: boolean;
  // True when the session came off disk because the token couldn't be refreshed —
  // the app runs on its local data until the network returns.
  offline: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);

  // Offline (or against an unreachable auth server) an expired access token can't
  // be refreshed, and supabase-js answers `null` while keeping the session on disk
  // — only a real sign-out or a rejected refresh token clears it. Falling back to
  // the stored session keeps the offline-first screens (the French tests, the
  // to-do board, logging a set) usable instead of bouncing to /signin with a
  // phone that has no signal. Every write still goes through the outbox, and the
  // next successful refresh replaces this with a live session.
  const settle = useCallback((next: Session | null) => {
    const stored = next ?? readStoredSession();
    setSession(stored);
    setOffline(next === null && stored !== null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      settle(data.session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      settle(next);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [settle]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      loading,
      offline,
      signOut: async () => {
        await supabase.auth.signOut().catch(() => {});
        // Offline the call above can't reach the auth server and leaves the stored
        // session behind, which the fallback would keep honouring.
        clearStoredSession();
        settle(null);
      },
    }),
    [session, loading, offline, settle],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
