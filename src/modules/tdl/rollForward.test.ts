import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { v4 as uuid } from "uuid";
import { GymDB, type LocalTdlItem, type LocalTdlDay } from "@/lib/db";
import type { TdlItemRow, TdlSection } from "./types";
import { rollForward } from "./rollForward";

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
    is_priority: false,
    notes: null,
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

  it("does not carry done non-recurring items", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { status: "done", title: "Done task" }),
    ]);
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.created).toBe(0);
    expect(await listFor("2026-05-28")).toHaveLength(0);
  });

  it("does not carry cancelled items", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { status: "cancelled", title: "Cancelled" }),
    ]);
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.created).toBe(0);
    expect(await listFor("2026-05-28")).toHaveLength(0);
  });

  it("carries worked_today as open on the new day", async () => {
    await seed([
      makeItem("2026-05-27", "follow_ups", { status: "worked_today", title: "Mid-flight" }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    expect(next).toHaveLength(1);
    expect(next[0].status).toBe("open");
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

  it("preserves is_priority on carry", async () => {
    await seed([
      makeItem("2026-05-27", "product", {
        is_priority: true,
        title: "Hot",
        status: "open",
      }),
    ]);
    await rollForward("2026-05-27", "2026-05-28", { db });
    const next = await listFor("2026-05-28");
    expect(next[0].is_priority).toBe(true);
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

  it("seeds tdl_days for the new day, copying limiting_factor_date from previous day", async () => {
    await seed(
      [makeItem("2026-05-27", "follow_ups", { status: "open", title: "x" })],
      [
        {
          snapshot_date: "2026-05-27",
          limiting_factor_date: "2026-06-15",
          note: null,
          created_at: "2026-05-27T00:00:00.000Z",
          updated_at: "2026-05-27T00:00:00.000Z",
          deleted_at: null,
          sync_status: "synced",
        },
      ],
    );
    const r = await rollForward("2026-05-27", "2026-05-28", { db });
    expect(r.daySeeded).toBe(true);
    const newDay = await db.tdl_days.get("2026-05-28");
    expect(newDay?.limiting_factor_date).toBe("2026-06-15");
  });
});
