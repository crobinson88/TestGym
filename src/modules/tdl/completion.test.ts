import { describe, expect, it } from "vitest";
import { v4 as uuid } from "uuid";
import type { LocalTdlItem } from "@/lib/db";
import type { TdlItemRow, TdlSection, TdlStatus } from "./types";
import { dayCompletion, sectionStatusCounts } from "./hooks";
import { isResettable } from "./snooze";

const DATE = "2026-06-01";

function makeItem(over: Partial<TdlItemRow> = {}, section: TdlSection = "follow_ups"): LocalTdlItem {
  const ts = `${DATE}T08:00:00.000Z`;
  const row: TdlItemRow = {
    id: uuid(),
    snapshot_date: DATE,
    section,
    is_recurring: false,
    position: 0,
    title: "Task",
    due_date: null,
    time_estimate_min: null,
    status: "open",
    priority_rank: null,
    is_archived: false,
    snoozed_until: null,
    is_reluctant: false,
    reluctance_reason: null,
    notes: null,
    images: [],
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    ...over,
  };
  return { ...row, sync_status: "synced" };
}

describe("dayCompletion", () => {
  it("keeps a done item counted after it is archived", () => {
    const open = makeItem({ status: "open" });
    const doneThenArchived = makeItem({ status: "done", is_archived: true });
    const c = dayCompletion([open, doneThenArchived]);
    expect(c.total).toBe(2);
    expect(c.done).toBe(1);
    expect(c.active).toBe(1);
  });

  it("drops an archived item that was not done", () => {
    const open = makeItem({ status: "open" });
    const archivedOpen = makeItem({ status: "open", is_archived: true });
    const archivedWorked = makeItem({ status: "worked_today", is_archived: true });
    const c = dayCompletion([open, archivedOpen, archivedWorked]);
    expect(c.total).toBe(1);
    expect(c.done).toBe(0);
    expect(c.active).toBe(0);
  });

  it("counts a ranked done item toward the priority total even when archived", () => {
    const c = dayCompletion([
      makeItem({ status: "done", is_archived: true, priority_rank: 3 }),
    ]);
    expect(c.priorityTotal).toBe(1);
    expect(c.priorityActive).toBe(1);
  });

  it("tallies reluctant items by total vs done", () => {
    const c = dayCompletion([
      makeItem({ status: "open", is_reluctant: true }),
      makeItem({ status: "worked_today", is_reluctant: true }),
      makeItem({ status: "done", is_reluctant: true }),
      makeItem({ status: "done" }),
    ]);
    expect(c.reluctantTotal).toBe(3);
    expect(c.reluctantDone).toBe(1);
  });
});

describe("sectionStatusCounts", () => {
  it("tallies each status, excluding snoozed items", () => {
    const c = sectionStatusCounts([
      makeItem({ status: "open" }),
      makeItem({ status: "open" }),
      makeItem({ status: "worked_today" }),
      makeItem({ status: "done" }),
      makeItem({ status: "cancelled" }),
      makeItem({ status: "worked_today", snoozed_until: "2026-06-10" }),
    ]);
    expect(c).toEqual({ open: 2, inProgress: 1, testing: 0, done: 1, cancelled: 1 });
  });

  it("counts product testing items toward both in progress and testing", () => {
    const items = [
      makeItem({ status: "ready_for_testing" }, "product"),
      makeItem({ status: "worked_today" }, "product"),
    ];
    expect(sectionStatusCounts(items, true)).toMatchObject({ inProgress: 2, testing: 1 });
  });

  it("folds ready_for_testing into in progress for non-product sections", () => {
    const items = [makeItem({ status: "ready_for_testing" })];
    expect(sectionStatusCounts(items, false)).toMatchObject({ inProgress: 1, testing: 0 });
  });
});

describe("isResettable", () => {
  const cases: Array<[string, Partial<TdlItemRow>, boolean]> = [
    ["worked_today item resets", { status: "worked_today" }, true],
    ["done item resets", { status: "done" }, true],
    ["already-open item is skipped", { status: "open" }, false],
    ["archived item is skipped", { status: "done", is_archived: true }, false],
    [
      "snoozed item is skipped",
      { status: "done", snoozed_until: "2026-06-10" },
      false,
    ],
    [
      "deleted item is skipped",
      { status: "done", deleted_at: `${DATE}T09:00:00.000Z` },
      false,
    ],
    ["recurring item still resets", { status: "done", is_recurring: true }, true],
  ];

  it.each(cases)("%s", (_label, over, expected) => {
    expect(isResettable(makeItem(over as Partial<TdlItemRow> & { status: TdlStatus }))).toBe(
      expected,
    );
  });
});
