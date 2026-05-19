import { afterEach, describe, expect, it } from "vitest";
import { db } from "./db";
import { buildSetsCsv } from "./csv";
import { makeCategory, makeExercise, makeSet } from "./sync/test-helpers";

afterEach(async () => {
  await db.sets.clear();
  await db.exercises.clear();
  await db.categories.clear();
});

describe("buildSetsCsv", () => {
  it("emits a header row and one row per live set in chronological order", async () => {
    const cat = makeCategory({ name: "Back" });
    const ex = makeExercise(cat.id, { name: "Lat Pulldown" });
    await db.categories.put({ ...cat, sync_status: "synced" });
    await db.exercises.put({ ...ex, sync_status: "synced" });

    const syncedSet = (over: Partial<ReturnType<typeof makeSet>>) => ({
      ...makeSet(ex.id, cat.id, over),
      sync_status: "synced" as const,
      sync_attempts: 0,
      sync_last_error: null,
    });

    await db.sets.put(syncedSet({ weight: 100, reps: 10, performed_at: "2026-05-18" }));
    await db.sets.put(syncedSet({ weight: 110, reps: 8, performed_at: "2026-05-19" }));
    await db.sets.put(
      syncedSet({ weight: 999, reps: 99, performed_at: "2026-05-17", deleted_at: "x" }),
    );

    const csv = await buildSetsCsv();
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("id,exercise,category,weight,reps");
    expect(lines[1]).toContain("Lat Pulldown,Back,100,10");
    expect(lines[2]).toContain("Lat Pulldown,Back,110,8");
    expect(csv).not.toContain("999");
  });

  it("escapes commas, quotes, and newlines in fields", async () => {
    const cat = makeCategory({ name: "Back" });
    const ex = makeExercise(cat.id, { name: "Row, with \"quotes\"\nand newline" });
    await db.categories.put({ ...cat, sync_status: "synced" });
    await db.exercises.put({ ...ex, sync_status: "synced" });

    await db.sets.put({
      ...makeSet(ex.id, cat.id, { notes: "hard, set" }),
      sync_status: "synced",
      sync_attempts: 0,
      sync_last_error: null,
    });

    const csv = await buildSetsCsv();
    expect(csv).toContain('"Row, with ""quotes""\nand newline"');
    expect(csv).toContain('"hard, set"');
  });

  it("computes volume = weight * reps", async () => {
    const cat = makeCategory();
    const ex = makeExercise(cat.id);
    await db.categories.put({ ...cat, sync_status: "synced" });
    await db.exercises.put({ ...ex, sync_status: "synced" });
    await db.sets.put({
      ...makeSet(ex.id, cat.id, { weight: 225, reps: 8 }),
      sync_status: "synced",
      sync_attempts: 0,
      sync_last_error: null,
    });
    const csv = await buildSetsCsv();
    expect(csv).toContain(",1800,");
  });
});
