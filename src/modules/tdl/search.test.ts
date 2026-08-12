import { describe, expect, it } from "vitest";
import { v4 as uuid } from "uuid";
import type { LocalTdlItem } from "@/lib/db";
import type { TdlItemRow } from "./types";
import { matchesQuery } from "./search";

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

describe("matchesQuery", () => {
  it("matches everything when the query is empty or whitespace", () => {
    const item = makeItem({ title: "Call the plumber" });
    expect(matchesQuery(item, "")).toBe(true);
    expect(matchesQuery(item, "   ")).toBe(true);
  });

  it("matches on title, case-insensitively", () => {
    const item = makeItem({ title: "Call the Plumber" });
    expect(matchesQuery(item, "plumber")).toBe(true);
    expect(matchesQuery(item, "PLUMB")).toBe(true);
    expect(matchesQuery(item, "electrician")).toBe(false);
  });

  it("matches on notes when the title does not match", () => {
    const item = makeItem({ title: "Errand", notes: "Buy WD-40 for the hinge" });
    expect(matchesQuery(item, "hinge")).toBe(true);
  });

  it("ignores surrounding whitespace in the query", () => {
    const item = makeItem({ title: "Renew passport" });
    expect(matchesQuery(item, "  passport  ")).toBe(true);
  });

  it("handles null notes without throwing", () => {
    const item = makeItem({ title: "Task", notes: null });
    expect(matchesQuery(item, "task")).toBe(true);
    expect(matchesQuery(item, "nope")).toBe(false);
  });
});
