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

  it("renameExercise trims the name and marks pending", async () => {
    db = await newTestDb();
    const cat = makeCategory();
    const ex = makeExercise(cat.id, { name: "Lat Pulldown" });
    await db.categories.put({ ...cat, sync_status: "synced" });
    await db.exercises.put({ ...ex, sync_status: "synced" });

    const m = createMutations({ db });

    const renamed = await m.renameExercise(ex.id, "  Cable Row  ");
    expect(renamed?.name).toBe("Cable Row");
    expect(renamed?.sync_status).toBe("pending");

    expect(await m.renameExercise("missing", "x")).toBeNull();
  });

  it("setExerciseReadyForIncrease toggles the flag and marks pending", async () => {
    db = await newTestDb();
    const cat = makeCategory();
    const ex = makeExercise(cat.id, { ready_for_increase: false });
    await db.categories.put({ ...cat, sync_status: "synced" });
    await db.exercises.put({ ...ex, sync_status: "synced" });

    const m = createMutations({ db });

    const on = await m.setExerciseReadyForIncrease(ex.id, true);
    expect(on?.ready_for_increase).toBe(true);
    expect(on?.sync_status).toBe("pending");

    const off = await m.setExerciseReadyForIncrease(ex.id, false);
    expect(off?.ready_for_increase).toBe(false);
    expect(off?.sync_status).toBe("pending");

    expect(await m.setExerciseReadyForIncrease("missing", true)).toBeNull();
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

  it("addCardioSession stores logged calories and distance", async () => {
    db = await newTestDb();
    const act = makeMetActivity({ met_value: 8 });
    await db.met_activities.put({ ...act, sync_status: "synced" });

    const m = createMutations({ db });
    const session = await m.addCardioSession({
      activity_id: act.id,
      minutes: 25,
      distance: 3.1,
      calories: 280,
    });

    expect(session.calories).toBe(280);
    expect(session.distance).toBe(3.1);
  });

  it("addCardioSession defaults calories to null when not logged", async () => {
    db = await newTestDb();
    const act = makeMetActivity();
    await db.met_activities.put({ ...act, sync_status: "synced" });

    const m = createMutations({ db });
    const session = await m.addCardioSession({ activity_id: act.id, minutes: 30 });
    expect(session.calories).toBeNull();
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

describe("mutations.setSmoked", () => {
  it("creates one pending row for the day with stable client_id=id", async () => {
    db = await newTestDb();
    const m = createMutations({ db });

    const row = await m.setSmoked("2026-06-28", true);
    expect(row?.smoked).toBe(true);
    expect(row?.log_date).toBe("2026-06-28");
    expect(row?.sync_status).toBe("pending");
    expect(row?.client_id).toBe(row?.id);

    const live = (await db.smoking_logs.toArray()).filter((r) => !r.deleted_at);
    expect(live).toHaveLength(1);
  });

  it("updates the existing day row instead of creating a second one", async () => {
    db = await newTestDb();
    let t = 1_700_000_000_000;
    const m = createMutations({ db, now: () => new Date(++t).toISOString() });

    const first = await m.setSmoked("2026-06-28", true);
    const second = await m.setSmoked("2026-06-28", false);

    expect(second?.id).toBe(first?.id);
    expect(second?.smoked).toBe(false);
    expect((second?.updated_at ?? "") > (first?.updated_at ?? "")).toBe(true);

    const all = await db.smoking_logs.toArray();
    expect(all).toHaveLength(1);
  });

  it("clears the mark by soft-deleting the day's live rows", async () => {
    db = await newTestDb();
    const m = createMutations({ db });

    const row = await m.setSmoked("2026-06-28", true);
    const cleared = await m.setSmoked("2026-06-28", null);
    expect(cleared).toBeNull();

    const after = await db.smoking_logs.get(row!.id);
    expect(after?.deleted_at).not.toBeNull();
    expect(after?.sync_status).toBe("pending");

    const live = (await db.smoking_logs.toArray()).filter((r) => !r.deleted_at);
    expect(live).toHaveLength(0);
  });

  it("clearing an already-unmarked day is a no-op", async () => {
    db = await newTestDb();
    const m = createMutations({ db });
    expect(await m.setSmoked("2026-06-28", null)).toBeNull();
    expect(await db.smoking_logs.count()).toBe(0);
  });

  it("marks smoke-free as 0 cigarettes and a smoking day as unknown", async () => {
    db = await newTestDb();
    const m = createMutations({ db });

    const free = await m.setSmoked("2026-06-28", false);
    expect(free?.cigarettes).toBe(0);

    const smoked = await m.setSmoked("2026-06-28", true);
    expect(smoked?.cigarettes).toBeNull();
  });
});

describe("mutations.setCigaretteCount", () => {
  it("a positive count marks the day smoked and stores the count", async () => {
    db = await newTestDb();
    const m = createMutations({ db });

    const row = await m.setCigaretteCount("2026-06-28", 7);
    expect(row?.smoked).toBe(true);
    expect(row?.cigarettes).toBe(7);
    expect(row?.client_id).toBe(row?.id);

    const live = (await db.smoking_logs.toArray()).filter((r) => !r.deleted_at);
    expect(live).toHaveLength(1);
  });

  it("a zero count marks the day smoke-free", async () => {
    db = await newTestDb();
    const m = createMutations({ db });

    const row = await m.setCigaretteCount("2026-06-28", 0);
    expect(row?.smoked).toBe(false);
    expect(row?.cigarettes).toBe(0);
  });

  it("floors and clamps a fractional or negative count", async () => {
    db = await newTestDb();
    const m = createMutations({ db });

    expect((await m.setCigaretteCount("2026-06-28", 3.9))?.cigarettes).toBe(3);
    expect((await m.setCigaretteCount("2026-06-29", -2))?.cigarettes).toBe(0);
  });

  it("updates the day's existing live row instead of creating a second", async () => {
    db = await newTestDb();
    let t = 1_700_000_000_000;
    const m = createMutations({ db, now: () => new Date(++t).toISOString() });

    const first = await m.setCigaretteCount("2026-06-28", 3);
    const second = await m.setCigaretteCount("2026-06-28", 5);

    expect(second?.id).toBe(first?.id);
    expect(second?.cigarettes).toBe(5);
    expect(await db.smoking_logs.count()).toBe(1);
  });

  it("preserves the count when toggling smoked from the Today flow", async () => {
    db = await newTestDb();
    let t = 1_700_000_000_000;
    const m = createMutations({ db, now: () => new Date(++t).toISOString() });

    await m.setCigaretteCount("2026-06-28", 4);
    const smoked = await m.setSmoked("2026-06-28", true);
    expect(smoked?.cigarettes).toBe(4);
  });

  it("clears the mark when passed null", async () => {
    db = await newTestDb();
    const m = createMutations({ db });

    await m.setCigaretteCount("2026-06-28", 4);
    expect(await m.setCigaretteCount("2026-06-28", null)).toBeNull();

    const live = (await db.smoking_logs.toArray()).filter((r) => !r.deleted_at);
    expect(live).toHaveLength(0);
  });
});
