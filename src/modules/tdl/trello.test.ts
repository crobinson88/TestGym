import { describe, expect, it } from "vitest";
import type { LocalTdlItem } from "./types";
import {
  defaultCardDescription,
  describePushResults,
  draftFromItem,
  dueToIso,
  labelSwatch,
  labelText,
  latestPushByThread,
  parseTarget,
  pushBlocker,
  toggleId,
  toPushCards,
  type CardDraft,
  type PushedCard,
} from "./trello";

function item(over: Partial<LocalTdlItem> = {}): LocalTdlItem {
  return {
    id: "row-1",
    snapshot_date: "2026-11-11",
    section: "product",
    is_recurring: false,
    position: 0,
    title: "Ship the thing",
    due_date: null,
    time_estimate_min: null,
    status: "open",
    priority_rank: null,
    eisenhower_quadrant: null,
    is_archived: false,
    snoozed_until: null,
    is_reluctant: false,
    reluctance_reason: null,
    last_worked_at: null,
    notes: null,
    images: [],
    board_list_id: null,
    workstream_id: null,
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: "2026-11-11T08:00:00.000Z",
    updated_at: "2026-11-11T08:00:00.000Z",
    deleted_at: null,
    sync_status: "synced",
    ...over,
  } as LocalTdlItem;
}

function draft(over: Partial<CardDraft> = {}): CardDraft {
  return {
    itemId: "row-1",
    threadId: "root-1",
    include: true,
    name: "Ship it",
    desc: "",
    due: "",
    images: [],
    ...over,
  };
}

describe("defaultCardDescription", () => {
  it("carries the category, estimate and rank Trello has no field for", () => {
    expect(defaultCardDescription(item({ time_estimate_min: 30, priority_rank: 2 }), "Product")).toBe(
      "From to-do list · Product · 30 min · Priority 2",
    );
  });

  it("puts the notes first, then the meta line under a rule", () => {
    expect(defaultCardDescription(item({ notes: "  Check the copy  " }), "Product")).toBe(
      "Check the copy\n\n---\nFrom to-do list · Product",
    );
  });
});

describe("draftFromItem", () => {
  it("prefills name, due date and every image ticked", () => {
    const d = draftFromItem(
      item({ title: "Call Sam", due_date: "2026-11-20", images: ["tdl/a.jpg", "tdl/b.png"] }),
      "root-9",
      "Sales",
    );
    expect(d).toMatchObject({
      itemId: "row-1",
      threadId: "root-9",
      include: true,
      name: "Call Sam",
      due: "2026-11-20",
      images: [
        { path: "tdl/a.jpg", on: true },
        { path: "tdl/b.png", on: true },
      ],
    });
  });
});

describe("dueToIso", () => {
  it("lands a bare date at 09:00 local", () => {
    const iso = dueToIso("2026-11-20")!;
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(20);
    expect(d.getHours()).toBe(9);
  });

  it("is null for an empty or malformed date", () => {
    expect(dueToIso("")).toBeNull();
    expect(dueToIso("20/11/2026")).toBeNull();
  });
});

describe("toPushCards", () => {
  it("sends only ticked drafts, trimmed, with only the ticked images", () => {
    const cards = toPushCards([
      draft({
        name: "  Ship it ",
        due: "2026-11-20",
        images: [
          { path: "tdl/a.jpg", on: true },
          { path: "tdl/b.jpg", on: false },
        ],
      }),
      draft({ itemId: "row-2", include: false }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ itemId: "row-1", name: "Ship it", images: ["tdl/a.jpg"] });
    expect(cards[0].due).toBe(dueToIso("2026-11-20"));
  });

  it("sends no due date when it was cleared", () => {
    expect(toPushCards([draft({ due: "" })])[0].due).toBeNull();
  });
});

describe("pushBlocker", () => {
  it("asks for the board, then the list", () => {
    expect(pushBlocker(null, null, [draft()])).toBe("Pick a board");
    expect(pushBlocker("b", null, [draft()])).toBe("Pick a list");
  });

  it("needs something ticked, and a name on every ticked card", () => {
    expect(pushBlocker("b", "l", [draft({ include: false })])).toBe("Nothing ticked to push");
    expect(pushBlocker("b", "l", [draft({ name: "   " })])).toBe("Every card needs a name");
    expect(pushBlocker("b", "l", [draft(), draft({ include: false, name: "" })])).toBeNull();
  });
});

describe("latestPushByThread", () => {
  it("keeps the newest push per task chain", () => {
    const row = (thread: string, at: string, url: string): PushedCard => ({
      thread_id: thread,
      card_url: url,
      card_name: "x",
      board_name: null,
      list_name: null,
      created_at: at,
    });
    const map = latestPushByThread([
      row("t1", "2026-11-01T00:00:00Z", "old"),
      row("t1", "2026-11-05T00:00:00Z", "new"),
      row("t2", "2026-11-02T00:00:00Z", "only"),
    ]);
    expect(map.get("t1")?.card_url).toBe("new");
    expect(map.get("t2")?.card_url).toBe("only");
  });
});

describe("describePushResults", () => {
  it("counts created, failed and images that didn't attach", () => {
    expect(describePushResults([{ itemId: "a", ok: true }])).toBe("1 card created");
    expect(
      describePushResults([
        { itemId: "a", ok: true, attachFailed: 1 },
        { itemId: "b", ok: true },
        { itemId: "c", ok: false, error: "nope" },
      ]),
    ).toBe("2 cards created · 1 failed · 1 image didn't attach");
  });
});

describe("labels", () => {
  it("maps Trello colours, including dark/light variants, and falls back to grey", () => {
    expect(labelSwatch("green")).toBe(labelSwatch("green_dark"));
    expect(labelSwatch(null)).toBe(labelSwatch("nonsense"));
  });

  it("names an unnamed label by its colour", () => {
    expect(labelText({ id: "1", name: "Urgent", color: "red" })).toBe("Urgent");
    expect(labelText({ id: "1", name: "", color: "sky_light" })).toBe("sky light");
    expect(labelText({ id: "1", name: "", color: null })).toBe("No colour");
  });
});

describe("toggleId", () => {
  it("adds and removes", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("parseTarget", () => {
  it("reads a remembered board + list and shrugs off junk", () => {
    expect(parseTarget('{"boardId":"b","listId":"l"}')).toEqual({ boardId: "b", listId: "l" });
    expect(parseTarget("{not json")).toEqual({ boardId: null, listId: null });
    expect(parseTarget(null)).toEqual({ boardId: null, listId: null });
    expect(parseTarget('{"boardId":5}')).toEqual({ boardId: null, listId: null });
  });
});

