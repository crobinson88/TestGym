import { describe, expect, it } from "vitest";
import { v4 as uuid } from "uuid";
import type { LocalTdlItem } from "@/lib/db";
import type { TdlItemRow, TdlSection } from "./types";
import { selectSnoozed } from "./hooks";

function makeItem(
  snapshot_date: string,
  section: TdlSection,
  over: Partial<TdlItemRow> = {},
): LocalTdlItem {
  const ts = `${snapshot_date}T08:00:00.000Z`;
  const row: TdlItemRow = {
    id: uuid(),
    snapshot_date,
    section,
    is_recurring: false,
    position: 0,
    title: "Task",
    due_date: null,
    time_estimate_min: null,
    status: "open",
    priority_rank: null,
    is_archived: false,
    snoozed_until: null,
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

const TODAY = "2026-05-29";

describe("selectSnoozed", () => {
  it("includes items snoozed past today and excludes ones waking today or earlier", () => {
    const future = makeItem(TODAY, "follow_ups", { snoozed_until: "2026-06-01" });
    const wakesToday = makeItem(TODAY, "follow_ups", { snoozed_until: TODAY });
    const notSnoozed = makeItem(TODAY, "follow_ups", { snoozed_until: null });
    const out = selectSnoozed([future, wakesToday, notSnoozed], TODAY);
    expect(out.map((i) => i.id)).toEqual([future.id]);
  });

  it("excludes archived and deleted items", () => {
    const archived = makeItem(TODAY, "product", {
      snoozed_until: "2026-06-10",
      is_archived: true,
    });
    const deleted = makeItem(TODAY, "product", {
      snoozed_until: "2026-06-10",
      deleted_at: `${TODAY}T09:00:00.000Z`,
    });
    expect(selectSnoozed([archived, deleted], TODAY)).toEqual([]);
  });

  it("keeps only the tip of a roll-forward chain so a snoozed task shows once", () => {
    const day1 = makeItem("2026-05-27", "tgm_tasks", { snoozed_until: "2026-06-05" });
    const day2 = makeItem("2026-05-28", "tgm_tasks", {
      snoozed_until: "2026-06-05",
      origin_item_id: day1.id,
    });
    const day3 = makeItem("2026-05-29", "tgm_tasks", {
      snoozed_until: "2026-06-05",
      origin_item_id: day2.id,
    });
    const out = selectSnoozed([day1, day2, day3], TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(day3.id);
  });

  it("orders by section, then wake-up date", () => {
    const personal = makeItem(TODAY, "personal_other", { snoozed_until: "2026-06-01" });
    const weeklyLater = makeItem(TODAY, "weekly_goals", { snoozed_until: "2026-06-09" });
    const weeklySooner = makeItem(TODAY, "weekly_goals", { snoozed_until: "2026-06-02" });
    const out = selectSnoozed([personal, weeklyLater, weeklySooner], TODAY);
    expect(out.map((i) => i.id)).toEqual([weeklySooner.id, weeklyLater.id, personal.id]);
  });
});
