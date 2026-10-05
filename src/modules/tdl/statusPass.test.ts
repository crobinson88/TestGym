import { describe, expect, it } from "vitest";
import {
  collectStatusQueue,
  describeStatusPass,
  isNoOp,
  isStatusPassCandidate,
  summariseStatusPass,
  type StatusDecision,
} from "./statusPass";
import type { LocalTdlItem, TdlStatus } from "./types";

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

function decision(action: StatusDecision["action"], before: TdlStatus = "open"): StatusDecision {
  return {
    id: "row-1",
    title: "Call Sam",
    action,
    before: { status: before, last_worked_at: null },
  };
}

describe("isStatusPassCandidate", () => {
  it.each(["open", "worked_today", "ready_for_testing", "paused"] as const)(
    "takes a live %s task",
    (status) => {
      expect(isStatusPassCandidate(item({ status }), DAY)).toBe(true);
    },
  );

  it.each(["done", "cancelled"] as const)("leaves a settled %s task out", (status) => {
    expect(isStatusPassCandidate(item({ status }), DAY)).toBe(false);
  });

  it("includes recurring tasks, unlike triage", () => {
    expect(isStatusPassCandidate(item({ is_recurring: true }), DAY)).toBe(true);
  });

  it("leaves out anything off the board", () => {
    expect(isStatusPassCandidate(item({ is_archived: true }), DAY)).toBe(false);
    expect(isStatusPassCandidate(item({ deleted_at: `${DAY}T09:00:00.000Z` }), DAY)).toBe(false);
    expect(isStatusPassCandidate(item({ snoozed_until: "2026-09-20" }), DAY)).toBe(false);
  });

  it("takes a snooze that has already woken", () => {
    expect(isStatusPassCandidate(item({ snoozed_until: "2026-09-15" }), DAY)).toBe(true);
  });
});

describe("collectStatusQueue", () => {
  it("leads with ranked priorities in rank order", () => {
    const queue = collectStatusQueue(
      [
        item({ id: "unranked", title: "C" }),
        item({ id: "p3", title: "B", priority_rank: 3 }),
        item({ id: "p1", title: "A", priority_rank: 1 }),
      ],
      DAY,
    );
    expect(queue.map((c) => c.item.id)).toEqual(["p1", "p3", "unranked"]);
  });

  it("puts recurring dailies ahead of dated work among the unranked", () => {
    const queue = collectStatusQueue(
      [
        item({ id: "dated", section: "admin", position: 0 }),
        item({ id: "daily", section: "zzz", is_recurring: true, position: 9 }),
      ],
      DAY,
    );
    expect(queue.map((c) => c.item.id)).toEqual(["daily", "dated"]);
  });

  it("then follows the board's own order: category, position, title", () => {
    const queue = collectStatusQueue(
      [
        item({ id: "b1", section: "b", position: 1 }),
        item({ id: "b0", section: "b", position: 0 }),
        item({ id: "a0", section: "a", position: 5 }),
      ],
      DAY,
    );
    expect(queue.map((c) => c.item.id)).toEqual(["a0", "b0", "b1"]);
  });

  it("carries the days-since-progress for each card", () => {
    const queue = collectStatusQueue([item({ origin_snapshot_date: "2026-09-13" })], DAY);
    expect(queue[0].stale).toBe(3);
  });

  it("drops non-candidates", () => {
    expect(collectStatusQueue([item({ status: "done" })], DAY)).toEqual([]);
  });
});

describe("isNoOp", () => {
  it("treats a skip as a no-op", () => {
    expect(isNoOp(item({ status: "open" }), "skip")).toBe(true);
  });

  it("treats re-picking the current status as a confirmation, not a change", () => {
    expect(isNoOp(item({ status: "worked_today" }), "worked_today")).toBe(true);
  });

  it("is false for a real change", () => {
    expect(isNoOp(item({ status: "open" }), "done")).toBe(false);
  });
});

describe("summariseStatusPass", () => {
  it("counts writes and skips apart, and tallies the statuses set", () => {
    const t = summariseStatusPass([
      decision("done"),
      decision("done"),
      decision("worked_today"),
      decision("skip"),
      decision("open", "open"),
    ]);
    expect(t).toEqual({ updated: 3, skipped: 2, byStatus: { done: 2, worked_today: 1 } });
  });

  it("is all zeroes for an empty pass", () => {
    expect(summariseStatusPass([])).toEqual({ updated: 0, skipped: 0, byStatus: {} });
  });
});

describe("describeStatusPass", () => {
  it("names nothing when nothing was ruled on", () => {
    expect(describeStatusPass([])).toBe("Nothing updated");
  });

  it("says so when every card was skipped", () => {
    expect(describeStatusPass([decision("skip"), decision("skip")])).toBe(
      "Reviewed 2 tasks, none changed",
    );
  });

  it("lists the statuses set, commonest first", () => {
    expect(
      describeStatusPass([decision("done"), decision("done"), decision("worked_today")]),
    ).toBe("Updated 3 tasks · 2 done, 1 in progress");
  });

  it("appends the skipped count only when there were skips", () => {
    expect(describeStatusPass([decision("done"), decision("skip")])).toBe(
      "Updated 1 task · 1 done · 1 skipped",
    );
  });
});
