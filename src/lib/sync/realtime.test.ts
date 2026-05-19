import { afterEach, describe, expect, it } from "vitest";
import type { GymDB } from "../db";
import { mergeRemote } from "./realtime";
import { makeCategory, makeExercise, makeSet, newTestDb } from "./test-helpers";

let db: GymDB;
afterEach(async () => {
  if (db) await db.delete();
});

const minute = (offset: number) =>
  new Date(Date.UTC(2026, 4, 19, 12, offset, 0)).toISOString();

describe("mergeRemote (LWW)", () => {
  it("inserts when no local row exists", async () => {
    db = await newTestDb();
    const cat = makeCategory();
    const r = await mergeRemote(db, "categories", cat);
    expect(r.applied).toBe(true);
    const stored = await db.categories.get(cat.id);
    expect(stored?.sync_status).toBe("synced");
  });

  it("applies a remote that is strictly newer than local", async () => {
    db = await newTestDb();
    const cat = makeCategory({ updated_at: minute(0) });
    await db.categories.put({ ...cat, sync_status: "synced" });

    const remote = { ...cat, name: "Cardio", updated_at: minute(5) };
    const r = await mergeRemote(db, "categories", remote);
    expect(r.applied).toBe(true);
    expect((await db.categories.get(cat.id))?.name).toBe("Cardio");
    expect(await db.conflicts.count()).toBe(0);
  });

  it("no-op when remote and local have identical updated_at", async () => {
    db = await newTestDb();
    const cat = makeCategory({ updated_at: minute(0) });
    await db.categories.put({ ...cat, sync_status: "synced" });

    const remote = { ...cat, name: "ChangedButSameTime", updated_at: minute(0) };
    const r = await mergeRemote(db, "categories", remote);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("skipped-equal");
    expect((await db.categories.get(cat.id))?.name).toBe(cat.name);
    expect(await db.conflicts.count()).toBe(0);
  });

  it("logs a conflict and keeps local when remote is older", async () => {
    db = await newTestDb();
    const cat = makeCategory({ updated_at: minute(10), name: "LocalWins" });
    await db.categories.put({ ...cat, sync_status: "synced" });

    const remote = { ...cat, name: "RemoteIsStale", updated_at: minute(5) };
    const r = await mergeRemote(db, "categories", remote);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe("skipped-stale");

    expect((await db.categories.get(cat.id))?.name).toBe("LocalWins");
    const conflicts = await db.conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].resolved_to).toBe("local");
    expect(conflicts[0].table_name).toBe("categories");
    expect(conflicts[0].row_id).toBe(cat.id);
  });

  it("propagates soft-deletes through LWW (deleted_at set in remote update)", async () => {
    db = await newTestDb();
    const cat = makeCategory();
    const ex = makeExercise(cat.id);
    const set = makeSet(ex.id, cat.id, { updated_at: minute(0) });
    await db.sets.put({
      ...set,
      sync_status: "synced",
      sync_attempts: 0,
      sync_last_error: null,
    });

    const remote = { ...set, updated_at: minute(5), deleted_at: minute(5) };
    const r = await mergeRemote(db, "sets", remote);
    expect(r.applied).toBe(true);
    expect((await db.sets.get(set.id))?.deleted_at).not.toBeNull();
  });
});
