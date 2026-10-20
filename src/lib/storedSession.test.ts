import { describe, it, expect } from "vitest";
import { clearStoredSession, parseStoredSession, readStoredSession } from "./storedSession";

const SESSION = {
  access_token: "jwt",
  refresh_token: "refresh",
  expires_at: 1,
  user: { id: "u1" },
};

function storage(entries: Record<string, string>): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage;
}

describe("stored session", () => {
  it("parses a persisted session", () => {
    expect(parseStoredSession(JSON.stringify(SESSION))?.access_token).toBe("jwt");
  });

  it("parses the base64-wrapped form", () => {
    const raw = `base64-${btoa(JSON.stringify(SESSION))}`;
    expect(parseStoredSession(raw)?.refresh_token).toBe("refresh");
  });

  it("rejects anything that isn't a session", () => {
    expect(parseStoredSession(null)).toBeNull();
    expect(parseStoredSession("not json")).toBeNull();
    expect(parseStoredSession("{}")).toBeNull();
    expect(parseStoredSession(JSON.stringify({ ...SESSION, user: undefined }))).toBeNull();
    expect(parseStoredSession(JSON.stringify({ ...SESSION, access_token: "" }))).toBeNull();
  });

  it("finds the session under supabase's project-namespaced key", () => {
    const store = storage({
      theme: "dark",
      "sb-rgslyxzeyjiypzilpxpf-auth-token": JSON.stringify(SESSION),
    });
    expect(readStoredSession(store)?.access_token).toBe("jwt");
  });

  it("reads as signed out once the key is gone", () => {
    const store = storage({ "sb-ref-auth-token": JSON.stringify(SESSION) });
    clearStoredSession(store);
    expect(readStoredSession(store)).toBeNull();
  });
});
