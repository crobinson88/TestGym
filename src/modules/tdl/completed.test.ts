import { describe, expect, it } from "vitest";

import {
  collectSweepCandidates,
  formatMinutes,
  groupByWeek,
  loggedThreadIds,
  matchesCompletionQuery,
  summariseWeek,
  sweepMinutes,
  weekLabel,
  weekOf,
  weekRange,
  weekRangeLabel,
  type CompletionLike,
  type SweepItem,
} from "./completed";

function entry(over: Partial<CompletionLike> = {}): CompletionLike {
  const completed_on = over.completed_on ?? "2026-09-30";
  return {
    id: over.id ?? "c1",
    kind: over.kind ?? "item",
    thread_id: over.thread_id ?? "t1",
    workstream_id: over.workstream_id ?? null,
    category_key: over.category_key ?? "product",
    title: over.title ?? "Ship the thing",
    completed_on,
    week_start: over.week_start ?? weekOf(completed_on),
    time_estimate_min: over.time_estimate_min ?? null,
    swept_items: over.swept_items ?? [],
    note: over.note ?? null,
    deleted_at: over.deleted_at ?? null,
  };
}

function sweepItem(over: Partial<SweepItem> = {}): SweepItem {
  return {
    id: over.id ?? "i1",
    origin_item_id: over.origin_item_id ?? null,
    snapshot_date: over.snapshot_date ?? "2026-09-30",
    section: over.section ?? "product",
    title: over.title ?? "Ship the thing",
    status: over.status ?? "done",
    time_estimate_min: over.time_estimate_min ?? null,
    workstream_id: over.workstream_id ?? null,
    is_recurring: over.is_recurring ?? false,
    deleted_at: over.deleted_at ?? null,
  };
}

