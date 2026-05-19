import { v4 as uuid } from "uuid";
import { GymDB } from "../db";
import type { CategoryRow, ExerciseRow, SetRow } from "../database.types";

export async function newTestDb(): Promise<GymDB> {
  const db = new GymDB(`gym-test-${uuid()}`);
  await db.open();
  return db;
}

export function makeCategory(over: Partial<CategoryRow> = {}): CategoryRow {
  const ts = new Date().toISOString();
  return {
    id: uuid(),
    name: "Back",
    sort_order: 0,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    ...over,
  };
}

export function makeExercise(category_id: string, over: Partial<ExerciseRow> = {}): ExerciseRow {
  const ts = new Date().toISOString();
  return {
    id: uuid(),
    name: "Lat Pulldown",
    category_id,
    is_archived: false,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    ...over,
  };
}

export function makeSet(
  exercise_id: string,
  category_id: string,
  over: Partial<SetRow> = {},
): SetRow {
  const ts = new Date().toISOString();
  return {
    id: uuid(),
    exercise_id,
    category_id,
    weight: 100,
    reps: 10,
    weight_unit: "lbs",
    performed_at: "2026-05-19",
    target_weight: null,
    target_reps: null,
    notes: null,
    volume: 1000,
    client_id: null,
    user_id: null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    ...over,
  };
}

export interface MockUpsertCall {
  table: string;
  payload: unknown[];
}

export function makeMockClient(opts: { onUpsert?: () => { error: { message: string } | null } } = {}) {
  const calls: MockUpsertCall[] = [];
  const client = {
    from(table: string) {
      return {
        upsert: async (payload: unknown[]) => {
          calls.push({ table, payload });
          const r = opts.onUpsert?.() ?? { error: null };
          return r;
        },
        select: () => ({
          gt: () => ({ order: () => ({ range: async () => ({ data: [], error: null }) }) }),
          order: () => ({ range: async () => ({ data: [], error: null }) }),
        }),
      };
    },
    channel: () => ({
      on: () => ({
        subscribe: () => ({}),
      }),
    }),
    removeChannel: async () => undefined,
  };
  return { client, calls };
}
