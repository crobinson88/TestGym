import { describe, expect, it } from "vitest";
import {
  clampViewMode,
  groupCardsByList,
  laneDroppableId,
  laneKeyFromDroppableId,
  listDropAssignments,
  resolveBoardCategory,
  resolveListDrop,
  resolveListId,
  type BoardCardLike,
  type BoardLane,
} from "./board";

const LISTS = [
  { id: "backlog", label: "Backlog" },
  { id: "doing", label: "In progress" },
  { id: "done", label: "Done" },
];

const card = (
  id: string,
  board_list_id: string | null,
  position: number,
  is_recurring = false,
): BoardCardLike => ({ id, board_list_id, position, is_recurring });

function lanes(): BoardLane[] {
  return groupCardsByList(
    [
      card("r1", "backlog", 0, true),
      card("a", "backlog", 1),
      card("b", "backlog", 2),
      card("c", "backlog", 5),
      card("x", "doing", 3),
      card("y", "doing", 4),
    ],
    LISTS,
  );
}

describe("clampViewMode", () => {
  it("keeps the two known modes and falls back to list", () => {
    expect(clampViewMode("board")).toBe("board");
    expect(clampViewMode("list")).toBe("list");
    expect(clampViewMode("kanban")).toBe("list");
    expect(clampViewMode(null)).toBe("list");
  });
});

describe("resolveBoardCategory", () => {
  it("keeps the remembered category while it is live", () => {
    expect(resolveBoardCategory("tgm", ["daily", "tgm"])).toBe("tgm");
  });

  it("falls back to the first category when the remembered one is gone", () => {
    expect(resolveBoardCategory("gone", ["daily", "tgm"])).toBe("daily");
    expect(resolveBoardCategory(null, ["daily"])).toBe("daily");
  });

  it("is null when there are no categories", () => {
    expect(resolveBoardCategory("tgm", [])).toBeNull();
  });
});

describe("lane droppable ids", () => {
  it("round-trips a list id and ignores card ids", () => {
    expect(laneKeyFromDroppableId(laneDroppableId("doing"))).toBe("doing");
    expect(laneKeyFromDroppableId("2f0c-uuid")).toBeNull();
  });
});

describe("resolveListId", () => {
  it("uses the card's own list when it is live", () => {
    expect(resolveListId(card("a", "doing", 0), LISTS)).toBe("doing");
  });

  it("falls back to the first list for unplaced cards or a deleted list", () => {
    expect(resolveListId(card("a", null, 0), LISTS)).toBe("backlog");
    expect(resolveListId(card("a", "vanished", 0), LISTS)).toBe("backlog");
  });

  it("is null when the category has no lists yet", () => {
    expect(resolveListId(card("a", null, 0), [])).toBeNull();
  });
});

describe("groupCardsByList", () => {
  it("keeps every list, recurring cards first, then by position", () => {
    const out = lanes();
    expect(out.map((l) => l.list.id)).toEqual(["backlog", "doing", "done"]);
    expect(out[0].cards.map((c) => c.id)).toEqual(["r1", "a", "b", "c"]);
    expect(out[2].cards).toEqual([]);
  });

  it("sweeps unplaced cards into the first list", () => {
    const out = groupCardsByList([card("loose", null, 9)], LISTS);
    expect(out[0].cards.map((c) => c.id)).toEqual(["loose"]);
  });
});

describe("resolveListDrop", () => {
  it("reorders within a lane, dropping before the card landed on", () => {
    const drop = resolveListDrop("c", "a", lanes());
    expect(drop?.listId).toBe("backlog");
    expect(drop?.moved).toBe(false);
    expect(drop?.orderedCards.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("moves a card to another list at the target's slot", () => {
    const drop = resolveListDrop("a", "y", lanes());
    expect(drop?.listId).toBe("doing");
    expect(drop?.moved).toBe(true);
    expect(drop?.orderedCards.map((c) => c.id)).toEqual(["x", "a", "y"]);
  });

  it("appends when dropped on the lane itself", () => {
    const drop = resolveListDrop("a", laneDroppableId("doing"), lanes());
    expect(drop?.orderedCards.map((c) => c.id)).toEqual(["x", "y", "a"]);
  });

  it("moves into an empty list", () => {
    const drop = resolveListDrop("a", laneDroppableId("done"), lanes());
    expect(drop).toMatchObject({ listId: "done", moved: true });
    expect(drop?.orderedCards.map((c) => c.id)).toEqual(["a"]);
  });

  it("keeps a recurring card among the recurring cards", () => {
    const drop = resolveListDrop("r1", "y", lanes());
    expect(drop?.listId).toBe("doing");
    expect(drop?.orderedCards.map((c) => c.id)).toEqual(["r1"]);
  });

  it("is a no-op when the card lands where it already sits", () => {
    expect(resolveListDrop("a", "a", lanes())).toBeNull();
    expect(resolveListDrop("a", "b", lanes())).toBeNull();
  });

  it("returns null for unknown cards or lists", () => {
    expect(resolveListDrop("nope", "a", lanes())).toBeNull();
    expect(resolveListDrop("a", laneDroppableId("nope"), lanes())).toBeNull();
  });
});

describe("listDropAssignments", () => {
  it("reshuffles the slots the lane already holds, in the new order", () => {
    // Cards at 1, 2, 5 reordered to c, a, b → c takes 1, a takes 2, b takes 5.
    const drop = resolveListDrop("c", "a", lanes())!;
    expect(listDropAssignments(drop.orderedCards)).toEqual([
      { id: "c", position: 1 },
      { id: "a", position: 2 },
      { id: "b", position: 5 },
    ]);
  });

  it("brings the moved card's own slot into the target lane", () => {
    // "a" (slot 1) joins x (3) and y (4), so the lane holds slots 1, 3, 4 and
    // the new order x, a, y takes them in turn — y already sits at 4, so only
    // the two that actually move are written.
    const drop = resolveListDrop("a", "y", lanes())!;
    expect(listDropAssignments(drop.orderedCards)).toEqual([
      { id: "x", position: 1 },
      { id: "a", position: 3 },
    ]);
  });

  it("writes nothing when the order is unchanged", () => {
    expect(listDropAssignments([card("a", "backlog", 1), card("b", "backlog", 2)])).toEqual([]);
  });
});
