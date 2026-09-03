import { describe, expect, it } from "vitest";
import type { TdlQuadrant } from "@/lib/database.types";
import type { SectionConfig } from "./sections";
import type { LocalTdlItem, TdlStatus } from "./types";
import {
  DEFAULT_DURATION_MIN,
  applyCandidateOrder,
  reorderByStep,
  reorderForDrop,
  snapMinutes,
  MAX_DURATION_MIN,
  MIN_DURATION_MIN,
  clampDuration,
  collectCalendarCandidates,
  googleCalendarDayUrl,
  layoutLanes,
  matchesCandidateQuery,
  mergeBusy,
  minutesToTime,
  parseTimeToMinutes,
  prettyDuration,
  prettyHourLabel,
  prettyMinutes,
  scheduleEvents,
  timelineRange,
} from "./calendar";

function item(over: Partial<LocalTdlItem> = {}): LocalTdlItem {
  return {
    id: over.id ?? `id-${over.title ?? over.position ?? "x"}`,
    snapshot_date: "2026-07-27",
    section: "product",
    is_recurring: false,
    position: 0,
    title: "Task",
    due_date: null,
    time_estimate_min: null,
    status: "open" as TdlStatus,
    priority_rank: null,
    eisenhower_quadrant: null as TdlQuadrant | null,
    is_archived: false,
    snoozed_until: null,
    is_reluctant: false,
    reluctance_reason: null,
    last_worked_at: null,
    notes: null,
    images: [],
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: "2026-07-27T08:00:00.000Z",
    updated_at: "2026-07-27T08:00:00.000Z",
    deleted_at: null,
    sync_status: "synced",
    ...over,
  };
}

function cat(key: string, label: string): SectionConfig {
  return { key, label, hasDueDate: true, hasTimeEstimate: true, recurringSeeds: [] };
}

const DAILY = cat("daily-uuid", "Daily Tasks");

