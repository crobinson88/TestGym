import type { Session } from "@supabase/supabase-js";

// supabase-js namespaces the persisted session by project ref: `sb-<ref>-auth-token`.
// Matched rather than re-derived so the URL and the key can't drift apart.
const KEY_PATTERN = /^sb-.+-auth-token$/;

// Some supabase-js versions store the session base64-wrapped rather than as plain
// JSON. Both shapes decode to the same object.
const BASE64_PREFIX = "base64-";

export function parseStoredSession(raw: string | null): Session | null {
  if (!raw) return null;
  let text = raw;
  if (text.startsWith(BASE64_PREFIX)) {
    try {
      text = atob(text.slice(BASE64_PREFIX.length));
    } catch {
      return null;
    }
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const s = value as Partial<Session> & { currentSession?: Partial<Session> };
  // Pre-v2 clients nested the session one level down.
  const session = s.currentSession ?? s;
  if (typeof session.access_token !== "string" || !session.access_token) return null;
  if (typeof session.refresh_token !== "string" || !session.refresh_token) return null;
  if (!session.user || typeof session.user !== "object") return null;
  return session as Session;
}

// The session supabase-js has on disk, whatever its freshness. Offline, an expired
// access token can't be refreshed and `getSession()` answers null even though the
// sign-in still stands — this is what says it does. A real sign-out clears the key
// before announcing itself, so it reads as signed out here too.
export function readStoredSession(storage?: Storage): Session | null {
  const store = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (!store) return null;
  try {
    for (const key of storedSessionKeys(store)) {
      const session = parseStoredSession(store.getItem(key));
      if (session) return session;
    }
  } catch {
    // Blocked storage just means no offline fallback.
  }
  return null;
}

function storedSessionKeys(store: Storage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i);
    if (key && KEY_PATTERN.test(key)) keys.push(key);
  }
  return keys;
}

// Drop the persisted session. Signing out offline can't reach the auth server, and
// supabase-js then leaves the session on disk — which the fallback above would read
// as still signed in. Clearing it here makes "Sign out" mean it with no network.
export function clearStoredSession(storage?: Storage): void {
  const store = storage ?? (typeof window === "undefined" ? undefined : window.localStorage);
  if (!store) return;
  try {
    for (const key of storedSessionKeys(store)) store.removeItem(key);
  } catch {
    // ignore
  }
}
