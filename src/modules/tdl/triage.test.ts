import { describe, expect, it } from "vitest";
import type { LocalTdlItem } from "./types";
import {
  addBusinessDays,
  collectTriageQueue,
  describeTriage,
  firstOfNextMonth,
  horizonDate,
  isTriageCandidate,
  isWeekend,
  nextMonday,
  summariseTriage,
  type TriageDecision,
} from "./triage";

// 2026-09-16 is a Wednesday.
const DAY = "2026-09-16";

function item(over: Partial<LocalTdlItem> = {}): LocalTdlItem {
  return {
    id: "row-1",
    snapshot_date: DAY,
    section: "follow_ups",
    is_recurring: false,
    position: 0,
    title: "Call Sam",
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
    origin_snapshot_date: DAY,
    created_at: `${DAY}T08:00:00.000Z`,
    updated_at: `${DAY}T08:00:00.000Z`,
    deleted_at: null,
    client_id: null,
    user_id: null,
    sync_status: "synced",
    ...over,
  } as LocalTdlItem;
}

function decision(over: Partial<TriageDecision> = {}): TriageDecision {
  return {
    id: "row-1",
    title: "Call Sam",
    action: "keep",
    before: { is_archived: false, deleted_at: null, snoozed_until: null },
    ...over,
  };
}

describe("isWeekend", () => {
  it("flags Saturday and Sunday only", () => {
    expect(isWeekend("2026-09-18")).toBe(false); // Fri
    expect(isWeekend("2026-09-19")).toBe(true); // Sat
    expect(isWeekend("2026-09-20")).toBe(true); // Sun
    expect(isWeekend("2026-09-21")).toBe(false); // Mon
  });
});

describe("addBusinessDays", () => {
  it("steps over the weekend", () => {
    expect(addBusinessDays("2026-09-16", 2)).toBe("2026-09-18"); // Wed → Fri
    expect(addBusinessDays("2026-09-17", 2)).toBe("2026-09-21"); // Thu → Mon
    expect(addBusinessDays("2026-09-18", 2)).toBe("2026-09-22"); // Fri → Tue
  });

  it("counts landings from a weekend day", () => {
    expect(addBusinessDays("2026-09-19", 2)).toBe("2026-09-22"); // Sat → Tue
    expect(addBusinessDays("2026-09-20", 2)).toBe("2026-09-22"); // Sun → Tue
  });
});

describe("nextMonday", () => {
  it("returns the Monday of the following week", () => {
    expect(nextMonday("2026-09-16")).toBe("2026-09-21"); // Wed
    expect(nextMonday("2026-09-21")).toBe("2026-09-28"); // Mon → a week on
    expect(nextMonday("2026-09-19")).toBe("2026-09-21"); // Sat
  });

  it("treats Sunday's next week as tomorrow", () => {
    expect(nextMonday("2026-09-20")).toBe("2026-09-21");
  });
});

describe("firstOfNextMonth", () => {
  it("rolls the month", () => {
    expect(firstOfNextMonth("2026-09-16")).toBe("2026-10-01");
    expect(firstOfNextMonth("2026-01-31")).toBe("2026-02-01");
  });

  it("rolls the year in December", () => {
    expect(firstOfNextMonth("2026-12-05")).toBe("2027-01-01");
  });
});

describe("horizonDate", () => {
  it("resolves each horizon off the day being triaged", () => {
    const it_ = item();
    expect(horizonDate(it_, DAY, "tomorrow")).toBe("2026-09-17");
    expect(horizonDate(it_, DAY, "two_business_days")).toBe("2026-09-18");
    expect(horizonDate(it_, DAY, "next_week")).toBe("2026-09-21");
    expect(horizonDate(it_, DAY, "next_month")).toBe("2026-10-01");
  });

  it("measures from the item's own day when it is later than the viewed day", () => {
    const future = item({ snapshot_date: "2026-09-30" });
    expect(horizonDate(future, DAY, "tomorrow")).toBe("2026-10-01");
    expect(horizonDate(future, DAY, "next_month")).toBe("2026-10-01");
  });

  it("never lands on or before the base day", () => {
    // A Sunday's "next week" is already the floor; nothing resolves earlier.
    for (const horizon of ["tomorrow", "two_business_days", "next_week", "next_month"] as const) {
      const wake = horizonDate(item({ snapshot_date: "2026-09-20" }), "2026-09-20", horizon);
      expect(wake > "2026-09-20").toBe(true);
    }
  });
});