describe("collectCalendarCandidates", () => {
  it("gathers Priorities, Do First then Daily Tasks in that order", () => {
    const items = [
      item({ id: "p", title: "prio", priority_rank: 2 }),
      item({ id: "d", title: "daily", section: "daily-uuid" }),
      item({ id: "f", title: "dofirst", eisenhower_quadrant: "do_first" }),
    ];
    const out = collectCalendarCandidates(items, [DAILY]);
    expect(out.map((c) => [c.source, c.title])).toEqual([
      ["priorities", "prio"],
      ["do_first", "dofirst"],
      ["daily_tasks", "daily"],
    ]);
  });

  it("lists the remaining categories after the headline groups, in board order", () => {
    const items = [
      item({ id: "p", title: "prio", section: "product", priority_rank: 1 }),
      item({ id: "d", title: "daily", section: "daily-uuid" }),
      item({ id: "t", title: "tgm", section: "tgm" }),
      item({ id: "q", title: "product", section: "product" }),
    ];
    const out = collectCalendarCandidates(items, [
      DAILY,
      cat("tgm", "TGM Tasks"),
      cat("product", "Product"),
    ]);
    expect(out.map((c) => [c.sourceLabel, c.title])).toEqual([
      ["Priority", "prio"],
      ["Daily Task", "daily"],
      ["TGM Tasks", "tgm"],
      ["Product", "product"],
    ]);
  });

  it("sorts a category's items by board position", () => {
    const items = [
      item({ id: "b", title: "second", section: "tgm", position: 2 }),
      item({ id: "a", title: "first", section: "tgm", position: 1 }),
    ];
    const out = collectCalendarCandidates(items, [DAILY, cat("tgm", "TGM Tasks")]);
    expect(out.map((c) => c.title)).toEqual(["first", "second"]);
  });

  it("puts items whose category is gone in Uncategorised, last", () => {
    const items = [
      item({ id: "a", title: "orphan", section: "deleted-uuid" }),
      item({ id: "b", title: "tgm", section: "tgm" }),
    ];
    const out = collectCalendarCandidates(items, [DAILY, cat("tgm", "TGM Tasks")]);
    expect(out.map((c) => [c.sourceLabel, c.title])).toEqual([
      ["TGM Tasks", "tgm"],
      ["Uncategorised", "orphan"],
    ]);
  });

  it("orders Priorities by rank (1 → 10)", () => {
    const items = [
      item({ id: "a", title: "r3", priority_rank: 3 }),
      item({ id: "b", title: "r1", priority_rank: 1 }),
    ];
    expect(collectCalendarCandidates(items, [DAILY]).map((c) => c.title)).toEqual(["r1", "r3"]);
  });

  it("dedupes an item in multiple groups, keeping its highest source", () => {
    // A ranked item that is also in Daily Tasks and tagged do_first.
    const both = item({
      id: "x",
      title: "multi",
      priority_rank: 1,
      section: "daily-uuid",
      eisenhower_quadrant: "do_first",
    });
    const out = collectCalendarCandidates([both], [DAILY]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("priorities");
  });

  it("dedupes a Daily Task that is also Do First to do_first", () => {
    const both = item({
      id: "y",
      title: "dt+df",
      section: "daily-uuid",
      eisenhower_quadrant: "do_first",
    });
    const out = collectCalendarCandidates([both], [DAILY]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("do_first");
  });

  it("dedupes a categorised item that is also ranked to priorities", () => {
    const both = item({ id: "z", title: "ranked tgm", section: "tgm", priority_rank: 1 });
    const out = collectCalendarCandidates([both], [DAILY, cat("tgm", "TGM Tasks")]);
    expect(out).toHaveLength(1);
    expect(out[0].sourceLabel).toBe("Priority");
  });

  it("matches the Daily Tasks category by label, case-insensitively", () => {
    const items = [item({ id: "d", title: "daily", section: "dt-key" })];
    expect(collectCalendarCandidates(items, [cat("dt-key", "  DAILY tasks ")])).toHaveLength(1);
  });

  it("skips done and cancelled items", () => {
    const items = [
      item({ id: "a", title: "done", priority_rank: 1, status: "done" }),
      item({ id: "b", title: "cancelled", priority_rank: 2, status: "cancelled" }),
      item({ id: "c", title: "open", priority_rank: 3, status: "open" }),
    ];
    expect(collectCalendarCandidates(items, [DAILY]).map((c) => c.title)).toEqual(["open"]);
  });

  it("returns nothing when the day has no actionable items", () => {
    const items = [item({ id: "a", section: "daily-uuid", status: "done" })];
    expect(collectCalendarCandidates(items, [])).toEqual([]);
  });
});

describe("scheduleEvents", () => {
  it("lays events back-to-back from the start hour using each estimate", () => {
    const candidates = collectCalendarCandidates(
      [
        item({ id: "p", title: "prio", priority_rank: 1, time_estimate_min: 60 }),
        item({ id: "d", title: "daily", section: "daily-uuid", time_estimate_min: 15 }),
      ],
      [DAILY],
    );
    const events = scheduleEvents(candidates, { date: "2026-07-27", startHour: 9 });
    expect(events[0]).toMatchObject({
      title: "prio",
      startDateTime: "2026-07-27T09:00:00",
      endDateTime: "2026-07-27T10:00:00",
      durationMin: 60,
    });
    expect(events[1]).toMatchObject({
      title: "daily",
      startDateTime: "2026-07-27T10:00:00",
      endDateTime: "2026-07-27T10:15:00",
      durationMin: 15,
    });
  });

  it("falls back to the default duration when the estimate is missing or zero", () => {
    const events = scheduleEvents(
      [
        { id: "a", title: "a", timeEstimateMin: null, source: "priorities", sourceLabel: "Priority" },
        { id: "b", title: "b", timeEstimateMin: 0, source: "priorities", sourceLabel: "Priority" },
      ],
      { date: "2026-07-27", startHour: 9 },
    );
    expect(events[0].durationMin).toBe(DEFAULT_DURATION_MIN);
    expect(events[1].durationMin).toBe(DEFAULT_DURATION_MIN);
  });

  it("rolls past midnight into the next day", () => {
    const events = scheduleEvents(
      [{ id: "a", title: "late", timeEstimateMin: 120, source: "priorities", sourceLabel: "Priority" }],
      { date: "2026-07-27", startHour: 23 },
    );
    expect(events[0].startDateTime).toBe("2026-07-27T23:00:00");
    expect(events[0].endDateTime).toBe("2026-07-28T01:00:00");
  });

  it("honours startMinutes for a sub-hour start", () => {
    const events = scheduleEvents(
      [
        { id: "a", title: "a", timeEstimateMin: 45, source: "priorities", sourceLabel: "Priority" },
        { id: "b", title: "b", timeEstimateMin: 30, source: "daily_tasks", sourceLabel: "Daily Task" },
      ],
      { date: "2026-07-27", startMinutes: 8 * 60 + 30 },
    );
    expect(events[0].startDateTime).toBe("2026-07-27T08:30:00");
    expect(events[0].endDateTime).toBe("2026-07-27T09:15:00");
    expect(events[1].startDateTime).toBe("2026-07-27T09:15:00");
  });

  it("prefers startMinutes over startHour when both are given", () => {
    const events = scheduleEvents(
      [{ id: "a", title: "a", timeEstimateMin: 30, source: "priorities", sourceLabel: "Priority" }],
      { date: "2026-07-27", startHour: 9, startMinutes: 10 * 60 + 15 },
    );
    expect(events[0].startDateTime).toBe("2026-07-27T10:15:00");
  });
});

describe("scheduleEvents around busy times", () => {
  const two = [
    { id: "a", title: "a", timeEstimateMin: 30, source: "priorities" as const, sourceLabel: "Priority" },
    { id: "b", title: "b", timeEstimateMin: 30, source: "priorities" as const, sourceLabel: "Priority" },
  ];

  it("pushes a clashing block to the end of the busy interval", () => {
    // 9:00 start, but 9:00–9:45 is booked → first block starts 9:45.
    const events = scheduleEvents(two, {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      busy: [{ start: 9 * 60, end: 9 * 60 + 45 }],
    });
    expect(events[0].startDateTime).toBe("2026-07-27T09:45:00");
    expect(events[0].endDateTime).toBe("2026-07-27T10:15:00");
    // Second block is back-to-back after the first, still clear.
    expect(events[1].startDateTime).toBe("2026-07-27T10:15:00");
  });

  it("leaves the start untouched when the slot is already free", () => {
    const events = scheduleEvents(two, {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      busy: [{ start: 14 * 60, end: 15 * 60 }],
    });
    expect(events[0].startDateTime).toBe("2026-07-27T09:00:00");
    expect(events[1].startDateTime).toBe("2026-07-27T09:30:00");
  });

  it("hops over a busy interval that falls mid-chain", () => {
    // a: 9:00–9:30 (free). Next cursor 9:30 but 9:30–10:00 booked → b at 10:00.
    const events = scheduleEvents(two, {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      busy: [{ start: 9 * 60 + 30, end: 10 * 60 }],
    });
    expect(events[0].startDateTime).toBe("2026-07-27T09:00:00");
    expect(events[1].startDateTime).toBe("2026-07-27T10:00:00");
    expect(events[1].endDateTime).toBe("2026-07-27T10:30:00");
  });

  it("skips past several adjacent busy blocks in one hop", () => {
    const events = scheduleEvents(
      [{ id: "a", title: "a", timeEstimateMin: 30, source: "priorities", sourceLabel: "Priority" }],
      {
        date: "2026-07-27",
        startMinutes: 9 * 60,
        busy: [
          { start: 9 * 60, end: 9 * 60 + 30 },
          { start: 9 * 60 + 30, end: 10 * 60 },
        ],
      },
    );
    expect(events[0].startDateTime).toBe("2026-07-27T10:00:00");
  });
});

describe("mergeBusy", () => {
  it("sorts, merges overlapping/touching intervals and drops empties", () => {
    expect(
      mergeBusy([
        { start: 600, end: 660 },
        { start: 540, end: 600 },
        { start: 630, end: 720 },
        { start: 800, end: 800 },
        { start: 900, end: 930 },
      ]),
    ).toEqual([
      { start: 540, end: 720 },
      { start: 900, end: 930 },
    ]);
  });
});

describe("time helpers", () => {
  it("parses valid HH:MM into minutes-from-midnight", () => {
    expect(parseTimeToMinutes("09:00")).toBe(540);
    expect(parseTimeToMinutes("08:30")).toBe(510);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("23:59")).toBe(23 * 60 + 59);
    expect(parseTimeToMinutes(" 7:05 ")).toBe(7 * 60 + 5);
  });

  it("rejects malformed or out-of-range times", () => {
    expect(parseTimeToMinutes("")).toBeNull();
    expect(parseTimeToMinutes("9")).toBeNull();
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("10:60")).toBeNull();
    expect(parseTimeToMinutes("abc")).toBeNull();
  });

  it("formats minutes back into HH:MM and round-trips", () => {
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(510)).toBe("08:30");
    expect(minutesToTime(0)).toBe("00:00");
    for (const t of ["09:00", "08:30", "23:59", "00:15"]) {
      expect(minutesToTime(parseTimeToMinutes(t)!)).toBe(t);
    }
  });
});

