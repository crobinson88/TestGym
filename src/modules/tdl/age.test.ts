import { describe, expect, it } from "vitest";
import {
  ageDays,
  ageLevel,
  daysStale,
  isWorkedStatus,
  lastActivityDate,
  nextLastWorkedAt,
} from "./age";
import type { LocalTdlItem } from "./types";

function item(partial: Partial<LocalTdlItem>): LocalTdlItem {
  return {
    id: "i1",
    snapshot_date: "2026-07-15",
    section: "personal",
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
    last_worked_at: null,
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:00:00.000Z",
    deleted_at: null,
    sync_status: "synced",
    ...partial,
  };
}

describe("daysStale", () => {
  it("counts whole days forward", () => {
    expect(daysStale("2026-07-12", "2026-07-15")).toBe(3);
    expect(daysStale("2026-07-15", "2026-07-15")).toBe(0);
  });
  it("clamps a future last-activity date to 0", () => {
    expect(daysStale("2026-07-20", "2026-07-15")).toBe(0);
  });
});

describe("isWorkedStatus", () => {
  it("counts progress statuses, not open or cancelled", () => {
    expect(isWorkedStatus("worked_today")).toBe(true);
    expect(isWorkedStatus("ready_for_testing")).toBe(true);
    expect(isWorkedStatus("done")).toBe(true);
    expect(isWorkedStatus("open")).toBe(false);
    expect(isWorkedStatus("cancelled")).toBe(false);
  });
});

describe("nextLastWorkedAt", () => {
  const now = "2026-07-15T10:00:00.000Z";

  it("stamps now when leaving open for a worked state", () => {
    expect(
      nextLastWorkedAt({ prevStatus: "open", nextStatus: "worked_today", prevLastWorked: null, now }),
    ).toBe(now);
    expect(
      nextLastWorkedAt({ prevStatus: "open", nextStatus: "done", prevLastWorked: null, now }),
    ).toBe(now);
  });

  it("does not stamp when leaving open for cancelled", () => {
    expect(
      nextLastWorkedAt({ prevStatus: "open", nextStatus: "cancelled", prevLastWorked: null, now }),
    ).toBeNull();
  });

  it("keeps the prior stamp when advancing past worked (not leaving open)", () => {
    const prior = "2026-07-13T08:00:00.000Z";
    expect(
      nextLastWorkedAt({ prevStatus: "worked_today", nextStatus: "done", prevLastWorked: prior, now }),
    ).toBe(prior);
  });

  it("keeps the prior stamp when reset back to open (reset doesn't count)", () => {
    const prior = "2026-07-13T08:00:00.000Z";
    expect(
      nextLastWorkedAt({ prevStatus: "worked_today", nextStatus: "open", prevLastWorked: prior, now }),
    ).toBe(prior);
    // From a done item too.
    expect(
      nextLastWorkedAt({ prevStatus: "done", nextStatus: "open", prevLastWorked: prior, now }),
    ).toBe(prior);
  });

  it("honours an explicit patched value over any inference", () => {
    expect(
      nextLastWorkedAt({
        prevStatus: "open",
        nextStatus: "worked_today",
        prevLastWorked: null,
        patchLastWorked: null,
        now,
      }),
    ).toBeNull();
  });
});

describe("lastActivityDate", () => {
  it("uses the worked date when present", () => {
    expect(lastActivityDate(item({ last_worked_at: "2026-07-13T09:30:00.000Z" }))).toBe(
      "2026-07-13",
    );
  });
  it("falls back to the origin (added) date when never worked", () => {
    expect(
      lastActivityDate(item({ last_worked_at: null, origin_snapshot_date: "2026-06-15" })),
    ).toBe("2026-06-15");
  });
  it("falls back to snapshot_date when there is no origin", () => {
    expect(
      lastActivityDate(item({ last_worked_at: null, origin_snapshot_date: null, snapshot_date: "2026-07-15" })),
    ).toBe("2026-07-15");
  });
});

describe("ageDays", () => {
  it("measures from the last worked date to the board day", () => {
    expect(ageDays(item({ last_worked_at: "2026-07-13T00:00:00.000Z", snapshot_date: "2026-07-15" }))).toBe(2);
  });
  it("measures from added date when never worked", () => {
    expect(ageDays(item({ origin_snapshot_date: "2026-07-14", snapshot_date: "2026-07-15" }))).toBe(1);
  });
});

describe("ageLevel", () => {
  it("is 0 the day it was worked", () => {
    expect(ageLevel(item({ last_worked_at: "2026-07-15T00:00:00.000Z" }))).toBe(0);
  });
  it("escalates one tier per day up to 3", () => {
    expect(ageLevel(item({ origin_snapshot_date: "2026-07-14" }))).toBe(1);
    expect(ageLevel(item({ origin_snapshot_date: "2026-07-13" }))).toBe(2);
    expect(ageLevel(item({ origin_snapshot_date: "2026-07-12" }))).toBe(3);
    expect(ageLevel(item({ origin_snapshot_date: "2026-06-01" }))).toBe(3);
  });
  it("never marks done or cancelled items urgent", () => {
    expect(ageLevel(item({ origin_snapshot_date: "2026-06-01", status: "done" }))).toBe(0);
    expect(ageLevel(item({ origin_snapshot_date: "2026-06-01", status: "cancelled" }))).toBe(0);
  });
  it("re-freshens after being worked, ignoring the older added date", () => {
    // Added long ago but worked yesterday → only 1 day stale.
    expect(
      ageLevel(item({ origin_snapshot_date: "2026-06-01", last_worked_at: "2026-07-14T12:00:00.000Z" })),
    ).toBe(1);
  });
});
