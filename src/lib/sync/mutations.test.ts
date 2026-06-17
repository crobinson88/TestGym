import { afterEach, describe, expect, it } from "vitest";
import type { GymDB } from "../db";
import { createMutations } from "./mutations";
import {
  makeCategory,
  makeExercise,
  makeMetActivity,
  newTestDb,
} from "./test-helpers";

let db: GymDB;

afterEach(async () => {
  if (db) {
    await db.delete();
  }
});

describe("mutations.addSet", () => {
  it("writes to Dexie instantly with sync_status=pending and stable client_id=id", async () => {
    db = await newTestDb();
    const cat = makeCategory();
    const ex = makeExercise(cat.id);
    await db.categories.put({ ...cat, sync_status: "synced" });
    await db.exercises.put({ ...ex, sync_status: "synced" });

    let notified = 0;
    const m = createMutations({ db, onChange: () => notified++ });

    const set = await m.addSet({
      exercise_id: ex.id,
      category_id: cat.id,
      weight: 225,
      reps: 8,
    });

    expect(set.sync_status).toBe("pending");
    expect(set.client_id).toBe(set.id);
    expect(set.weight_unit).toBe("lbs");
    expect(set.performed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(notified).toBe(1);

    const stored = await db.sets.get(set.id);
    expect(stored?.sync_status).toBe("pending");
    expect(stored?.weight).toBe(225);
  });

  it("deleteSet soft-deletes and marks pending", async () => {
    db = await newTestDb();
    const cat = makeCategory();
    const ex = makeExercise(cat.id);
    await db.categories.put({ ...cat, sync_status: "synced" });
    await db.exercises.put({ ...ex, sync_status: "synced" });

    const m = createMutations({ db });
    const set = await m.addSet({
      exercise_id: ex.id,
      category_id: cat.id,
      weight: 100,
      reps: 5,
    });
    await m.deleteSet(set.id);

    const after = await db.sets.get(set.id);
    expect(after?.deleted_at).not.toBeNull();
    expect(after?.sync_status).toBe("pending");
  });

  it("setExerciseActive toggles is_archived and marks pending", async () => {
    db = await newTestDb();
    const cat = makeCategory();
    const ex = makeExercise(cat.id);
    await db.categories.put({ ...cat, sync_status: "synced" });
    await db.exercises.put({ ...ex, sync_status: "synced", is_archived: false });

    const m = createMutations({ db });

    const off = await m.setExerciseActive(ex.id, false);
    expect(off?.is_archived).toBe(true);
    expect(off?.sync_status).toBe("pending");

    const on = await m.setExerciseActive(ex.id, true);
    expect(on?.is_archived).toBe(false);
    expect(on?.sync_status).toBe("pending");

    expect(await m.setExerciseActive("missing", true)).toBeNull();
  });

  it("addCardioSession snapshots met_value and computes met_minutes", async () => {
    db = await newTestDb();
    const act = makeMetActivity({ met_value: 9.8 });
    await db.met_activities.put({ ...act, sync_status: "synced" });

    const m = createMutations({ db });
    const session = await m.addCardioSession({
      activity_id: act.id,
      minutes: 30,
    });

    expect(session.sync_status).toBe("pending");
    expect(session.met_value_snapshot).toBe(9.8);
    expect(session.met_minutes).toBeCloseTo(9.8 * 30);
    expect(session.client_id).toBe(session.id);
    expect(session.performed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("addCardioSession throws when activity_id is unknown", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    await expect(
      m.addCardioSession({ activity_id: "nope", minutes: 30 }),
    ).rejects.toThrow(/unknown activity_id/);
  });

  it("deleteCardioSession soft-deletes and re-pends", async () => {
    db = await newTestDb();
    const act = makeMetActivity();
    await db.met_activities.put({ ...act, sync_status: "synced" });

    const m = createMutations({ db });
    const session = await m.addCardioSession({ activity_id: act.id, minutes: 20 });
    await m.deleteCardioSession(session.id);

    const after = await db.cardio_sessions.get(session.id);
    expect(after?.deleted_at).not.toBeNull();
    expect(after?.sync_status).toBe("pending");
  });

  it("updateSet bumps updated_at and re-pends sync", async () => {
    db = await newTestDb();
    const cat = makeCategory();
    const ex = makeExercise(cat.id);
    await db.categories.put({ ...cat, sync_status: "synced" });
    await db.exercises.put({ ...ex, sync_status: "synced" });

    let t = 1_700_000_000_000;
    const m = createMutations({ db, now: () => new Date(++t).toISOString() });
    const set = await m.addSet({
      exercise_id: ex.id,
      category_id: cat.id,
      weight: 100,
      reps: 5,
    });
    const before = set.updated_at;

    await m.updateSet(set.id, { weight: 110 });
    const after = await db.sets.get(set.id);
    expect(after?.weight).toBe(110);
    expect((after?.updated_at ?? "") > before).toBe(true);
    expect(after?.sync_status).toBe("pending");
  });
});
