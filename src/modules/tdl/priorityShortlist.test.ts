import { describe, expect, it } from "vitest";
import {
  CUT_QUADRANT,
  SHORTLIST_LIMIT,
  cutIds,
  denominate,
  describeShortlist,
  emptyShortlist,
  hasRoom,
  isOverflowing,
  isNominated,
  isPicked,
  movePick,
  nominate,
  orderShortlist,
  rankAssignments,
  seedFromRanked,
  shortlistSize,
  togglePick,
  toggleNomination,
  type Shortlist,
} from "./priorityShortlist";

function build(ids: string[]): Shortlist {
  return ids.reduce((s, id) => nominate(s, id), emptyShortlist());
}

describe("nominate", () => {
  it("tags a task and gives it a slot while there is room", () => {
    const s = nominate(emptyShortlist(), "a");
    expect(isNominated(s, "a")).toBe(true);
    expect(isPicked(s, "a")).toBe(true);
  });

  it("is idempotent — a second tag on the same task changes nothing", () => {
    const once = nominate(emptyShortlist(), "a");
    expect(nominate(once, "a")).toBe(once);
  });

  it("keeps tagging past the limit, but without a slot", () => {
    const full = build(
      Array.from({ length: SHORTLIST_LIMIT }, (_, i) => `t${i}`),
    );
    expect(hasRoom(full)).toBe(false);
    const over = nominate(full, "extra");
    expect(isNominated(over, "extra")).toBe(true);
    expect(isPicked(over, "extra")).toBe(false);
    expect(over.picked).toHaveLength(SHORTLIST_LIMIT);
  });
});

describe("isOverflowing", () => {
  it("is false while every tag holds a slot", () => {
    expect(isOverflowing(build(["a", "b", "c"]))).toBe(false);
  });

  it("flips the moment a tag lands with no slot free", () => {
    const over = nominate(
      build(Array.from({ length: SHORTLIST_LIMIT }, (_, i) => `t${i}`)),
      "extra",
    );
    expect(isOverflowing(over)).toBe(true);
    expect(cutIds(over)).toEqual(["extra"]);
  });

  it("clears again once a slot is freed for the overflow", () => {
    let s = nominate(
      build(Array.from({ length: SHORTLIST_LIMIT }, (_, i) => `t${i}`)),
      "extra",
    );
    s = togglePick(s, "t0");
    s = togglePick(s, "extra");
    expect(isPicked(s, "extra")).toBe(true);
    expect(cutIds(s)).toEqual(["t0"]);
    expect(isOverflowing(s)).toBe(true);
  });
});

describe("denominate", () => {
  it("drops a task out of the shortlist entirely — neither ranked nor cut", () => {
    const s = denominate(build(["a", "b"]), "a");
    expect(isNominated(s, "a")).toBe(false);
    expect(cutIds(s)).toEqual([]);
    expect(shortlistSize(s)).toBe(1);
  });

  it("ignores a task that was never tagged", () => {
    const s = build(["a"]);
    expect(denominate(s, "zz")).toBe(s);
  });

  it("toggleNomination tags then untags", () => {
    const on = toggleNomination(emptyShortlist(), "a");
    expect(isNominated(on, "a")).toBe(true);
    expect(isNominated(toggleNomination(on, "a"), "a")).toBe(false);
  });
});

describe("togglePick", () => {
  it("cuts a pick without untagging it", () => {
    const s = togglePick(build(["a", "b"]), "a");
    expect(isPicked(s, "a")).toBe(false);
    expect(isNominated(s, "a")).toBe(true);
    expect(cutIds(s)).toEqual(["a"]);
  });

  it("puts a cut task back at the end of the order", () => {
    let s = build(["a", "b"]);
    s = togglePick(s, "a");
    s = togglePick(s, "a");
    expect(s.picked).toEqual(["b", "a"]);
  });

  it("refuses a pick when the slots are full rather than evicting someone", () => {
    const over = nominate(
      build(Array.from({ length: SHORTLIST_LIMIT }, (_, i) => `t${i}`)),
      "extra",
    );
    expect(togglePick(over, "extra")).toBe(over);
  });

  it("ignores a task that is not on the shortlist", () => {
    const s = build(["a"]);
    expect(togglePick(s, "zz")).toBe(s);
  });
});

