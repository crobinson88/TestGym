import { describe, expect, it } from "vitest";
import type { LocalTdlItem } from "./types";
import {
  avoidanceScore,
  isReluctantCandidate,
  RELUCTANT_STALE_DAYS,
  suggestReluctant,
} from "./reluctantSuggest";

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

describe("isReluctantCandidate", () => {
  it("suggests an open task that has sat untouched past the stale bar", () => {
    expect(isReluctantCandidate(item({ origin_snapshot_date: "2026-09-10" }), DAY)).toBe(true);
  });

  it("suggests an overdue task even if it was only just added", () => {
    expect(
      isReluctantCandidate(item({ origin_snapshot_date: DAY, due_date: "2026-09-14" }), DAY),
    ).toBe(true);
  });

  it("suggests a task due soon even when fresh (mirror of snooze, which holds these back)", () => {
    expect(
      isReluctantCandidate(item({ origin_snapshot_date: DAY, due_date: "2026-09-18" }), DAY),
    ).toBe(true);
  });

  it("leaves a fresh task with no deadline alone", () => {
    expect(isReluctantCandidate(item({ origin_snapshot_date: "2026-09-15" }), DAY)).toBe(false);
  });

  it("keeps a ranked priority in — a dreaded-but-important task belongs here", () => {
    expect(
      isReluctantCandidate(item({ priority_rank: 1, origin_snapshot_date: "2026-08-01" }), DAY),
    ).toBe(true);
  });

  it("never suggests a task already on the list", () => {
    expect(
      isReluctantCandidate(item({ is_reluctant: true, origin_snapshot_date: "2026-08-01" }), DAY),
    ).toBe(false);
  });

  it.each(["worked_today", "ready_for_testing", "paused", "done", "cancelled"] as const)(
    "never suggests a %s task",
    (status) => {
      expect(isReluctantCandidate(item({ status, origin_snapshot_date: "2026-08-01" }), DAY)).toBe(
        false,
      );
    },
  );

  it("never suggests a recurring, archived, deleted or already-snoozed task", () => {
    const old = { origin_snapshot_date: "2026-08-01" };
    expect(isReluctantCandidate(item({ ...old, is_recurring: true }), DAY)).toBe(false);
    expect(isReluctantCandidate(item({ ...old, is_archived: true }), DAY)).toBe(false);
    expect(isReluctantCandidate(item({ ...old, deleted_at: "2026-09-15" }), DAY)).toBe(false);
    expect(isReluctantCandidate(item({ ...old, snoozed_until: "2026-09-20" }), DAY)).toBe(false);
  });
});

describe("avoidanceScore", () => {
  it("scores staleness as the base", () => {
    expect(avoidanceScore(item({ origin_snapshot_date: "2026-09-10" }), DAY)).toBe(6);
  });

  it("weighs a blown deadline double on top of staleness", () => {
    // 6 days stale + 2 days overdue * 2 = 10.
    const score = avoidanceScore(
      item({ origin_snapshot_date: "2026-09-10", due_date: "2026-09-14" }),
      DAY,
    );
    expect(score).toBe(10);
  });

  it("bumps a big task and a looming deadline", () => {
    // fresh (0 stale) + due-soon (+3) + big >=60 (+3).
    const score = avoidanceScore(
      item({ origin_snapshot_date: DAY, due_date: "2026-09-18", time_estimate_min: 90 }),
      DAY,
    );
    expect(score).toBe(6);
  });
});

describe("suggestReluctant", () => {
  it("returns the most-avoided first with its top signal", () => {
    const rows = [
      item({ id: "a", origin_snapshot_date: "2026-09-12", title: "Newer" }),
      item({ id: "b", origin_snapshot_date: "2026-08-20", title: "Ancient" }),
      item({ id: "c", origin_snapshot_date: DAY, title: "Fresh" }),
      item({ id: "d", origin_snapshot_date: DAY, due_date: "2026-09-10", title: "Overdue" }),
    ];
    const out = suggestReluctant(rows, DAY);
    // b: 27 stale. d: 0 stale + 6 overdue*2 = 12. a: 4 stale. c: dropped (fresh, no deadline).
    expect(out.map((s) => s.item.id)).toEqual(["b", "d", "a"]);
    expect(out[0]).toMatchObject({ reason: "stale", stale: 27 });
    expect(out[1]).toMatchObject({ reason: "overdue", overdue: 6 });
  });

  it("is empty when the day is in good shape", () => {
    expect(suggestReluctant([item({ origin_snapshot_date: DAY })], DAY)).toEqual([]);
  });

  it("uses the stale bar as the floor for an undated task", () => {
    const justUnder = item({ origin_snapshot_date: "2026-09-14", title: "2 days" });
    const atBar = item({ origin_snapshot_date: "2026-09-13", title: "3 days" });
    expect(suggestReluctant([justUnder, atBar], DAY).map((s) => s.item.title)).toEqual([
      `${RELUCTANT_STALE_DAYS} days`,
    ]);
  });
});
