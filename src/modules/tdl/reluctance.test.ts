import { describe, expect, it } from "vitest";
import { selectReluctantItems } from "./reluctance";

function item(
  is_reluctant: boolean,
  overrides: Partial<{ position: number; priority_rank: number | null; title: string }> = {},
) {
  return {
    is_reluctant,
    position: 0,
    priority_rank: null as number | null,
    title: "",
    ...overrides,
  };
}

describe("selectReluctantItems", () => {
  it("keeps only reluctant items", () => {
    const items = [
      item(true, { position: 0, title: "a" }),
      item(false, { position: 1, title: "b" }),
      item(true, { position: 2, title: "c" }),
    ];
    expect(selectReluctantItems(items).map((i) => i.title)).toEqual(["a", "c"]);
  });

  it("orders ranked items first (1 → 10), then the rest by position", () => {
    const items = [
      item(true, { position: 2, title: "unranked-late" }),
      item(true, { position: 0, title: "rank3", priority_rank: 3 }),
      item(true, { position: 5, title: "unranked-early" }),
      item(true, { position: 9, title: "rank1", priority_rank: 1 }),
    ];
    expect(selectReluctantItems(items).map((i) => i.title)).toEqual([
      "rank1",
      "rank3",
      "unranked-late",
      "unranked-early",
    ]);
  });

  it("returns an empty list when nothing is flagged", () => {
    expect(selectReluctantItems([item(false), item(false)])).toEqual([]);
  });
});
