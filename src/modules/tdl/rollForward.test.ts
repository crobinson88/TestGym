import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v4 as uuid } from "uuid";
import { GymDB, type LocalTdlItem, type LocalTdlDay } from "@/lib/db";
import type { TdlItemRow, TdlSection } from "./types";
import {
  applyRollForward,
  buildRootMap,
  normaliseTitle,
  planRollForward,
  rollForward,
} from "./rollForward";

let db: GymDB;

beforeEach(async () => {
  db = new GymDB(`tdl-test-${uuid()}`);
  await db.open();
});

afterEach(async () => {
  if (db) await db.delete();
});

interface ItemOverride extends Partial<TdlItemRow> {}

function makeItem(
  snapshot_date: string,
  section: TdlSection,
  over: ItemOverride = {},
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
    origin_snapshot_date: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    ...over,
  };
  return { ...row, sync_status: "synced" };
}

async function seed(items: LocalTdlItem[], days: LocalTdlDay[] = []): Promise<void> {
  if (items.length > 0) await db.tdl_items.bulkPut(items);
  if (days.length > 0) await db.tdl_days.bulkPut(days);
}

async function listFor(date: string): Promise<LocalTdlItem[]> {
  const rows = await db.tdl_items.where("snapshot_date").equals(date).toArray();
  return rows.filter((r) => !r.deleted_at);
}

