import { describe, expect, it } from "vitest";

import { chainIndexOf, rootItemId, type ChainLink } from "./chain";

function chain(...links: [string, string | null][]): Map<string, ChainLink> {
  return new Map(links.map(([id, origin_item_id]) => [id, { id, origin_item_id }]));
}

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

describe("chainIndexOf", () => {
  it("indexes rows by id, keeping only the chain fields", () => {
    const byId = chainIndexOf([
      { id: "d1", origin_item_id: null, title: "ignored" } as ChainLink & { title: string },
      { id: "d2", origin_item_id: "d1" },
    ]);
    expect(byId.get("d2")).toEqual({ id: "d2", origin_item_id: "d1" });
    expect(rootItemId(byId.get("d2")!, byId)).toBe("d1");
  });
});