describe("movePick", () => {
  it("moves a pick up the order", () => {
    expect(movePick(build(["a", "b", "c"]), "c", -1).picked).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("moves a pick down the order", () => {
    expect(movePick(build(["a", "b", "c"]), "a", 1).picked).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("stops at the ends", () => {
    const s = build(["a", "b"]);
    expect(movePick(s, "a", -1)).toBe(s);
    expect(movePick(s, "b", 1)).toBe(s);
  });

  it("ignores a task that holds no slot", () => {
    const s = togglePick(build(["a", "b"]), "a");
    expect(movePick(s, "a", -1)).toBe(s);
  });
});

describe("rankAssignments", () => {
  it("spends ranks 1…n down the picked order", () => {
    expect(rankAssignments(build(["a", "b", "c"]))).toEqual([
      { id: "a", rank: 1 },
      { id: "b", rank: 2 },
      { id: "c", rank: 3 },
    ]);
  });

  it("leaves out the cut ones", () => {
    const s = togglePick(build(["a", "b"]), "a");
    expect(rankAssignments(s)).toEqual([{ id: "b", rank: 1 }]);
  });

  it("never spends more than the day has ranks", () => {
    const over = nominate(
      build(Array.from({ length: SHORTLIST_LIMIT }, (_, i) => `t${i}`)),
      "extra",
    );
    const ranks = rankAssignments(over).map((r) => r.rank);
    expect(ranks).toHaveLength(SHORTLIST_LIMIT);
    expect(Math.max(...ranks)).toBe(SHORTLIST_LIMIT);
    expect(new Set(ranks).size).toBe(SHORTLIST_LIMIT);
  });
});

describe("orderShortlist", () => {
  it("reads picks in rank order then the cut ones in tag order", () => {
    let s = build(["a", "b", "c"]);
    s = togglePick(s, "b");
    const byId = new Map(["a", "b", "c"].map((id) => [id, { id }]));
    expect(orderShortlist(s, byId).map((x) => x.id)).toEqual(["a", "c", "b"]);
  });

  it("drops ids with no card behind them", () => {
    const byId = new Map([["a", { id: "a" }]]);
    expect(orderShortlist(build(["a", "gone"]), byId).map((x) => x.id)).toEqual(
      ["a"],
    );
  });
});

describe("seedFromRanked", () => {
  it("starts from the day's existing priorities in rank order", () => {
    const s = seedFromRanked([
      { id: "c", priority_rank: 3 },
      { id: "a", priority_rank: 1 },
      { id: "u", priority_rank: null },
      { id: "b", priority_rank: 2 },
    ]);
    expect(s.picked).toEqual(["a", "b", "c"]);
    expect(cutIds(s)).toEqual([]);
  });

  it("is empty when nothing is ranked yet", () => {
    expect(seedFromRanked([{ id: "a", priority_rank: null }])).toEqual(
      emptyShortlist(),
    );
  });
});

describe("describeShortlist", () => {
  it("names nothing when nothing was tagged", () => {
    expect(describeShortlist(emptyShortlist())).toBe("No priorities set");
  });

  it("counts the priorities set", () => {
    expect(describeShortlist(build(["a"]))).toBe("1 priority set");
    expect(describeShortlist(build(["a", "b"]))).toBe("2 priorities set");
  });

  it("names the ones pushed to Do First", () => {
    const s = togglePick(build(["a", "b"]), "a");
    expect(describeShortlist(s)).toBe("1 priority set · 1 to Do First");
  });
});

describe("CUT_QUADRANT", () => {
  it("is the red urgent-and-important quadrant", () => {
    expect(CUT_QUADRANT).toBe("do_first");
  });
});
