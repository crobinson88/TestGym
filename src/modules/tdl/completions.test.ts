import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Avoid constructing the real Supabase client (needs env) just to import the
// outbox poke; offline mode skips the drain anyway.
vi.mock("@/lib/sync", () => ({ syncEngine: { drain: () => Promise.resolve() } }));

import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import type { LocalTdlItem, LocalTdlWorkstream } from "@/lib/db";
import { addDays, todayIsoDate } from "@/lib/utils";
import type { TdlItemRow } from "./types";
import { createItem } from "./repo";
import { weekOf } from "./completed";
import {
  completeItems,
  completeWorkstream,
  logSweep,
  openWorkstreams,
  removeCompletion,
  reopenWorkstream,
  setCompletionNote,
} from "./completions";

// pokeOutbox() short-circuits when offline; keep the drain off the network.
beforeAll(() => {
  Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
});

afterEach(async () => {
  await db.tdl_items.clear();
  await db.tdl_completions.clear();
  await db.tdl_workstreams.clear();
});

const DAY = "2026-09-30"; // a Wednesday
const WEEK = "2026-09-28";

async function seed(over: Partial<TdlItemRow> = {}): Promise<LocalTdlItem> {
  return createItem({
    snapshot_date: over.snapshot_date ?? DAY,
    section: over.section ?? "product",
    title: over.title ?? "Ship the thing",
    ...over,
  });
}

async function seedWorkstream(over: Partial<LocalTdlWorkstream> = {}): Promise<LocalTdlWorkstream> {
  const row: LocalTdlWorkstream = {
    id: over.id ?? uuid(),
    category_key: over.category_key ?? "product",
    label: over.label ?? "Billing revamp",
    sort_order: over.sort_order ?? 0,
    completed_at: over.completed_at ?? null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    deleted_at: null,
    sync_status: "synced",
  };
  await db.tdl_workstreams.put(row);
  return row;
}

async function entries() {
  return (await db.tdl_completions.toArray()).filter((r) => !r.deleted_at);
}

describe("completeItems", () => {
  it("logs a snapshot and takes the task off the board", async () => {
    const item = await seed({ time_estimate_min: 45 });

    expect(await completeItems([item.id])).toBe(1);

    const [entry] = await entries();
    expect(entry).toMatchObject({
      kind: "item",
      thread_id: item.id,
      source_item_id: item.id,
      title: "Ship the thing",
      category_key: "product",
      completed_on: DAY,
      week_start: WEEK,
      time_estimate_min: 45,
      swept_items: [],
      sync_status: "pending",
    });

    const after = await db.tdl_items.get(item.id);
    expect(after).toMatchObject({ status: "done", is_archived: true, sync_status: "pending" });
  });

  it("keeps the snapshot after the task is renamed", async () => {
    const item = await seed({ title: "Original" });
    await completeItems([item.id]);
    const row = (await db.tdl_items.get(item.id))!;
    await db.tdl_items.put({ ...row, title: "Renamed" });

    expect((await entries())[0].title).toBe("Original");
  });

  it("clears a snooze so a completed task can't wake back up", async () => {
    const item = await seed({ snoozed_until: addDays(DAY, 5) });
    await completeItems([item.id]);
    expect((await db.tdl_items.get(item.id))!.snoozed_until).toBeNull();
  });

  it("is a no-op the second time", async () => {
    const item = await seed();
    expect(await completeItems([item.id])).toBe(1);
    expect(await completeItems([item.id])).toBe(0);
    expect(await entries()).toHaveLength(1);
  });

  it("logs a rolled-forward task once, keyed on the chain root", async () => {
    const d1 = await seed({ snapshot_date: "2026-09-28" });
    const d2 = await seed({
      snapshot_date: "2026-09-29",
      origin_item_id: d1.id,
      origin_snapshot_date: d1.snapshot_date,
    });
    const d3 = await seed({
      snapshot_date: DAY,
      origin_item_id: d2.id,
      origin_snapshot_date: d2.snapshot_date,
    });

    expect(await completeItems([d3.id])).toBe(1);
    expect((await entries())[0].thread_id).toBe(d1.id);
    // The same task reached through an earlier row is already logged.
    expect(await completeItems([d1.id])).toBe(0);
  });

  it("credits the day it is told to, filing the entry in that week", async () => {
    const item = await seed();
    await completeItems([item.id], "2026-09-24");
    expect((await entries())[0]).toMatchObject({
      completed_on: "2026-09-24",
      week_start: "2026-09-21",
    });
  });

  it("never logs a future-dated board as finished ahead of time", async () => {
    const tomorrow = addDays(todayIsoDate(), 1);
    const item = await seed({ snapshot_date: tomorrow });
    await completeItems([item.id]);
    expect((await entries())[0].completed_on).toBe(todayIsoDate());
  });

  it("fans out over a selection, skipping deleted rows", async () => {
    const a = await seed({ title: "A" });
    const b = await seed({ title: "B" });
    const gone = await seed({ title: "Gone" });
    await db.tdl_items.put({ ...gone, deleted_at: "2026-09-30T00:00:00Z" });

    expect(await completeItems([a.id, b.id, gone.id])).toBe(2);
    expect((await entries()).map((e) => e.title).sort()).toEqual(["A", "B"]);
  });
});