describe("prettyMinutes / prettyDuration", () => {
  it("renders a 12h clock label", () => {
    expect(prettyMinutes(9 * 60)).toBe("9:00 AM");
    expect(prettyMinutes(0)).toBe("12:00 AM");
    expect(prettyMinutes(12 * 60 + 5)).toBe("12:05 PM");
    expect(prettyMinutes(13 * 60 + 30)).toBe("1:30 PM");
  });

  it("wraps past midnight", () => {
    expect(prettyMinutes(25 * 60)).toBe("1:00 AM");
  });

  it("renders durations", () => {
    expect(prettyDuration(45)).toBe("45m");
    expect(prettyDuration(60)).toBe("1h");
    expect(prettyDuration(90)).toBe("1h 30m");
  });
});

describe("clampDuration", () => {
  it("keeps a sane block length", () => {
    expect(clampDuration(45)).toBe(45);
    expect(clampDuration(1)).toBe(MIN_DURATION_MIN);
    expect(clampDuration(-10)).toBe(MIN_DURATION_MIN);
    expect(clampDuration(99999)).toBe(MAX_DURATION_MIN);
    expect(clampDuration(32.4)).toBe(32);
    expect(clampDuration(Number.NaN)).toBe(DEFAULT_DURATION_MIN);
  });
});

