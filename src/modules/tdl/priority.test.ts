import { describe, expect, it } from "vitest";
import {
  clampRank,
  prioritySlots,
  reorderedRankAssignments,
  selectPriorityItems,
  usedRanks,
  MAX_PRIORITY_RANK,
} from "./priority";

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

describe("selectPriorityItems", () => {
  it("keeps only ranked items, ordered 1 → 10", () => {
    const items = [
      { id: "a", priority_rank: 3 },
      { id: "b", priority_rank: null },
      { id: "c", priority_rank: 1 },
      { id: "d", priority_rank: 10 },
    ];
    expect(selectPriorityItems(items).map((i) => i.id)).toEqual(["c", "a", "d"]);
  });

  it("returns an empty list when nothing is ranked", () => {
    expect(selectPriorityItems([{ priority_rank: null }])).toEqual([]);
  });
});

describe("reorderedRankAssignments", () => {
  // Ranks in use: 1, 3, 7. Original order c(1), a(3), d(7). Drag d to the top.
  it("reassigns the existing rank values by new position", () => {
    const newOrder = [
      { id: "d", priority_rank: 7 },
      { id: "c", priority_rank: 1 },
      { id: "a", priority_rank: 3 },
    ];
    expect(reorderedRankAssignments(newOrder)).toEqual([
      { id: "d", rank: 1 },
      { id: "c", rank: 3 },
      { id: "a", rank: 7 },
    ]);
  });

  it("returns nothing when the order is unchanged", () => {
    const order = [
      { id: "c", priority_rank: 1 },
      { id: "a", priority_rank: 3 },
      { id: "d", priority_rank: 7 },
    ];
    expect(reorderedRankAssignments(order)).toEqual([]);
  });

  it("only emits the items whose rank moved", () => {
    // Swap the top two (1↔2); the third (rank 5) stays put.
    const newOrder = [
      { id: "b", priority_rank: 2 },
      { id: "a", priority_rank: 1 },
      { id: "c", priority_rank: 5 },
    ];
    expect(reorderedRankAssignments(newOrder)).toEqual([
      { id: "b", rank: 1 },
      { id: "a", rank: 2 },
    ]);
  });
});

describe("prioritySlots", () => {
  const items = [
    { id: "a", priority_rank: 3 },
    { id: "b", priority_rank: null },
    { id: "c", priority_rank: 1 },
  ];

  it("lists all ten slots, filled or free", () => {
    const slots = prioritySlots(items);
    expect(slots.map((s) => s.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(slots.map((s) => s.item?.id ?? null)).toEqual([
      "c", null, "a", null, null, null, null, null, null, null,
    ]);
  });

  it("moves an overridden task to its new slot, displacing the holder", () => {
    const slots = prioritySlots(items, { id: "a", rank: 1 });
    expect(slots[0].item?.id).toBe("a");
    expect(slots[2].item).toBeNull();
    expect(slots.filter((s) => s.item?.id === "c")).toEqual([]);
  });

  it("drops an overridden task whose rank was cleared", () => {
    const slots = prioritySlots(items, { id: "c", rank: null });
    expect(slots.some((s) => s.item?.id === "c")).toBe(false);
    expect(slots[2].item?.id).toBe("a");
  });

  it("places an unranked task given a rank", () => {
    expect(prioritySlots(items, { id: "b", rank: 2 })[1].item?.id).toBe("b");
  });
});
