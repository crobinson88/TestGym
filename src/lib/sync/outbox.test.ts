import { afterEach, describe, expect, it } from "vitest";
import type { GymDB } from "../db";
import { createMutations } from "./mutations";
import { createOutbox } from "./outbox";
import { makeCategory, makeExercise, makeMockClient, newTestDb } from "./test-helpers";

let db: GymDB;
afterEach(async () => {
  if (db) await db.delete();
});

async function seedRefs(db: GymDB) {
  const cat = makeCategory();
  const ex = makeExercise(cat.id);
  await db.categories.put({ ...cat, sync_status: "synced" });
  await db.exercises.put({ ...ex, sync_status: "synced" });
  return { cat, ex };
}

describe("outbox", () => {
  it("drains pending rows to supabase and marks them synced", async () => {
    db = await newTestDb();
    const { cat, ex } = await seedRefs(db);
    const m = createMutations({ db });
    await m.addSet({ exercise_id: ex.id, category_id: cat.id, weight: 100, reps: 5 });
    await m.addSet({ exercise_id: ex.id, category_id: cat.id, weight: 110, reps: 5 });

    const { client, calls } = makeMockClient();
    const outbox = createOutbox({ client: client as never, db });

    const result = await outbox.drain();
    expect(result.pushed).toBe(2);
    expect(result.failed).toBe(0);

    const setCall = calls.find((c) => c.table === "sets");
    expect(setCall?.payload).toHaveLength(2);
    expect((setCall?.payload[0] as Record<string, unknown>).volume).toBeUndefined();
    expect((setCall?.payload[0] as Record<string, unknown>).user_id).toBeUndefined();
    expect((setCall?.payload[0] as Record<string, unknown>).created_at).toBeUndefined();
    expect((setCall?.payload[0] as Record<string, unknown>).sync_status).toBeUndefined();

    const stored = await db.sets.where("sync_status").equals("synced").count();
    expect(stored).toBe(2);
    expect(await db.sets.where("sync_status").equals("pending").count()).toBe(0);
  });

  it("marks rows as error and stops the batch when upsert fails", async () => {
    db = await newTestDb();
    const { cat, ex } = await seedRefs(db);
    const m = createMutations({ db });
    const s = await m.addSet({
      exercise_id: ex.id,
      category_id: cat.id,
      weight: 100,
      reps: 5,
    });

    const { client } = makeMockClient({
      onUpsert: () => ({ error: { message: "network down" } }),
    });
    const outbox = createOutbox({ client: client as never, db });

    const result = await outbox.drain();
    expect(result.failed).toBe(1);
    expect(result.pushed).toBe(0);

    const after = await db.sets.get(s.id);
    expect(after?.sync_status).toBe("error");
    expect(after?.sync_attempts).toBe(1);
    expect(after?.sync_last_error).toBe("network down");
  });

  it("is single-flight: parallel drain calls share one inflight promise", async () => {
    db = await newTestDb();
    const { cat, ex } = await seedRefs(db);
    const m = createMutations({ db });
    await m.addSet({ exercise_id: ex.id, category_id: cat.id, weight: 100, reps: 5 });

    let upsertCalls = 0;
    const { client } = makeMockClient({
      onUpsert: () => {
        upsertCalls += 1;
        return { error: null };
      },
    });
    const outbox = createOutbox({ client: client as never, db });

    const [a, b] = await Promise.all([outbox.drain(), outbox.drain()]);
    expect(a).toEqual(b);
    expect(upsertCalls).toBe(1);
  });

  it("counts pending rows across tables", async () => {
    db = await newTestDb();
    const { cat, ex } = await seedRefs(db);
    const m = createMutations({ db });
    await m.addSet({ exercise_id: ex.id, category_id: cat.id, weight: 100, reps: 5 });
    await m.addExercise({ name: "Pull-up", category_id: cat.id });

    const { client } = makeMockClient();
    const outbox = createOutbox({ client: client as never, db });
    expect(await outbox.pendingCount()).toBe(2);
  });
});
