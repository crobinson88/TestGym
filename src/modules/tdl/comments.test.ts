import { describe, expect, it, vi } from "vitest";

// Avoid constructing the real Supabase client (needs env) just to import the
// outbox poke; only the pure helpers are under test here.
vi.mock("@/lib/sync", () => ({ syncEngine: { drain: () => Promise.resolve() } }));

import { sortComments } from "./comments";
import type { LocalTdlComment } from "@/lib/db";

const comment = (id: string, created_at: string, deleted_at: string | null = null) =>
  ({ id, created_at, deleted_at, thread_id: "t", item_id: "i", body: id }) as LocalTdlComment;

describe("sortComments", () => {
  it("is oldest first and drops deleted ones", () => {
    const out = sortComments([
      comment("c", "2026-09-03T00:00:00Z"),
      comment("gone", "2026-09-02T00:00:00Z", "2026-09-04T00:00:00Z"),
      comment("a", "2026-09-01T00:00:00Z"),
    ]);
    expect(out.map((c) => c.id)).toEqual(["a", "c"]);
  });
});
