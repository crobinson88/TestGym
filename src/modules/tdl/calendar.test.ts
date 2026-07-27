import { describe, expect, it } from "vitest";
import type { TdlQuadrant } from "@/lib/database.types";
import type { SectionConfig } from "./sections";
import type { LocalTdlItem, TdlStatus } from "./types";
import {
  DEFAULT_DURATION_MIN,
  collectCalendarCandidates,
  minutesToTime,
  parseTimeToMinutes,
  scheduleEvents,
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
