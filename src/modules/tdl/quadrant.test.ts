import { describe, expect, it } from "vitest";
import type { TdlQuadrant } from "@/lib/database.types";
import type { LocalTdlItem } from "./types";
import {
  QUADRANTS,
  QUADRANT_BY_KEY,
  groupByQuadrant,
  quadrantOrder,
  selectDoFirstItems,
} from "./quadrant";

function item(quadrant: TdlQuadrant | null, over: Partial<LocalTdlItem> = {}): LocalTdlItem {
  return {
    id: `${quadrant ?? "none"}-${over.position ?? 0}-${Math.round((over.position ?? 0) * 0)}`,
    snapshot_date: "2026-07-16",
    section: "product",
    is_recurring: false,
    position: 0,
    title: "Task",
    due_date: null,
    time_estimate_min: null,
    status: "open",
    priority_rank: null,
    eisenhower_quadrant: quadrant,
    is_archived: false,
    snoozed_until: null,
    is_reluctant: false,
    reluctance_reason: null,
    last_worked_at: null,
    notes: null,
    images: [],
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: "2026-07-16T08:00:00.000Z",
    updated_at: "2026-07-16T08:00:00.000Z",
    deleted_at: null,
    sync_status: "synced",
    ...over,
  };
}

describe("QUADRANTS", () => {
  it("covers the four urgent/important combinations exactly once", () => {
    const combos = QUADRANTS.map((q) => `${q.urgent}-${q.important}`);
    expect(new Set(combos).size).toBe(4);
    expect(QUADRANT_BY_KEY.do_first).toMatchObject({ urgent: true, important: true });
    expect(QUADRANT_BY_KEY.eliminate).toMatchObject({ urgent: false, important: false });
  });
});

describe("quadrantOrder", () => {
  it("orders the quadrants most-actionable first and unclassified last", () => {
    expect(quadrantOrder("do_first")).toBeLessThan(quadrantOrder("schedule"));
    expect(quadrantOrder("schedule")).toBeLessThan(quadrantOrder("delegate"));
    expect(quadrantOrder("delegate")).toBeLessThan(quadrantOrder("eliminate"));
    expect(quadrantOrder(null)).toBeGreaterThan(quadrantOrder("eliminate"));
  });
});

describe("groupByQuadrant", () => {
  it("returns groups in fixed order with unclassified last", () => {
    const items = [
      item("eliminate", { position: 0 }),
      item(null, { position: 1 }),
      item("do_first", { position: 2 }),
      item("delegate", { position: 3 }),
    ];
    const groups = groupByQuadrant(items);
    expect(groups.map((g) => g.key)).toEqual(["do_first", "delegate", "eliminate", null]);
  });

  it("omits empty quadrants", () => {
    const groups = groupByQuadrant([item("schedule"), item("schedule")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("schedule");
    expect(groups[0].items).toHaveLength(2);
  });

  it("preserves the incoming item order within a group", () => {
    const a = item("do_first", { position: 0, title: "a" });
    const b = item("do_first", { position: 1, title: "b" });
    const groups = groupByQuadrant([b, a]);
    expect(groups[0].items.map((i) => i.title)).toEqual(["b", "a"]);
  });

  it("labels the unclassified bucket and gives it no hint", () => {
    const groups = groupByQuadrant([item(null)]);
    expect(groups[0].label).toBe("Unclassified");
    expect(groups[0].hint).toBeNull();
  });

  it("returns nothing for an empty list", () => {
    expect(groupByQuadrant([])).toEqual([]);
  });
});

describe("selectDoFirstItems", () => {
  it("keeps only do_first items", () => {
    const items = [
      item("do_first", { position: 0, title: "a" }),
      item("schedule", { position: 1, title: "b" }),
      item(null, { position: 2, title: "c" }),
      item("do_first", { position: 3, title: "d" }),
    ];
    expect(selectDoFirstItems(items).map((i) => i.title)).toEqual(["a", "d"]);
  });

  it("orders ranked items first (1 → 10), then the rest by position", () => {
    const items = [
      item("do_first", { position: 2, title: "unranked-late", priority_rank: null }),
      item("do_first", { position: 0, title: "rank3", priority_rank: 3 }),
      item("do_first", { position: 5, title: "unranked-early", priority_rank: null }),
      item("do_first", { position: 9, title: "rank1", priority_rank: 1 }),
    ];
    // rank1, rank3, then unranked by position (2 before 5).
    expect(selectDoFirstItems(items).map((i) => i.title)).toEqual([
      "rank1",
      "rank3",
      "unranked-late",
      "unranked-early",
    ]);
  });

  it("returns an empty list when nothing is do_first", () => {
    expect(selectDoFirstItems([item("eliminate"), item(null)])).toEqual([]);
  });
});
