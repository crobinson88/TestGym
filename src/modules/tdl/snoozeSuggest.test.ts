import { describe, expect, it } from "vitest";
import type { LocalTdlItem } from "./types";
import {
  DEFAULT_SNOOZE_DAYS,
  horizonWake,
  isSnoozeCandidate,
  suggestSnoozes,
  suggestedWake,
} from "./snoozeSuggest";

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
    origin_item_id: null,
    origin_snapshot_date: "2026-09-01",
    created_at: `${DAY}T08:00:00.000Z`,
    updated_at: `${DAY}T08:00:00.000Z`,
    deleted_at: null,
    client_id: null,
    user_id: null,
    sync_status: "synced",
    ...over,
  } as LocalTdlItem;
}

describe("isSnoozeCandidate", () => {
  it("suggests an open task that has sat untouched past the stale bar", () => {
    expect(isSnoozeCandidate(item({ origin_snapshot_date: "2026-09-10" }), DAY)).toBe(true);
  });

  it("leaves a task added in the last couple of days alone", () => {
    expect(isSnoozeCandidate(item({ origin_snapshot_date: "2026-09-15" }), DAY)).toBe(false);
  });

  it("counts from the last time the task was worked, not when it was added", () => {
    const worked = item({
      origin_snapshot_date: "2026-08-01",
      last_worked_at: "2026-09-15T09:00:00.000Z",
    });
    expect(isSnoozeCandidate(worked, DAY)).toBe(false);
  });

  it("suggests a paused task whatever its age", () => {
    expect(
      isSnoozeCandidate(item({ status: "paused", origin_snapshot_date: DAY }), DAY),
    ).toBe(true);
  });

  it.each(["worked_today", "ready_for_testing", "done", "cancelled"] as const)(
    "never suggests a %s task",
    (status) => {
      expect(isSnoozeCandidate(item({ status, origin_snapshot_date: "2026-08-01" }), DAY)).toBe(
        false,
      );
    },
  );

  it("never suggests a ranked priority", () => {
    expect(
      isSnoozeCandidate(item({ priority_rank: 1, origin_snapshot_date: "2026-08-01" }), DAY),
    ).toBe(false);
  });

  it("never suggests a reluctant task — the flag means do it anyway", () => {
    expect(
      isSnoozeCandidate(item({ is_reluctant: true, origin_snapshot_date: "2026-08-01" }), DAY),
    ).toBe(false);
  });

  it("never suggests a recurring, archived, deleted or already-snoozed task", () => {
    const old = { origin_snapshot_date: "2026-08-01" };
    expect(isSnoozeCandidate(item({ ...old, is_recurring: true }), DAY)).toBe(false);
    expect(isSnoozeCandidate(item({ ...old, is_archived: true }), DAY)).toBe(false);
    expect(isSnoozeCandidate(item({ ...old, deleted_at: "2026-09-15" }), DAY)).toBe(false);
    expect(isSnoozeCandidate(item({ ...old, snoozed_until: "2026-09-20" }), DAY)).toBe(false);
  });

  it("holds back anything due inside the next few days", () => {
    const old = { origin_snapshot_date: "2026-08-01" };
    expect(isSnoozeCandidate(item({ ...old, due_date: "2026-09-18" }), DAY)).toBe(false);
    expect(isSnoozeCandidate(item({ ...old, due_date: "2026-09-12" }), DAY)).toBe(false);
    expect(isSnoozeCandidate(item({ ...old, due_date: "2026-09-30" }), DAY)).toBe(true);
  });
});

describe("suggestedWake", () => {
  it("defaults to a week out", () => {
    expect(suggestedWake(item(), DAY)).toBe("2026-09-23");
  });

  it("honours a caller-supplied horizon", () => {
    expect(suggestedWake(item(), DAY, 3)).toBe("2026-09-19");
    expect(suggestedWake(item(), DAY, DEFAULT_SNOOZE_DAYS)).toBe("2026-09-23");
  });

  it("wakes a dated task shortly before it is due", () => {
    expect(suggestedWake(item({ due_date: "2026-10-09" }), DAY)).toBe("2026-10-07");
  });

  it("never lands on or before the item's own day", () => {
    expect(suggestedWake(item({ due_date: "2026-09-17" }), DAY, 7)).toBe("2026-09-17");
    expect(suggestedWake(item(), DAY, 0)).toBe("2026-09-17");
  });
});

describe("suggestSnoozes", () => {
  it("returns the most-stalled first and pre-fills each wake-up date", () => {
    const rows = [
      item({ id: "a", origin_snapshot_date: "2026-09-12", title: "Newer" }),
      item({ id: "b", origin_snapshot_date: "2026-08-20", title: "Ancient" }),
      item({ id: "c", origin_snapshot_date: DAY, title: "Fresh" }),
      item({ id: "d", origin_snapshot_date: "2026-09-01", due_date: "2026-10-01", title: "Dated" }),
    ];
    const out = suggestSnoozes(rows, DAY);
    expect(out.map((s) => s.item.id)).toEqual(["b", "d", "a"]);
    expect(out[0]).toMatchObject({ reason: "stale", stale: 27, until: "2026-09-23" });
    expect(out[1].until).toBe("2026-09-29");
  });

  it("tags a paused task with its own reason", () => {
    const out = suggestSnoozes([item({ status: "paused", origin_snapshot_date: DAY })], DAY);
    expect(out).toHaveLength(1);
    expect(out[0].reason).toBe("paused");
  });

  it("is empty when the day is in good shape", () => {
    expect(suggestSnoozes([item({ origin_snapshot_date: DAY })], DAY)).toEqual([]);
  });
});

describe("horizonWake", () => {
  it("re-dates an undated task to the horizon", () => {
    expect(horizonWake(item(), DAY, 14)).toBe("2026-09-30");
  });

  it("never pushes a dated task past what its due date allows", () => {
    expect(horizonWake(item({ due_date: "2026-09-25" }), DAY, 30)).toBe("2026-09-23");
  });

  it("keeps the horizon when it lands before the due-date wake", () => {
    expect(horizonWake(item({ due_date: "2026-12-01" }), DAY, 7)).toBe("2026-09-23");
  });
});
