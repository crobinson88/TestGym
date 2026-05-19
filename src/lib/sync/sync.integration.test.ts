import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuid } from "uuid";
import type { Database, CategoryRow, ExerciseRow, SetRow } from "../database.types";
import { createSyncEngine } from "./engine";
import { newTestDb } from "./test-helpers";

const URL_ENV = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SHOULD_RUN = process.env.SUPABASE_TEST_ENV === "1" && URL_ENV && SERVICE_ROLE;

const MARKER = `__test__${uuid()}__`;

describe.skipIf(!SHOULD_RUN)("sync engine ↔ Supabase (integration)", () => {
  let client: SupabaseClient<Database>;
  let category: CategoryRow;
  let exercise: ExerciseRow;

  beforeAll(async () => {
    client = createClient<Database>(URL_ENV!, SERVICE_ROLE!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: cats } = await client
      .from("categories")
      .select("*")
      .is("deleted_at", null)
      .limit(1);
    if (!cats?.length) throw new Error("no seeded categories — DB is empty");
    category = cats[0];
    const { data: exs } = await client
      .from("exercises")
      .select("*")
      .eq("category_id", category.id)
      .is("deleted_at", null)
      .limit(1);
    if (!exs?.length) throw new Error(`no exercises in category ${category.name}`);
    exercise = exs[0];
  }, 30_000);

  afterAll(async () => {
    if (!client) return;
    await client.from("sets").delete().like("notes", `%${MARKER}%`);
  });

  it("pushes a locally-created set to Supabase via the outbox", async () => {
    const db = await newTestDb();
    const engine = createSyncEngine({ client, db });
    const set = await engine.mutations.addSet({
      exercise_id: exercise.id,
      category_id: category.id,
      weight: 42,
      reps: 3,
      notes: MARKER,
    });

    const result = await engine.drain();
    expect(result.pushed).toBe(1);
    expect(result.failed).toBe(0);

    const local = await db.sets.get(set.id);
    expect(local?.sync_status).toBe("synced");

    const { data } = await client.from("sets").select("*").eq("id", set.id).single();
    const remote = data as unknown as SetRow;
    expect(remote.weight).toBe(42);
    expect(remote.reps).toBe(3);
    expect(remote.notes).toBe(MARKER);
    expect(remote.volume).toBe(126);
    await db.delete();
  });

  it("preserves client-supplied updated_at on UPDATE (trigger respects it)", async () => {
    const db = await newTestDb();
    const engine = createSyncEngine({ client, db });
    const past = new Date("2020-01-01T00:00:00.000Z").toISOString();

    const set = await engine.mutations.addSet({
      exercise_id: exercise.id,
      category_id: category.id,
      weight: 50,
      reps: 5,
      notes: MARKER,
    });
    await engine.drain();

    await db.sets.update(set.id, {
      weight: 60,
      updated_at: past,
      sync_status: "pending",
      sync_attempts: 0,
      sync_last_error: null,
    });
    const r = await engine.drain();
    expect(r.pushed).toBe(1);

    const { data } = await client
      .from("sets")
      .select("weight, updated_at")
      .eq("id", set.id)
      .single();
    const remote = data as unknown as Pick<SetRow, "weight" | "updated_at">;
    expect(remote.weight).toBe(60);
    expect(remote.updated_at).toBe(past);
    await db.delete();
  });

  it("pulls seeded categories and exercises into Dexie", async () => {
    const db = await newTestDb();
    const engine = createSyncEngine({ client, db });
    await engine.pull();

    const catCount = await db.categories.count();
    const exCount = await db.exercises.count();
    expect(catCount).toBeGreaterThanOrEqual(4);
    expect(exCount).toBeGreaterThanOrEqual(26);
    await db.delete();
  });
});
