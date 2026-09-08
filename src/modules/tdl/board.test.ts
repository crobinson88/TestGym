import { describe, expect, it } from "vitest";
import {
  clampViewMode,
  laneDroppableId,
  laneKeyFromDroppableId,
  orderLaneCards,
  resolveDrop,
  type DropLane,
} from "./board";
import { UNCATEGORISED_KEY } from "./sections";

const card = (id: string, section: string, is_recurring = false) => ({
  id,
  section,
  is_recurring,
});

const lanes = (): DropLane[] => [
  {
    key: "tgm",
    cards: [card("r1", "tgm", true), card("a", "tgm"), card("b", "tgm"), card("c", "tgm")],
  },
  { key: "product", cards: [card("x", "product"), card("y", "product")] },
  { key: "empty", cards: [] },
];

describe("clampViewMode", () => {
  it("keeps the two known modes", () => {
    expect(clampViewMode("board")).toBe("board");
    expect(clampViewMode("list")).toBe("list");
  });

  it("falls back to list for anything else", () => {
    expect(clampViewMode(undefined)).toBe("list");
    expect(clampViewMode("kanban")).toBe("list");
    expect(clampViewMode(null)).toBe("list");
  });
});

describe("lane droppable ids", () => {
  it("round-trips a key", () => {
    expect(laneKeyFromDroppableId(laneDroppableId("tgm"))).toBe("tgm");
  });

  it("returns null for a card id", () => {
    expect(laneKeyFromDroppableId("2f0c-uuid")).toBeNull();
  });
});

describe("orderLaneCards", () => {
  it("stacks recurring first, each bucket by position", () => {
    const out = orderLaneCards(
      [{ id: "r2", position: 5 }, { id: "r1", position: 1 }],
      [{ id: "d2", position: 9 }, { id: "d1", position: 2 }],
    );
    expect(out.map((c) => c.id)).toEqual(["r1", "r2", "d1", "d2"]);
  });
});

describe("resolveDrop", () => {
  it("reorders within a lane, dropping before the card landed on", () => {
    const drop = resolveDrop("c", "a", lanes());
    expect(drop).toEqual({
      section: "tgm",
      isRecurring: false,
      orderedIds: ["c", "a", "b"],
      index: 0,
      moved: false,
    });
  });

  it("moves a card to another lane at the target's slot", () => {
    const drop = resolveDrop("a", "y", lanes());
    expect(drop).toMatchObject({
      section: "product",
      isRecurring: false,
      orderedIds: ["x", "a", "y"],
      index: 1,
      moved: true,
    });
  });

  it("appends when dropped on the lane itself", () => {
    const drop = resolveDrop("a", laneDroppableId("product"), lanes());
    expect(drop).toMatchObject({ section: "product", orderedIds: ["x", "y", "a"], index: 2 });
  });

  it("moves into an empty lane", () => {
    const drop = resolveDrop("a", laneDroppableId("empty"), lanes());
    expect(drop).toMatchObject({ section: "empty", orderedIds: ["a"], index: 0, moved: true });
  });

  it("keeps a recurring card in the recurring bucket even when dropped on a dated card", () => {
    const drop = resolveDrop("r1", "y", lanes());
    expect(drop).toMatchObject({
      section: "product",
      isRecurring: true,
      orderedIds: ["r1"],
      index: 0,
      moved: true,
    });
  });

  it("is a no-op when the card lands where it already sits", () => {
    expect(resolveDrop("a", "a", lanes())).toBeNull();
    expect(resolveDrop("a", "b", lanes())).toBeNull();
  });

  it("refuses to move a card into the Uncategorised lane", () => {
    const withOrphans: DropLane[] = [
      ...lanes(),
      { key: UNCATEGORISED_KEY, cards: [card("o1", "gone"), card("o2", "gone")] },
    ];
    expect(resolveDrop("a", "o1", withOrphans)).toBeNull();
    expect(resolveDrop("a", laneDroppableId(UNCATEGORISED_KEY), withOrphans)).toBeNull();
  });

  it("reorders orphans inside the Uncategorised lane against their own section", () => {
    const withOrphans: DropLane[] = [
      ...lanes(),
      {
        key: UNCATEGORISED_KEY,
        cards: [card("o1", "gone"), card("p1", "vanished"), card("o2", "gone")],
      },
    ];
    const drop = resolveDrop("o2", "o1", withOrphans);
    expect(drop).toEqual({
      section: "gone",
      isRecurring: false,
      orderedIds: ["o2", "o1"],
      index: 0,
      moved: false,
    });
  });

  it("returns null for unknown cards or lanes", () => {
    expect(resolveDrop("nope", "a", lanes())).toBeNull();
    expect(resolveDrop("a", laneDroppableId("nope"), lanes())).toBeNull();
  });
});