describe("rollForward", () => {
  it("does nothing when fromDate is empty", async () => {
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.created).toBe(0);
    expect(r.daySeeded).toBe(true);
    expect(await listFor("2026-05-28")).toHaveLength(0);
  });

  it("always carries recurring items and resets them to open", async () => {
    await seed([
      makeItem("2026-05-27", "tgm_tasks", {
        is_recurring: true,
        title: "TGM Email",
        status: "done",
        position: 0,
      }),
    ]);
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.created).toBe(1);
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("open");
    expect(next[0].is_recurring).toBe(true);
    expect(next[0].title).toBe("TGM Email");
  });

  it("carries done non-recurring items and preserves done status", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { status: "done", title: "Done task" }),
    ]);
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.created).toBe(1);
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("done");
  });

  it("carries cancelled items and preserves cancelled status", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { status: "cancelled", title: "Cancelled" }),
    ]);
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.created).toBe(1);
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("cancelled");
  });

  it("preserves worked_today status on the new day", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { status: "worked_today", title: "Mid-flight" }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("worked_today");
  });

  it("does not carry archived items", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", {
        status: "open",
        is_archived: true,
        title: "Archived",
      }),
    ]);
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.created).toBe(0);
    expect(await listFor("2026-05-28")).toHaveLength(0);
  });

  it("preserves snoozed_until on non-recurring carry", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", {
        status: "open",
        snoozed_until: "2026-06-10",
        title: "Snoozed",
      }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
    expect(next[0].snoozed_until).toBe("2026-06-10");
  });

  it("clears snoozed_until when carrying recurring items", async () => {
    await seed([
      makeItem("2026-05-27", "tgm_tasks", {
        is_recurring: true,
        status: "open",
        snoozed_until: "2026-06-10",
        title: "TGM Email",
      }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
    expect(next[0].snoozed_until).toBeNull();
  });

  it("carries ready_for_testing as ready_for_testing", async () => {
    await seed([
      makeItem("2026-05-27", "product", {
        status: "ready_for_testing",
        title: "QA me",
      }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("ready_for_testing");
  });

  it("preserves priority_rank on carry", async () => {
    await seed([
      makeItem("2026-05-27", "product", {
        priority_rank: 3,
        title: "Hot",
        status: "open",
      }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    expect(next[0].priority_rank).toBe(3);
  });

  it("preserves the Eisenhower quadrant on carry", async () => {
    await seed([
      makeItem("2026-05-27", "product", {
        eisenhower_quadrant: "do_first",
        title: "Urgent + important",
        status: "open",
      }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    expect(next[0].eisenhower_quadrant).toBe("do_first");
  });

  it("holds the quadrant across multiple rolls", async () => {
    await seed([
      makeItem("2026-05-04", "product", {
        eisenhower_quadrant: "schedule",
        title: "Long runner",
        status: "open",
      }),
    ]);
    await rollForward("2026-05-04", "2026-05-05", { db });
    await rollForward("2026-05-05", "2026-05-06", { db });
    const day6 = await listFor("2026-05-06");
    expect(day6).toHaveLength(1);
    expect(day6[0].eisenhower_quadrant).toBe("schedule");
  });

  it("carries the item's description (notes) forward", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", {
        status: "open",
        title: "Has a description",
        notes: "Remember to ping Sam first",
      }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
    expect(next[0].notes).toBe("Remember to ping Sam first");
  });

  it("carries the description across multiple rolls", async () => {
    await seed([
      makeItem("2026-05-04", "follow_ups", {
        status: "open",
        title: "Long runner",
        notes: "Carry me the whole way",
      }),
    ]);
    await rollForward("2026-05-04", "2026-05-05", { db });
    await rollForward("2026-05-05", "2026-05-06", { db });
    const day6 = await listFor("2026-05-06");
    expect(day6).toHaveLength(1);
    expect(day6[0].notes).toBe("Carry me the whole way");
  });

  it("is idempotent on repeated runs", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { status: "open", title: "Once" }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const second = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(second.created).toBe(0);
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
  });

  it("renumbers positions within each section without gaps", async () => {
    await seed([
      makeItem("2026-05-27", "product", {
        title: "A",
        position: 0,
        status: "open",
      }),
      makeItem("2026-05-27", "product", {
        title: "B",
        position: 5,
        status: "open",
      }),
      makeItem("2026-05-27", "product", {
        title: "C",
        position: 9,
        status: "open",
      }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    const positions = next
      .filter((r) => !r.is_recurring)
      .sort((a, b) => a.position - b.position)
      .map((r) => r.position);
    expect(positions).toEqual([0, 1, 2]);
  });

  it("preserves the original snapshot_date across multiple rolls", async () => {
    await seed([
      makeItem("2026-05-04", "follow_ups", { status: "open", title: "Long runner" }),
    ]);
    await rollForward("2026-05-04", "2026-05-05", { db });
    await rollForward("2026-05-05", "2026-05-06", { db });
    const day6 = await listFor("2026-05-06");
    expect(day6).toHaveLength(1);
    expect(day6[0].origin_snapshot_date).toBe("2026-05-04");
  });

  it("seeds an empty tdl_days row for the new day if one doesn't exist", async () => {
    await seed([makeItem("2026-05-27", "follow_ups", { status: "open", title: "x" })]);
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.daySeeded).toBe(true);
    const newDay = await db.tdl_days.get("2026-05-28");
    expect(newDay?.snapshot_date).toBe("2026-05-28");
  });
});


describe("buildRootMap", () => {
  it("resolves every row on a chain to the first row", () => {
    const rows = [
      { id: "a", origin_item_id: null },
      { id: "b", origin_item_id: "a" },
      { id: "c", origin_item_id: "b" },
    ];
    const roots = buildRootMap(rows);
    expect(roots.get("a")).toBe("a");
    expect(roots.get("b")).toBe("a");
    expect(roots.get("c")).toBe("a");
  });

  it("stops at the oldest row still held when the start has been purged", () => {
    const roots = buildRootMap([{ id: "c", origin_item_id: "gone" }]);
    expect(roots.get("c")).toBe("c");
  });

  it("does not loop on a cyclic chain", () => {
    const roots = buildRootMap([
      { id: "a", origin_item_id: "b" },
      { id: "b", origin_item_id: "a" },
    ]);
    expect(roots.get("a")).toBeDefined();
    expect(roots.get("b")).toBeDefined();
  });
});

describe("normaliseTitle", () => {
  it("ignores case and runs of whitespace", () => {
    expect(normaliseTitle("  Call   Sam ")).toBe(normaliseTitle("call sam"));
  });
});

describe("planRollForward", () => {
  it("carries everything when the target day is empty", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { title: "A" }),
      makeItem("2026-05-27", "product", { title: "B" }),
    ]);
    const plan = await planRollForward("2026-05-27", "2026-05-28", { db });
    expect(plan.carry).toHaveLength(2);
    expect(plan.duplicates).toHaveLength(0);
  });

  it("writes nothing", async () => {
    await seed([makeItem("2026-05-27", "follow_ups", { title: "A" })]);
    await planRollForward("2026-05-27", "2026-05-28", { db });
    expect(await listFor("2026-05-28")).toHaveLength(0);
    expect(await db.tdl_days.get("2026-05-28")).toBeUndefined();
  });

  it("flags a task that already reached the target day by a different path", async () => {
    // Made on the 4th, carried day by day to the 6th. Rolling the 4th forward
    // into the 6th would land the same task twice.
    await seed([makeItem("2026-05-04", "follow_ups", { title: "Long runner" })]);
    await rollForward("2026-05-04", "2026-05-05", { db });
    await rollForward("2026-05-05", "2026-05-06", { db });

    const plan = await planRollForward("2026-05-04", "2026-05-06", { db });
    expect(plan.carry).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0].reason).toBe("chain");
    expect(plan.duplicates[0].existing.snapshot_date).toBe("2026-05-06");
  });

  it("flags a same-title task in the same category as a duplicate", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { title: "Call Sam" }),
      makeItem("2026-05-28", "follow_ups", { title: "  call   sam " }),
    ]);
    const plan = await planRollForward("2026-05-27", "2026-05-28", { db });
    expect(plan.carry).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0].reason).toBe("title");
  });

  it("does not flag the same title in a different category", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { title: "Call Sam" }),
      makeItem("2026-05-28", "product", { title: "Call Sam" }),
    ]);
    const plan = await planRollForward("2026-05-27", "2026-05-28", { db });
    expect(plan.carry).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(0);
  });

  it("splits a mixed day into new tasks and duplicates", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { title: "Shared" }),
      makeItem("2026-05-27", "follow_ups", { title: "Only on the 27th", position: 1 }),
      makeItem("2026-05-28", "follow_ups", { title: "Shared" }),
    ]);
    const plan = await planRollForward("2026-05-27", "2026-05-28", { db });
    expect(plan.carry.map((r) => r.title)).toEqual(["Only on the 27th"]);
    expect(plan.duplicates.map((d) => d.row.title)).toEqual(["Shared"]);
  });

  it("can roll from any earlier day, not just the one before", async () => {
    await seed([makeItem("2026-05-01", "follow_ups", { title: "Old job" })]);
    const plan = await planRollForward("2026-05-01", "2026-05-20", { db });
    expect(plan.carry).toHaveLength(1);
    await applyRollForward("2026-05-20", plan.carry, { db });
    const next = await listFor("2026-05-20");
    expect(next).toHaveLength(1);
    expect(next[0].origin_snapshot_date).toBe("2026-05-01");
  });
});