describe("matchesCandidateQuery", () => {
  const c = { title: "Send Reports", sourceLabel: "Priority" };

  it("matches everything on an empty query", () => {
    expect(matchesCandidateQuery(c, "")).toBe(true);
    expect(matchesCandidateQuery(c, "   ")).toBe(true);
  });

  it("matches the title case-insensitively", () => {
    expect(matchesCandidateQuery(c, "repo")).toBe(true);
    expect(matchesCandidateQuery(c, "SEND")).toBe(true);
    expect(matchesCandidateQuery(c, "invoice")).toBe(false);
  });

  it("matches the source label", () => {
    expect(matchesCandidateQuery(c, "priority")).toBe(true);
    expect(matchesCandidateQuery({ title: "x", sourceLabel: "Daily Task" }, "daily")).toBe(true);
    expect(matchesCandidateQuery({ title: "x", sourceLabel: "Do First" }, "priority")).toBe(false);
  });

  it("matches a category name", () => {
    expect(
      matchesCandidateQuery({ title: "x", sourceLabel: "TGM Tasks" }, "tgm"),
    ).toBe(true);
  });
});

describe("scheduleEvents with per-item overrides", () => {
  const two = [
    { id: "a", title: "a", timeEstimateMin: 30, source: "priorities" as const, sourceLabel: "Priority" },
    { id: "b", title: "b", timeEstimateMin: 30, source: "priorities" as const, sourceLabel: "Priority" },
  ];

  it("uses a duration override instead of the estimate and reflows the chain", () => {
    const events = scheduleEvents(two, {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      overrides: { a: { durationMin: 90 } },
    });
    expect(events[0]).toMatchObject({ id: "a", durationMin: 90, startMinutes: 540 });
    expect(events[1]).toMatchObject({ id: "b", startMinutes: 630, durationMin: 30 });
  });

  it("clamps an out-of-range duration override", () => {
    const events = scheduleEvents(two.slice(0, 1), {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      overrides: { a: { durationMin: 99999 } },
    });
    expect(events[0].durationMin).toBe(MAX_DURATION_MIN);
  });

  it("ignores a null or zero override and falls back to the estimate", () => {
    const events = scheduleEvents(two.slice(0, 1), {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      overrides: { a: { durationMin: null, startMinutes: null } },
    });
    expect(events[0]).toMatchObject({ durationMin: 30, startMinutes: 540, pinned: false });
  });

  it("pins a block to the given start and flags it", () => {
    const events = scheduleEvents(two, {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      overrides: { b: { startMinutes: 14 * 60 } },
    });
    const b = events.find((e) => e.id === "b")!;
    expect(b).toMatchObject({
      pinned: true,
      startMinutes: 14 * 60,
      startDateTime: "2026-07-27T14:00:00",
      endDateTime: "2026-07-27T14:30:00",
    });
    expect(events.find((e) => e.id === "a")!.startMinutes).toBe(9 * 60);
  });

  it("routes flowing blocks around a pinned one", () => {
    // a flows from 9:00 but b is pinned to 9:00–9:30, so a lands at 9:30.
    const events = scheduleEvents(two, {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      overrides: { b: { startMinutes: 9 * 60 } },
    });
    expect(events.find((e) => e.id === "b")!.startMinutes).toBe(9 * 60);
    expect(events.find((e) => e.id === "a")!.startMinutes).toBe(9 * 60 + 30);
  });

  it("returns events in chronological order", () => {
    const events = scheduleEvents(two, {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      overrides: { a: { startMinutes: 16 * 60 } },
    });
    expect(events.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("still honours calendar busy time alongside a pin", () => {
    const events = scheduleEvents(two, {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      busy: [{ start: 9 * 60, end: 10 * 60 }],
      overrides: { a: { startMinutes: 8 * 60 } },
    });
    // a keeps its explicit 8:00 even though it is before the start time;
    // b flows past the 9–10 meeting.
    expect(events.map((e) => [e.id, e.startMinutes])).toEqual([
      ["a", 8 * 60],
      ["b", 10 * 60],
    ]);
  });

  it("exposes start/end minutes for every event", () => {
    const events = scheduleEvents(two.slice(0, 1), { date: "2026-07-27", startMinutes: 9 * 60 });
    expect(events[0]).toMatchObject({ startMinutes: 540, endMinutes: 570, pinned: false });
  });
});

describe("timelineRange", () => {
  it("snaps out to whole hours around the blocks", () => {
    expect(
      timelineRange([{ start: 9 * 60 + 15, end: 17 * 60 + 20 }], { from: 9 * 60 + 15 }),
    ).toEqual({ start: 9 * 60, end: 18 * 60 });
  });

  it("keeps a minimum span when the day is nearly empty", () => {
    expect(timelineRange([], { from: 9 * 60 })).toEqual({ start: 9 * 60, end: 13 * 60 });
    expect(timelineRange([], { from: 9 * 60, minSpanMin: 120 })).toEqual({
      start: 9 * 60,
      end: 11 * 60,
    });
  });

  it("includes a block that starts before the chosen start time", () => {
    expect(timelineRange([{ start: 7 * 60 + 30, end: 8 * 60 }], { from: 9 * 60 })).toEqual({
      start: 7 * 60,
      end: 13 * 60,
    });
  });

  it("never runs before midnight", () => {
    expect(timelineRange([{ start: 0, end: 30 }], { from: 0 }).start).toBe(0);
  });
});

describe("layoutLanes", () => {
  it("gives non-overlapping blocks a single lane each", () => {
    const out = layoutLanes([
      { start: 540, end: 570 },
      { start: 570, end: 600 },
    ]);
    expect(out.map((o) => [o.lane, o.lanes])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it("splits an overlapping pair into two lanes", () => {
    const out = layoutLanes([
      { start: 540, end: 620 },
      { start: 560, end: 600 },
    ]);
    expect(out.map((o) => [o.lane, o.lanes])).toEqual([
      [0, 2],
      [1, 2],
    ]);
  });

  it("widths the whole overlap cluster to its busiest point", () => {
    const out = layoutLanes([
      { start: 540, end: 660 },
      { start: 550, end: 570 },
      { start: 555, end: 565 },
    ]);
    expect(out.every((o) => o.lanes === 3)).toBe(true);
    expect(out.map((o) => o.lane)).toEqual([0, 1, 2]);
  });

  it("starts a fresh cluster once the previous one ends", () => {
    const out = layoutLanes([
      { start: 540, end: 600 },
      { start: 550, end: 590 },
      { start: 600, end: 630 },
    ]);
    expect(out.map((o) => o.lanes)).toEqual([2, 2, 1]);
  });

  it("preserves input order in the output", () => {
    const out = layoutLanes([
      { start: 700, end: 730 },
      { start: 540, end: 570 },
    ]);
    expect(out.map((o) => o.block.start)).toEqual([700, 540]);
  });

  it("reuses a lane freed by an earlier block", () => {
    const out = layoutLanes([
      { start: 540, end: 600 },
      { start: 550, end: 610 },
      { start: 600, end: 620 },
    ]);
    // Third block starts when the first ends → back into lane 0.
    expect(out[2].lane).toBe(0);
    expect(out.every((o) => o.lanes === 2)).toBe(true);
  });
});

describe("prettyHourLabel", () => {
  it("labels whole hours compactly", () => {
    expect(prettyHourLabel(9 * 60)).toBe("9 AM");
    expect(prettyHourLabel(12 * 60)).toBe("12 PM");
    expect(prettyHourLabel(0)).toBe("12 AM");
    expect(prettyHourLabel(17 * 60)).toBe("5 PM");
    expect(prettyHourLabel(25 * 60)).toBe("1 AM");
  });

  it("falls back to the full clock off the hour", () => {
    expect(prettyHourLabel(9 * 60 + 30)).toBe("9:30 AM");
  });
});

describe("snapMinutes", () => {
  it("snaps to the 5-minute grid", () => {
    expect(snapMinutes(542)).toBe(540);
    expect(snapMinutes(543)).toBe(545);
    expect(snapMinutes(547.5)).toBe(550);
  });

  it("never goes negative", () => {
    expect(snapMinutes(-30)).toBe(0);
  });
});

describe("applyCandidateOrder", () => {
  const list = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("leaves the list alone with no custom order", () => {
    expect(applyCandidateOrder(list, null).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(applyCandidateOrder(list, []).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("re-sequences to the given order", () => {
    expect(applyCandidateOrder(list, ["c", "a", "b"]).map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("sinks ids the order doesn't know about to the end, in list order", () => {
    const withNew = [...list, { id: "d" }, { id: "e" }];
    expect(applyCandidateOrder(withNew, ["c", "a"]).map((c) => c.id)).toEqual([
      "c",
      "a",
      "b",
      "d",
      "e",
    ]);
  });

  it("ignores ids in the order that aren't in the list", () => {
    expect(applyCandidateOrder(list, ["gone", "b", "a", "c"]).map((c) => c.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});

describe("reorderForDrop", () => {
  // Three back-to-back 30m blocks from 9am.
  const placed = [
    { id: "a", startMinutes: 540, endMinutes: 570 },
    { id: "b", startMinutes: 570, endMinutes: 600 },
    { id: "c", startMinutes: 600, endMinutes: 630 },
  ];
  const order = ["a", "b", "c"];

  it("keeps the order when the block barely moves", () => {
    expect(reorderForDrop(order, placed, "a", 545)).toEqual(["a", "b", "c"]);
  });

  it("swaps once the dragged block's middle passes the next one's", () => {
    // a dropped at 9:30 → its centre (9:45) is past b's centre (9:45 boundary).
    expect(reorderForDrop(order, placed, "a", 570)).toEqual(["b", "a", "c"]);
  });

  it("drops a block to the end of the day", () => {
    expect(reorderForDrop(order, placed, "a", 700)).toEqual(["b", "c", "a"]);
  });

  it("pulls a late block up to the front", () => {
    expect(reorderForDrop(order, placed, "c", 480)).toEqual(["c", "a", "b"]);
  });

  it("keeps unscheduled ids in place around the moved one", () => {
    expect(reorderForDrop(["a", "skipped", "b", "c"], placed, "c", 480)).toEqual([
      "c",
      "a",
      "skipped",
      "b",
    ]);
  });

  it("ignores a drag of an id it doesn't hold", () => {
    expect(reorderForDrop(order, placed, "zz", 480)).toEqual(["a", "b", "c"]);
  });

  it("re-flows every following block after the move", () => {
    const candidates = [
      { id: "a", title: "A", timeEstimateMin: 30, source: "priorities" as const, sourceLabel: "Priority" },
      { id: "b", title: "B", timeEstimateMin: 30, source: "priorities" as const, sourceLabel: "Priority" },
      { id: "c", title: "C", timeEstimateMin: 30, source: "priorities" as const, sourceLabel: "Priority" },
    ];
    const next = reorderForDrop(order, placed, "c", 480);
    const out = scheduleEvents(applyCandidateOrder(candidates, next), {
      date: "2026-07-27",
      startMinutes: 540,
    });
    expect(out.map((e) => [e.id, e.startMinutes])).toEqual([
      ["c", 540],
      ["a", 570],
      ["b", 600],
    ]);
  });
});

describe("reorderByStep", () => {
  const order = ["a", "b", "c"];
  const sequence = ["a", "b", "c"];

  it("moves a block one slot earlier", () => {
    expect(reorderByStep(order, sequence, "c", -1)).toEqual(["a", "c", "b"]);
  });

  it("moves a block one slot later", () => {
    expect(reorderByStep(order, sequence, "a", 1)).toEqual(["b", "a", "c"]);
  });

  it("stops at the ends of the day", () => {
    expect(reorderByStep(order, sequence, "a", -1)).toEqual(["a", "b", "c"]);
    expect(reorderByStep(order, sequence, "c", 1)).toEqual(["a", "b", "c"]);
  });

  it("steps over ids that aren't in the flowing sequence", () => {
    // "b" is pinned, so it isn't an anchor: "c" steps up past it to before "a".
    expect(reorderByStep(["a", "b", "c"], ["a", "c"], "c", -1)).toEqual(["c", "a", "b"]);
  });

  it("ignores an id or delta it can't act on", () => {
    expect(reorderByStep(order, sequence, "zz", -1)).toEqual(["a", "b", "c"]);
    expect(reorderByStep(order, sequence, "a", 0)).toEqual(["a", "b", "c"]);
  });
});


describe("scheduleEvents within a start/end window", () => {
  const c = (id: string, minutes: number) => ({
    id,
    title: id,
    timeEstimateMin: minutes,
    source: "priorities" as const,
    sourceLabel: "Priority",
  });

  it("leaves out a block that can't finish by the end time", () => {
    const events = scheduleEvents([c("a", 60), c("b", 60)], {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      endMinutes: 10 * 60 + 30,
    });
    expect(events.map((e) => e.id)).toEqual(["a"]);
  });

  it("keeps filling the tail of the day with tasks that still fit", () => {
    // "b" needs 3h and doesn't fit before 11:00, but the 30m "c" does.
    const events = scheduleEvents([c("a", 60), c("b", 180), c("c", 30)], {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      endMinutes: 11 * 60,
    });
    expect(events.map((e) => e.id)).toEqual(["a", "c"]);
    expect(events[1].startDateTime).toBe("2026-07-27T10:00:00");
  });

  it("drops a block whose only free slot starts too late", () => {
    const events = scheduleEvents([c("a", 60)], {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
      busy: [{ start: 9 * 60, end: 11 * 60 + 30 }],
    });
    expect(events).toEqual([]);
  });

  it("still places a block that the busy hop leaves room for", () => {
    const events = scheduleEvents([c("a", 30)], {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      endMinutes: 12 * 60,
      busy: [{ start: 9 * 60, end: 11 * 60 + 30 }],
    });
    expect(events[0].startDateTime).toBe("2026-07-27T11:30:00");
  });

  it("places a pinned block even when the user pins it past the window", () => {
    const events = scheduleEvents([c("a", 60)], {
      date: "2026-07-27",
      startMinutes: 9 * 60,
      endMinutes: 10 * 60,
      overrides: { a: { startMinutes: 21 * 60 } },
    });
    expect(events[0]).toMatchObject({ pinned: true, startDateTime: "2026-07-27T21:00:00" });
  });

  it("schedules nothing when the end is at or before the start", () => {
    expect(
      scheduleEvents([c("a", 30)], {
        date: "2026-07-27",
        startMinutes: 9 * 60,
        endMinutes: 9 * 60,
      }),
    ).toEqual([]);
  });

  it("is unbounded when no end time is given", () => {
    const events = scheduleEvents([c("a", 600), c("b", 600)], {
      date: "2026-07-27",
      startMinutes: 9 * 60,
    });
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("timelineRange with a window end", () => {
  it("draws through to the end of the scheduling window", () => {
    expect(timelineRange([{ start: 9 * 60, end: 10 * 60 }], { from: 9 * 60, to: 19 * 60 })).toEqual({
      start: 9 * 60,
      end: 19 * 60,
    });
  });

  it("still stretches past the window for a block that overruns it", () => {
    expect(
      timelineRange([{ start: 9 * 60, end: 20 * 60 + 10 }], { from: 9 * 60, to: 19 * 60 }),
    ).toEqual({ start: 9 * 60, end: 21 * 60 });
  });
});

describe("googleCalendarDayUrl", () => {
  it("links to the day view without a zero-padded month or day", () => {
    expect(googleCalendarDayUrl("2026-07-05")).toBe(
      "https://calendar.google.com/calendar/r/day/2026/7/5",
    );
  });

  it("falls back to the calendar root for an unparseable date", () => {
    expect(googleCalendarDayUrl("not-a-date")).toBe("https://calendar.google.com/calendar/r");
  });
});
