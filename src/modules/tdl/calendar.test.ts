import { describe, expect, it } from "vitest";
import type { TdlQuadrant } from "@/lib/database.types";
import type { SectionConfig } from "./sections";
import type { LocalTdlItem, TdlStatus } from "./types";
import {
  DEFAULT_DURATION_MIN,
  MAX_DURATION_MIN,
  MIN_DURATION_MIN,
  clampDuration,
  collectCalendarCandidates,
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
  it("gathers Priorities, Daily Tasks and Do First in that order", () => {
    const items = [
      item({ id: "p", title: "prio", priority_rank: 2 }),
      item({ id: "d", title: "daily", section: "daily-uuid" }),
      item({ id: "f", title: "dofirst", eisenhower_quadrant: "do_first" }),
    ];
    const out = collectCalendarCandidates(items, [DAILY]);
    expect(out.map((c) => [c.source, c.title])).toEqual([
      ["priorities", "prio"],
      ["daily_tasks", "daily"],
      ["do_first", "dofirst"],
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

  it("dedupes a Daily Task that is also Do First to daily_tasks", () => {
    const both = item({
      id: "y",
      title: "dt+df",
      section: "daily-uuid",
      eisenhower_quadrant: "do_first",
    });
    const out = collectCalendarCandidates([both], [DAILY]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("daily_tasks");
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

  it("returns nothing when no category is named Daily Tasks and no ranks/quadrants set", () => {
    const items = [item({ id: "a", section: "daily-uuid" })];
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
        { id: "a", title: "a", timeEstimateMin: null, source: "priorities" },
        { id: "b", title: "b", timeEstimateMin: 0, source: "priorities" },
      ],
      { date: "2026-07-27", startHour: 9 },
    );
    expect(events[0].durationMin).toBe(DEFAULT_DURATION_MIN);
    expect(events[1].durationMin).toBe(DEFAULT_DURATION_MIN);
  });

  it("rolls past midnight into the next day", () => {
    const events = scheduleEvents(
      [{ id: "a", title: "late", timeEstimateMin: 120, source: "priorities" }],
      { date: "2026-07-27", startHour: 23 },
    );
    expect(events[0].startDateTime).toBe("2026-07-27T23:00:00");
    expect(events[0].endDateTime).toBe("2026-07-28T01:00:00");
  });

  it("honours startMinutes for a sub-hour start", () => {
    const events = scheduleEvents(
      [
        { id: "a", title: "a", timeEstimateMin: 45, source: "priorities" },
        { id: "b", title: "b", timeEstimateMin: 30, source: "daily_tasks" },
      ],
      { date: "2026-07-27", startMinutes: 8 * 60 + 30 },
    );
    expect(events[0].startDateTime).toBe("2026-07-27T08:30:00");
    expect(events[0].endDateTime).toBe("2026-07-27T09:15:00");
    expect(events[1].startDateTime).toBe("2026-07-27T09:15:00");
  });

  it("prefers startMinutes over startHour when both are given", () => {
    const events = scheduleEvents(
      [{ id: "a", title: "a", timeEstimateMin: 30, source: "priorities" }],
      { date: "2026-07-27", startHour: 9, startMinutes: 10 * 60 + 15 },
    );
    expect(events[0].startDateTime).toBe("2026-07-27T10:15:00");
  });
});

describe("scheduleEvents around busy times", () => {
  const two = [
    { id: "a", title: "a", timeEstimateMin: 30, source: "priorities" as const },
    { id: "b", title: "b", timeEstimateMin: 30, source: "priorities" as const },
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
      [{ id: "a", title: "a", timeEstimateMin: 30, source: "priorities" }],
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
  const c = { title: "Send Reports", source: "priorities" as const };

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
    expect(matchesCandidateQuery({ title: "x", source: "daily_tasks" }, "daily")).toBe(true);
    expect(matchesCandidateQuery({ title: "x", source: "do_first" }, "priority")).toBe(false);
  });
});

describe("scheduleEvents with per-item overrides", () => {
  const two = [
    { id: "a", title: "a", timeEstimateMin: 30, source: "priorities" as const },
    { id: "b", title: "b", timeEstimateMin: 30, source: "priorities" as const },
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
