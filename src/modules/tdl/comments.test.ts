import { describe, expect, it, vi } from "vitest";

// Avoid constructing the real Supabase client (needs env) just to import the
// outbox poke; only the pure helpers are under test here.
vi.mock("@/lib/sync", () => ({ syncEngine: { drain: () => Promise.resolve() } }));

import { rootItemId, sortComments, type ChainLink } from "./comments";
import type { LocalTdlComment } from "@/lib/db";

function chain(...links: [string, string | null][]): Map<string, ChainLink> {
  return new Map(links.map(([id, origin_item_id]) => [id, { id, origin_item_id }]));
}

const comment = (id: string, created_at: string, deleted_at: string | null = null) =>
  ({ id, created_at, deleted_at, thread_id: "t", item_id: "i", body: id }) as LocalTdlComment;

describe("rootItemId", () => {
  it("walks a roll-forward chain back to the first row", () => {
    const byId = chain(["d1", null], ["d2", "d1"], ["d3", "d2"]);
    expect(rootItemId(byId.get("d3")!, byId)).toBe("d1");
  });

  it("is the row itself when it never rolled forward", () => {
    const byId = chain(["only", null]);
    expect(rootItemId(byId.get("only")!, byId)).toBe("only");
  });

  it("stops at the oldest row still held locally", () => {
    // d1 was purged; d2 is as far back as we can see, so it anchors the thread.
    const byId = chain(["d2", "d1"], ["d3", "d2"]);
    expect(rootItemId(byId.get("d3")!, byId)).toBe("d2");
  });

  it("does not loop on a cyclic chain", () => {
    const byId = chain(["a", "b"], ["b", "a"]);
    expect(rootItemId(byId.get("a")!, byId)).toBe("b");
  });
});

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