describe("completeWorkstream", () => {
  it("logs one entry with a snapshot of the tasks it closes", async () => {
    const ws = await seedWorkstream();
    const a = await seed({ title: "Invoice PDF", workstream_id: ws.id, time_estimate_min: 30 });
    const b = await seed({ title: "Dunning emails", workstream_id: ws.id, time_estimate_min: 60 });

    const res = await completeWorkstream(ws.id, DAY);
    expect(res?.swept).toBe(2);

    const [entry] = await entries();
    expect(entry).toMatchObject({
      kind: "workstream",
      thread_id: ws.id,
      workstream_id: ws.id,
      title: "Billing revamp",
      category_key: "product",
      completed_on: DAY,
      week_start: WEEK,
      time_estimate_min: 90,
    });
    expect(entry.swept_items.map((s) => s.title).sort()).toEqual(["Dunning emails", "Invoice PDF"]);

    for (const id of [a.id, b.id]) {
      expect(await db.tdl_items.get(id)).toMatchObject({ status: "done", is_archived: true });
    }
  });

  it("stands the workstream down rather than deleting it", async () => {
    const ws = await seedWorkstream();
    await completeWorkstream(ws.id, DAY);
    const after = (await db.tdl_workstreams.get(ws.id))!;
    expect(after.completed_at).toBeTruthy();
    expect(after.deleted_at).toBeNull();
    expect(openWorkstreams([after])).toEqual([]);
  });

  it("closes a task carried through the week once", async () => {
    const ws = await seedWorkstream();
    const d1 = await seed({ snapshot_date: "2026-09-28", workstream_id: ws.id });
    await seed({
      snapshot_date: DAY,
      workstream_id: ws.id,
      origin_item_id: d1.id,
      origin_snapshot_date: d1.snapshot_date,
    });

    const res = await completeWorkstream(ws.id, DAY);
    expect(res?.swept).toBe(1);
  });

  it("leaves a task that already has its own entry out of the sweep", async () => {
    const ws = await seedWorkstream();
    const solo = await seed({ title: "Logged already", workstream_id: ws.id });
    const other = await seed({ title: "Still open", workstream_id: ws.id });
    await completeItems([solo.id]);

    const res = await completeWorkstream(ws.id, DAY);
    expect(res?.swept).toBe(1);
    expect(res?.entry.swept_items[0].title).toBe("Still open");
    expect(await db.tdl_items.get(other.id)).toMatchObject({ status: "done" });
  });

  it("logs an empty workstream with no minutes", async () => {
    const ws = await seedWorkstream();
    const res = await completeWorkstream(ws.id, DAY);
    expect(res?.swept).toBe(0);
    expect(res?.entry.time_estimate_min).toBeNull();
  });

  it("refuses a second time", async () => {
    const ws = await seedWorkstream();
    await completeWorkstream(ws.id, DAY);
    await reopenWorkstream(ws.id);
    expect(await completeWorkstream(ws.id, DAY)).toBeNull();
  });
});

describe("removeCompletion", () => {
  it("takes an item entry off the log and unarchives the task onto today", async () => {
    const item = await seed({ snapshot_date: "2026-09-28" });
    await completeItems([item.id]);
    const [entry] = await entries();

    await removeCompletion(entry.id);

    expect(await entries()).toHaveLength(0);
    expect((await db.tdl_completions.get(entry.id))!.deleted_at).toBeTruthy();
    const after = (await db.tdl_items.get(item.id))!;
    expect(after.is_archived).toBe(false);
    expect(after.snapshot_date).toBe(todayIsoDate());
  });

  it("re-offers the task to a later sweep once its entry is gone", async () => {
    const item = await seed();
    await completeItems([item.id]);
    const [entry] = await entries();
    await removeCompletion(entry.id);
    expect(await completeItems([item.id])).toBe(1);
  });

  it("re-opens a workstream entry, leaving its swept tasks archived", async () => {
    const ws = await seedWorkstream();
    const swept = await seed({ workstream_id: ws.id });
    await completeWorkstream(ws.id, DAY);
    const [entry] = await entries();

    await removeCompletion(entry.id);

    expect((await db.tdl_workstreams.get(ws.id))!.completed_at).toBeNull();
    expect((await db.tdl_items.get(swept.id))!.is_archived).toBe(true);
  });
});

describe("setCompletionNote", () => {
  it("records and then clears a note", async () => {
    const item = await seed();
    await completeItems([item.id]);
    const [entry] = await entries();

    await setCompletionNote(entry.id, "  shipped behind a flag  ");
    expect((await db.tdl_completions.get(entry.id))!.note).toBe("shipped behind a flag");

    await setCompletionNote(entry.id, "   ");
    expect((await db.tdl_completions.get(entry.id))!.note).toBeNull();
  });
});

describe("logSweep", () => {
  it("credits each task to the day it was finished on", async () => {
    const mon = await seed({ snapshot_date: "2026-09-28", status: "done" });
    const wed = await seed({ snapshot_date: DAY, status: "done" });

    const added = await logSweep([
      { item: mon, threadId: mon.id },
      { item: wed, threadId: wed.id },
    ]);

    expect(added).toBe(2);
    const byTitle = new Map((await entries()).map((e) => [e.source_item_id, e.completed_on]));
    expect(byTitle.get(mon.id)).toBe("2026-09-28");
    expect(byTitle.get(wed.id)).toBe(DAY);
    expect(weekOf(byTitle.get(mon.id)!)).toBe(WEEK);
  });
});
