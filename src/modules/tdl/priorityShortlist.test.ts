import { describe, expect, it } from "vitest";
import {
  CUT_QUADRANT,
  SHORTLIST_LIMIT,
  cutIds,
  demote,
  denominate,
  describeShortlist,
  emptyShortlist,
  isNominated,
  isPicked,
  moveNomination,
  nominate,
  orderShortlist,
  pickedIds,
  promote,
  rankAssignments,
  seedFromRanked,
  shortlistSize,
  toggleNomination,
  type Shortlist,
} from "./priorityShortlist";

function build(ids: string[]): Shortlist {
  return ids.reduce((s, id) => nominate(s, id), emptyShortlist());
}

const fullIds = Array.from({ length: SHORTLIST_LIMIT }, (_, i) => `t${i}`);

describe("nominate", () => {
  it("tags a task, which is above the line while the list is short", () => {
    const s = nominate(emptyShortlist(), "a");
    expect(isNominated(s, "a")).toBe(true);
    expect(isPicked(s, "a")).toBe(true);
  });

  it("is idempotent — a second tag on the same task changes nothing", () => {
    const once = nominate(emptyShortlist(), "a");
    expect(nominate(once, "a")).toBe(once);
  });

  it("takes an unlimited number of tags, the extras landing below the line", () => {
    let s = build(fullIds);
    s = nominate(s, "extra");
    s = nominate(s, "extra2");
    expect(shortlistSize(s)).toBe(SHORTLIST_LIMIT + 2);
    expect(isNominated(s, "extra2")).toBe(true);
    expect(isPicked(s, "extra2")).toBe(false);
    expect(pickedIds(s)).toHaveLength(SHORTLIST_LIMIT);
    expect(cutIds(s)).toEqual(["extra", "extra2"]);
  });
});

describe("denominate", () => {
  it("drops a task out of the shortlist entirely — neither ranked nor cut", () => {
    const s = denominate(build(["a", "b"]), "a");
    expect(isNominated(s, "a")).toBe(false);
    expect(cutIds(s)).toEqual([]);
    expect(shortlistSize(s)).toBe(1);
  });

  it("pulls the next one up over the line", () => {
    const s = denominate(nominate(build(fullIds), "extra"), "t0");
    expect(isPicked(s, "extra")).toBe(true);
    expect(cutIds(s)).toEqual([]);
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

describe("moveNomination", () => {
  it("moves a task up the order", () => {
    expect(moveNomination(build(["a", "b", "c"]), "c", -1).nominated).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("moves a task down the order", () => {
    expect(moveNomination(build(["a", "b", "c"]), "a", 1).nominated).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("steps across the line like any other step", () => {
    const s = moveNomination(nominate(build(fullIds), "extra"), "extra", -1);
    expect(isPicked(s, "extra")).toBe(true);
    expect(cutIds(s)).toEqual(["t9"]);
  });

  it("stops at the ends", () => {
    const s = build(["a", "b"]);
    expect(moveNomination(s, "a", -1)).toBe(s);
    expect(moveNomination(s, "b", 1)).toBe(s);
  });

  it("ignores a task that is not on the shortlist", () => {
    const s = build(["a"]);
    expect(moveNomination(s, "zz", -1)).toBe(s);
  });
});

describe("promote / demote", () => {
  it("jumps a cut task into the last ranked slot, pushing that one down", () => {
    const s = promote(nominate(build(fullIds), "extra"), "extra");
    expect(rankAssignments(s).at(-1)).toEqual({
      id: "extra",
      rank: SHORTLIST_LIMIT,
    });
    expect(cutIds(s)).toEqual(["t9"]);
  });

  it("leaves a task that is already above the line alone", () => {
    const s = build(["a", "b"]);
    expect(promote(s, "a")).toBe(s);
  });

  it("drops a ranked task below the line, still tagged, and pulls the next up", () => {
    const s = demote(nominate(build(fullIds), "extra"), "t0");
    expect(isNominated(s, "t0")).toBe(true);
    expect(isPicked(s, "t0")).toBe(false);
    expect(isPicked(s, "extra")).toBe(true);
    expect(cutIds(s)).toEqual(["t0"]);
  });

  it("sends it to the end when the list is shorter than the ten", () => {
    expect(demote(build(["a", "b", "c"]), "a").nominated).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("is a no-op on the only task on the shortlist", () => {
    const s = build(["a"]);
    expect(demote(s, "a")).toBe(s);
  });
});

describe("rankAssignments", () => {
  it("spends ranks 1…n down the sorted order", () => {
    expect(rankAssignments(build(["a", "b", "c"]))).toEqual([
      { id: "a", rank: 1 },
      { id: "b", rank: 2 },
      { id: "c", rank: 3 },
    ]);
  });

  it("leaves out the cut ones", () => {
    const s = demote(nominate(build(fullIds), "extra"), "t0");
    expect(rankAssignments(s).map((r) => r.id)).not.toContain("t0");
    expect(rankAssignments(s).at(-1)).toEqual({
      id: "extra",
      rank: SHORTLIST_LIMIT,
    });
  });

  it("never spends more than the day has ranks", () => {
    const over = nominate(build(fullIds), "extra");
    const ranks = rankAssignments(over).map((r) => r.rank);
    expect(ranks).toHaveLength(SHORTLIST_LIMIT);
    expect(Math.max(...ranks)).toBe(SHORTLIST_LIMIT);
    expect(new Set(ranks).size).toBe(SHORTLIST_LIMIT);
  });
});

describe("orderShortlist", () => {
  it("reads top to bottom in the sorted order", () => {
    const s = demote(build(["a", "b", "c"]), "b");
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
    expect(pickedIds(s)).toEqual(["a", "b", "c"]);
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
    const s = nominate(build(fullIds), "extra");
    expect(describeShortlist(s)).toBe(
      `${SHORTLIST_LIMIT} priorities set · 1 to Do First`,
    );
  });
});

describe("CUT_QUADRANT", () => {
  it("is the red urgent-and-important quadrant", () => {
    expect(CUT_QUADRANT).toBe("do_first");
  });
});
