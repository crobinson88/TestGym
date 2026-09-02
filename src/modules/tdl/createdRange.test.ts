import { describe, expect, it } from "vitest";
import { v4 as uuid } from "uuid";
import type { LocalTdlItem } from "@/lib/db";
import type { TdlItemRow } from "./types";
import {
  CREATED_RANGE_PRESETS,
  createdDate,
  createdRangePreset,
  describeCreatedRange,
  isCreatedRangeActive,
  matchesCreatedRange,
  matchingPreset,
  normaliseCreatedRange,
} from "./createdRange";

function makeItem(over: Partial<TdlItemRow> = {}): LocalTdlItem {
  const ts = "2026-05-29T08:00:00.000Z";
  const row: TdlItemRow = {
    id: uuid(),
    snapshot_date: "2026-05-29",
    section: "tgm_tasks",
    is_recurring: false,
    position: 0,
    title: "Task",
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
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    ...over,
  };
  return { ...row, sync_status: "synced" };
}

describe("createdDate", () => {
  it("uses the origin day so rolled-forward copies keep the original added date", () => {
    const item = makeItem({ snapshot_date: "2026-06-10", origin_snapshot_date: "2026-05-29" });
    expect(createdDate(item)).toBe("2026-05-29");
  });

  it("falls back to the snapshot day for items that never rolled", () => {
    expect(createdDate(makeItem({ snapshot_date: "2026-06-10" }))).toBe("2026-06-10");
  });
});

describe("matchesCreatedRange", () => {
  const item = makeItem({ snapshot_date: "2026-06-10", origin_snapshot_date: "2026-05-29" });

  it("matches everything when both ends are empty", () => {
    expect(matchesCreatedRange(item, { from: null, to: null })).toBe(true);
  });

  it("includes both ends of the window", () => {
    expect(matchesCreatedRange(item, { from: "2026-05-29", to: "2026-05-29" })).toBe(true);
    expect(matchesCreatedRange(item, { from: "2026-05-01", to: "2026-05-29" })).toBe(true);
    expect(matchesCreatedRange(item, { from: "2026-05-29", to: "2026-06-30" })).toBe(true);
  });

  it("excludes items added outside the window", () => {
    expect(matchesCreatedRange(item, { from: "2026-05-30", to: "2026-06-30" })).toBe(false);
    expect(matchesCreatedRange(item, { from: "2026-05-01", to: "2026-05-28" })).toBe(false);
  });

  it("supports open-ended windows", () => {
    expect(matchesCreatedRange(item, { from: "2026-05-01", to: null })).toBe(true);
    expect(matchesCreatedRange(item, { from: "2026-06-01", to: null })).toBe(false);
    expect(matchesCreatedRange(item, { from: null, to: "2026-05-29" })).toBe(true);
    expect(matchesCreatedRange(item, { from: null, to: "2026-05-28" })).toBe(false);
  });

  it("swaps reversed ends instead of matching nothing", () => {
    expect(matchesCreatedRange(item, { from: "2026-06-30", to: "2026-05-01" })).toBe(true);
  });
});

describe("normaliseCreatedRange", () => {
  it("treats empty strings as open ends", () => {
    expect(normaliseCreatedRange({ from: "", to: "" })).toEqual({ from: null, to: null });
  });
});

describe("isCreatedRangeActive", () => {
  it("is false only when both ends are empty", () => {
    expect(isCreatedRangeActive({ from: null, to: null })).toBe(false);
    expect(isCreatedRangeActive({ from: "2026-05-01", to: null })).toBe(true);
    expect(isCreatedRangeActive({ from: null, to: "2026-05-01" })).toBe(true);
  });
});

describe("createdRangePreset", () => {
  const today = "2026-06-10";

  it("builds inclusive windows ending today", () => {
    expect(createdRangePreset("today", today)).toEqual({ from: today, to: today });
    expect(createdRangePreset("7d", today)).toEqual({ from: "2026-06-04", to: today });
    expect(createdRangePreset("30d", today)).toEqual({ from: "2026-05-12", to: today });
    expect(createdRangePreset("month", today)).toEqual({ from: "2026-06-01", to: today });
  });

  it("round-trips through matchingPreset", () => {
    for (const { key } of CREATED_RANGE_PRESETS) {
      expect(matchingPreset(createdRangePreset(key, today), today)).toBe(key);
    }
    expect(matchingPreset({ from: "2026-01-01", to: "2026-01-05" }, today)).toBeNull();
  });
});

describe("describeCreatedRange", () => {
  const today = "2026-06-10";

  it("names a preset window", () => {
    expect(describeCreatedRange(createdRangePreset("7d", today), today)).toBe("Last 7 days");
  });

  it("spells out a custom window", () => {
    expect(describeCreatedRange({ from: "2026-01-02", to: "2026-02-03" }, today)).toBe(
      "02 Jan – 03 Feb",
    );
    expect(describeCreatedRange({ from: "2026-01-02", to: "2026-01-02" }, today)).toBe("02 Jan");
    expect(describeCreatedRange({ from: "2026-01-02", to: null }, today)).toBe("From 02 Jan");
    expect(describeCreatedRange({ from: null, to: "2026-01-02" }, today)).toBe("Until 02 Jan");
  });

  it("reads as unfiltered when empty", () => {
    expect(describeCreatedRange({ from: null, to: null }, today)).toBe("Any date");
  });
});