describe("applyRollForward", () => {
  it("adds only the rows it is handed", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { title: "Shared" }),
      makeItem("2026-05-27", "follow_ups", { title: "New one", position: 1 }),
      makeItem("2026-05-28", "follow_ups", { title: "Shared" }),
    ]);
    const plan = await planRollForward("2026-05-27", "2026-05-28", { db });
    const r = await applyRollForward("2026-05-28", plan.carry, { db });
    expect(r.created).toBe(1);
    const titles = (await listFor("2026-05-28")).map((i) => i.title).sort();
    expect(titles).toEqual(["New one", "Shared"]);
  });

  it("adds a confirmed duplicate when the user accepts it", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { title: "Shared" }),
      makeItem("2026-05-28", "follow_ups", { title: "Shared" }),
    ]);
    const plan = await planRollForward("2026-05-27", "2026-05-28", { db });
    await applyRollForward("2026-05-28", plan.duplicates.map((d) => d.row), { db });
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(2);
    expect(next.every((i) => i.title === "Shared")).toBe(true);
  });

  it("renumbers positions across the merged day without gaps", async () => {
    await seed([
      makeItem("2026-05-27", "product", { title: "A", position: 4 }),
      makeItem("2026-05-28", "product", { title: "Z", position: 9 }),
    ]);
    const plan = await planRollForward("2026-05-27", "2026-05-28", { db });
    await applyRollForward("2026-05-28", plan.carry, { db });
    const positions = (await listFor("2026-05-28"))
      .map((r) => r.position)
      .sort((a, b) => a - b);
    expect(positions).toEqual([0, 1]);
  });
});

describe("rollForward duplicate handling", () => {
  it("holds back suspected duplicates and reports them as skipped", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { title: "Shared" }),
      makeItem("2026-05-27", "follow_ups", { title: "New one", position: 1 }),
      makeItem("2026-05-28", "follow_ups", { title: "Shared" }),
    ]);
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.created).toBe(1);
    expect(r.skipped).toBe(1);
    expect(await listFor("2026-05-28")).toHaveLength(2);
  });
});
