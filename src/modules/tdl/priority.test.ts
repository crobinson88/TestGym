import { describe, expect, it } from "vitest";
import { clampRank, usedRanks, MAX_PRIORITY_RANK } from "./priority";

describe("clampRank", () => {
  it("passes through valid ranks", () => {
    expect(clampRank(1)).toBe(1);
    expect(clampRank(10)).toBe(10);
  });

  it("treats null / sub-1 as unranked", () => {
    expect(clampRank(null)).toBeNull();
    expect(clampRank(0)).toBeNull();
    expect(clampRank(-3)).toBeNull();
  });

  it("caps above the max and rounds", () => {
    expect(clampRank(99)).toBe(MAX_PRIORITY_RANK);
    expect(clampRank(2.6)).toBe(3);
  });
});

describe("usedRanks", () => {
  it("collects the ranks in use, ignoring nulls", () => {
    const taken = usedRanks([
      { priority_rank: 1 },
      { priority_rank: null },
      { priority_rank: 8 },
      { priority_rank: 1 },
    ]);
    expect(taken).toEqual(new Set([1, 8]));
  });
});
