import type { GymDB } from "../db";
import type {
  CardioSessionRow,
  CategoryRow,
  ExerciseRow,
  MetActivityRow,
  SetRow,
} from "../database.types";
import type { Client, Logger, PullResult, SyncTable } from "./types";
import { SYNC_TABLES } from "./types";

const PAGE_SIZE = 1000;

async function fetchSince<T>(client: Client, table: SyncTable, since: string | null): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    let q = client.from(table).select("*");
    if (since) q = q.gt("updated_at", since);
    q = q.order("updated_at", { ascending: true }).range(from, from + PAGE_SIZE - 1);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data as T[]) ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function mergeSets(db: GymDB, rows: SetRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.sets, async () => {
    for (const remote of rows) {
      const local = await db.sets.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.sets.put({
          ...remote,
          sync_status: "synced",
          sync_attempts: 0,
          sync_last_error: null,
        });
      }
    }
  });
}

async function mergeExercises(db: GymDB, rows: ExerciseRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.exercises, async () => {
    for (const remote of rows) {
      const local = await db.exercises.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.exercises.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeCategories(db: GymDB, rows: CategoryRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.categories, async () => {
    for (const remote of rows) {
      const local = await db.categories.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.categories.put({ ...remote, sync_status: "synced" });
      }
    }
  });
}

async function mergeMetActivities(db: GymDB, rows: MetActivityRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.met_activities, async () => {
    for (const remote of rows) {
      const local = await db.met_activities.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.met_activities.put({
          ...remote,
          met_value: Number(remote.met_value),
          sync_status: "synced",
        });
      }
    }
  });
}

async function mergeCardioSessions(db: GymDB, rows: CardioSessionRow[]) {
  if (rows.length === 0) return;
  await db.transaction("rw", db.cardio_sessions, async () => {
    for (const remote of rows) {
      const local = await db.cardio_sessions.get(remote.id);
      if (!local || remote.updated_at > local.updated_at) {
        await db.cardio_sessions.put({
          ...remote,
          minutes: Number(remote.minutes),
          met_value_snapshot: Number(remote.met_value_snapshot),
          met_minutes: remote.met_minutes === null ? null : Number(remote.met_minutes),
          distance: remote.distance === null ? null : Number(remote.distance),
          sync_status: "synced",
          sync_attempts: 0,
          sync_last_error: null,
        });
      }
    }
  });
}

export interface PullDeps {
  client: Client;
  db: GymDB;
  log?: Logger;
}

const META_KEYS: Record<SyncTable, string> = {
  sets: "last_pull_sets",
  exercises: "last_pull_exercises",
  categories: "last_pull_categories",
  met_activities: "last_pull_met_activities",
  cardio_sessions: "last_pull_cardio_sessions",
};

export function createPull({ client, db, log }: PullDeps) {
  async function readMark(table: SyncTable): Promise<string | null> {
    const row = await db.meta.get(META_KEYS[table]);
    return row?.value ?? null;
  }

  async function writeMark(table: SyncTable, value: string) {
    await db.meta.put({ key: META_KEYS[table], value, updated_at: new Date().toISOString() });
  }

  async function pull(): Promise<PullResult> {
    const fetched = {
      sets: 0,
      exercises: 0,
      categories: 0,
      met_activities: 0,
      cardio_sessions: 0,
    } as PullResult["fetched"];

    for (const table of SYNC_TABLES) {
      const since = await readMark(table);
      log?.(`pull: ${table} since=${since ?? "<full>"}`);
      try {
        if (table === "sets") {
          const rows = await fetchSince<SetRow>(client, "sets", since);
          await mergeSets(db, rows);
          fetched.sets = rows.length;
          if (rows.length > 0) await writeMark("sets", rows[rows.length - 1].updated_at);
        } else if (table === "exercises") {
          const rows = await fetchSince<ExerciseRow>(client, "exercises", since);
          await mergeExercises(db, rows);
          fetched.exercises = rows.length;
          if (rows.length > 0) await writeMark("exercises", rows[rows.length - 1].updated_at);
        } else if (table === "categories") {
          const rows = await fetchSince<CategoryRow>(client, "categories", since);
          await mergeCategories(db, rows);
          fetched.categories = rows.length;
          if (rows.length > 0) await writeMark("categories", rows[rows.length - 1].updated_at);
        } else if (table === "met_activities") {
          const rows = await fetchSince<MetActivityRow>(client, "met_activities", since);
          await mergeMetActivities(db, rows);
          fetched.met_activities = rows.length;
          if (rows.length > 0) await writeMark("met_activities", rows[rows.length - 1].updated_at);
        } else {
          const rows = await fetchSince<CardioSessionRow>(client, "cardio_sessions", since);
          await mergeCardioSessions(db, rows);
          fetched.cardio_sessions = rows.length;
          if (rows.length > 0) await writeMark("cardio_sessions", rows[rows.length - 1].updated_at);
        }
      } catch (err) {
        log?.(`pull: ${table} failed`, (err as Error).message);
        throw err;
      }
    }
    return { fetched };
  }

  return { pull };
}

export type Pull = ReturnType<typeof createPull>;