describe("weekOf / weekRange", () => {
  it("files a date under its Monday", () => {
    expect(weekOf("2026-09-30")).toBe("2026-09-28"); // Wed -> Mon
    expect(weekOf("2026-09-28")).toBe("2026-09-28");
  });

  it("treats Sunday as the end of the week, not the start", () => {
    expect(weekOf("2026-10-04")).toBe("2026-09-28");
    expect(weekOf("2026-10-05")).toBe("2026-10-05");
  });

  it("spans Monday to Sunday", () => {
    expect(weekRange("2026-09-28")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });

  it("labels the span", () => {
    expect(weekRangeLabel("2026-09-28")).toBe("28 Sep – 04 Oct");
  });
});

describe("weekLabel", () => {
  const today = "2026-09-30";

  it("names the current and previous weeks", () => {
    expect(weekLabel("2026-09-28", today)).toBe("This week");
    expect(weekLabel("2026-09-21", today)).toBe("Last week");
  });

  it("falls back to the span for anything older", () => {
    expect(weekLabel("2026-09-14", today)).toBe("14 Sep – 20 Sep");
  });
});

describe("summariseWeek", () => {
  it("splits items from workstreams and counts what a workstream swept", () => {
    const s = summariseWeek([
      entry({ id: "a", time_estimate_min: 30 }),
      entry({
        id: "b",
        kind: "workstream",
        category_key: "product",
        time_estimate_min: 90,
        swept_items: [
          { item_id: "x", title: "One" },
          { item_id: "y", title: "Two" },
        ],
      }),
      entry({ id: "c", category_key: "tgm_tasks" }),
    ]);
    expect(s.total).toBe(3);
    expect(s.items).toBe(2);
    expect(s.workstreams).toBe(1);
    expect(s.sweptItems).toBe(2);
    expect(s.minutes).toBe(120);
    expect(s.byCategory).toEqual([
      { key: "product", count: 2 },
      { key: "tgm_tasks", count: 1 },
    ]);
  });

  it("is empty-safe", () => {
    expect(summariseWeek([]).total).toBe(0);
    expect(summariseWeek([]).minutes).toBe(0);
  });
});

describe("groupByWeek", () => {
  it("groups newest week first, newest completion first inside", () => {
    const weeks = groupByWeek([
      entry({ id: "a", completed_on: "2026-09-29" }),
      entry({ id: "b", completed_on: "2026-09-22" }),
      entry({ id: "c", completed_on: "2026-10-01" }),
    ]);
    expect(weeks.map((w) => w.week_start)).toEqual(["2026-09-28", "2026-09-21"]);
    expect(weeks[0].entries.map((e) => e.id)).toEqual(["c", "a"]);
  });

  it("files an entry under its stored week, not the day it was typed", () => {
    // Logged on 30 Sep against work finished the week before.
    const weeks = groupByWeek([
      entry({ id: "a", completed_on: "2026-09-24", week_start: "2026-09-21" }),
    ]);
    expect(weeks[0].week_start).toBe("2026-09-21");
  });

  it("drops soft-deleted entries", () => {
    const weeks = groupByWeek([
      entry({ id: "a" }),
      entry({ id: "b", deleted_at: "2026-09-30T10:00:00Z" }),
    ]);
    expect(weeks[0].entries.map((e) => e.id)).toEqual(["a"]);
  });

  it("carries a summary per week", () => {
    const weeks = groupByWeek([entry({ time_estimate_min: 45 })]);
    expect(weeks[0].summary.minutes).toBe(45);
  });
});

describe("matchesCompletionQuery", () => {
  it("matches the title, the note and a swept item title", () => {
    const e = entry({
      title: "Billing revamp",
      note: "shipped behind a flag",
      swept_items: [{ item_id: "x", title: "Invoice PDF" }],
    });
    expect(matchesCompletionQuery(e, "billing")).toBe(true);
    expect(matchesCompletionQuery(e, "FLAG")).toBe(true);
    expect(matchesCompletionQuery(e, "invoice")).toBe(true);
    expect(matchesCompletionQuery(e, "nope")).toBe(false);
  });

  it("an empty query matches everything", () => {
    expect(matchesCompletionQuery(entry(), "   ")).toBe(true);
  });
});

describe("loggedThreadIds", () => {
  it("collects live thread roots only", () => {
    const ids = loggedThreadIds([
      entry({ thread_id: "t1" }),
      entry({ thread_id: "t2", deleted_at: "2026-09-30T00:00:00Z" }),
    ]);
    expect([...ids]).toEqual(["t1"]);
  });
});

describe("collectSweepCandidates", () => {
  const range = weekRange("2026-09-28");

  it("offers done tasks inside the week", () => {
    const got = collectSweepCandidates(
      [
        sweepItem({ id: "a", snapshot_date: "2026-09-29" }),
        sweepItem({ id: "b", snapshot_date: "2026-10-04", title: "Zeta" }),
      ],
      [],
      range,
    );
    expect(got.map((c) => c.item.id)).toEqual(["a", "b"]);
  });

  it("skips anything not done, recurring, deleted or outside the week", () => {
    const got = collectSweepCandidates(
      [
        sweepItem({ id: "open", status: "open" }),
        sweepItem({ id: "cancelled", status: "cancelled" }),
        sweepItem({ id: "recurring", is_recurring: true }),
        sweepItem({ id: "deleted", deleted_at: "2026-09-30T00:00:00Z" }),
        sweepItem({ id: "lastweek", snapshot_date: "2026-09-27" }),
        sweepItem({ id: "nextweek", snapshot_date: "2026-10-05" }),
        sweepItem({ id: "keep" }),
      ],
      [],
      range,
    );
    expect(got.map((c) => c.item.id)).toEqual(["keep"]);
  });

  it("yields one candidate per task however many days it rolled through", () => {
    const rows = [
      sweepItem({ id: "d1", snapshot_date: "2026-09-28", status: "done" }),
      sweepItem({ id: "d2", snapshot_date: "2026-09-29", origin_item_id: "d1" }),
      sweepItem({ id: "d3", snapshot_date: "2026-09-30", origin_item_id: "d2" }),
    ];
    const got = collectSweepCandidates(rows, [], range);
    expect(got).toHaveLength(1);
    // The latest row, and the chain root as the log key.
    expect(got[0].item.id).toBe("d3");
    expect(got[0].threadId).toBe("d1");
  });

  it("reaches a chain root that sits before the week", () => {
    const inWeek = [sweepItem({ id: "d9", snapshot_date: "2026-09-29", origin_item_id: "d8" })];
    const all = [
      { id: "d7", origin_item_id: null },
      { id: "d8", origin_item_id: "d7" },
      { id: "d9", origin_item_id: "d8" },
    ];
    expect(collectSweepCandidates(inWeek, [], range, all)[0].threadId).toBe("d7");
  });

  it("skips a task already on the log", () => {
    const rows = [sweepItem({ id: "d1" })];
    expect(collectSweepCandidates(rows, [entry({ thread_id: "d1" })], range)).toEqual([]);
  });

  it("re-offers a task whose log entry was removed", () => {
    const rows = [sweepItem({ id: "d1" })];
    const removed = [entry({ thread_id: "d1", deleted_at: "2026-09-30T00:00:00Z" })];
    expect(collectSweepCandidates(rows, removed, range)).toHaveLength(1);
  });

  it("orders by category, then day, then title", () => {
    const got = collectSweepCandidates(
      [
        sweepItem({ id: "a", section: "tgm_tasks", snapshot_date: "2026-09-29" }),
        sweepItem({ id: "b", section: "product", snapshot_date: "2026-09-30", title: "Beta" }),
        sweepItem({ id: "c", section: "product", snapshot_date: "2026-09-30", title: "Alpha" }),
        sweepItem({ id: "d", section: "product", snapshot_date: "2026-09-28" }),
      ],
      [],
      range,
    );
    expect(got.map((c) => c.item.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("sweepMinutes / formatMinutes", () => {
  it("sums the ticked block lengths, treating no estimate as zero", () => {
    const got = sweepMinutes([
      { item: sweepItem({ time_estimate_min: 30 }), threadId: "a" },
      { item: sweepItem({ time_estimate_min: null }), threadId: "b" },
      { item: sweepItem({ time_estimate_min: 45 }), threadId: "c" },
    ]);
    expect(got).toBe(75);
  });

  it("formats hours and minutes", () => {
    expect(formatMinutes(0)).toBe("—");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(210)).toBe("3h 30m");
  });
});