describe("isTriageCandidate", () => {
  it("takes live, unfinished work", () => {
    expect(isTriageCandidate(item(), DAY)).toBe(true);
    expect(isTriageCandidate(item({ status: "worked_today" }), DAY)).toBe(true);
    expect(isTriageCandidate(item({ status: "ready_for_testing" }), DAY)).toBe(true);
    expect(isTriageCandidate(item({ status: "paused" }), DAY)).toBe(true);
  });

  it("skips anything already dealt with", () => {
    expect(isTriageCandidate(item({ status: "done" }), DAY)).toBe(false);
    expect(isTriageCandidate(item({ status: "cancelled" }), DAY)).toBe(false);
    expect(isTriageCandidate(item({ is_archived: true }), DAY)).toBe(false);
    expect(isTriageCandidate(item({ deleted_at: `${DAY}T09:00:00.000Z` }), DAY)).toBe(false);
    expect(isTriageCandidate(item({ snoozed_until: "2026-09-30" }), DAY)).toBe(false);
  });

  it("skips recurring tasks, which are re-cut every day", () => {
    expect(isTriageCandidate(item({ is_recurring: true }), DAY)).toBe(false);
  });

  it("counts a snooze that has already woken", () => {
    expect(isTriageCandidate(item({ snoozed_until: "2026-09-10" }), DAY)).toBe(true);
  });
});

describe("collectTriageQueue", () => {
  it("puts the most-stalled card first", () => {
    const fresh = item({ id: "fresh", title: "Fresh", origin_snapshot_date: DAY });
    const old = item({ id: "old", title: "Old", origin_snapshot_date: "2026-09-10" });
    const mid = item({ id: "mid", title: "Mid", origin_snapshot_date: "2026-09-14" });
    const queue = collectTriageQueue([fresh, old, mid], DAY);
    expect(queue.map((c) => c.item.id)).toEqual(["old", "mid", "fresh"]);
    expect(queue.map((c) => c.stale)).toEqual([6, 2, 0]);
  });

  it("breaks ties by category, then position, then title", () => {
    const a = item({ id: "a", section: "product", position: 1, title: "A" });
    const b = item({ id: "b", section: "admin", position: 5, title: "B" });
    const c = item({ id: "c", section: "product", position: 0, title: "C" });
    expect(collectTriageQueue([a, b, c], DAY).map((q) => q.item.id)).toEqual(["b", "c", "a"]);
  });

  it("drops non-candidates", () => {
    const queue = collectTriageQueue(
      [item({ id: "keep" }), item({ id: "done", status: "done" })],
      DAY,
    );
    expect(queue.map((c) => c.item.id)).toEqual(["keep"]);
  });
});

describe("summariseTriage / describeTriage", () => {
  it("tallies by action", () => {
    expect(
      summariseTriage([
        decision({ action: "keep" }),
        decision({ action: "keep" }),
        decision({ action: "snooze", until: "2026-09-21" }),
      ]),
    ).toEqual({ keep: 2, archive: 0, delete: 0, snooze: 1 });
  });

  it("names only the actions that happened", () => {
    expect(describeTriage([decision({ action: "keep" }), decision({ action: "delete" })])).toBe(
      "Triaged 2 tasks · 1 kept, 1 deleted",
    );
    expect(describeTriage([decision({ action: "archive" })])).toBe(
      "Triaged 1 task · 1 archived",
    );
    expect(describeTriage([])).toBe("Nothing triaged");
  });
});
