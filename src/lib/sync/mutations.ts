import { v4 as uuid } from "uuid";
import type {
  GymDB,
  LocalCardioSession,
  LocalCategory,
  LocalExercise,
  LocalSet,
} from "../db";
import type {
  CardioSessionRow,
  CategoryRow,
  ExerciseRow,
  SetRow,
  WeightUnit,
} from "../database.types";
import { todayIsoDate } from "../utils";

export interface AddSetInput {
  exercise_id: string;
  category_id: string;
  weight: number;
  reps: number;
  weight_unit?: WeightUnit;
  performed_at?: string;
  target_weight?: number | null;
  target_reps?: number | null;
  notes?: string | null;
}

export interface AddExerciseInput {
  name: string;
  category_id: string;
}

export interface AddCategoryInput {
  name: string;
  sort_order?: number;
}

export interface AddCardioSessionInput {
  activity_id: string;
  minutes: number;
  performed_at?: string;
  distance?: number | null;
  notes?: string | null;
}

const nowIso = () => new Date().toISOString();

const baseRowDefaults = (now: string) => ({
  created_at: now,
  updated_at: now,
  deleted_at: null,
});

function pendingSet(row: SetRow): LocalSet {
  return { ...row, sync_status: "pending", sync_attempts: 0, sync_last_error: null };
}

function pendingExercise(row: ExerciseRow): LocalExercise {
  return { ...row, sync_status: "pending" };
}

function pendingCategory(row: CategoryRow): LocalCategory {
  return { ...row, sync_status: "pending" };
}

function pendingCardio(row: CardioSessionRow): LocalCardioSession {
  return { ...row, sync_status: "pending", sync_attempts: 0, sync_last_error: null };
}

export interface MutationDeps {
  db: GymDB;
  now?: () => string;
  onChange?: () => void;
}

export function createMutations({ db, now = nowIso, onChange }: MutationDeps) {
  const notify = () => onChange?.();

  async function addSet(input: AddSetInput): Promise<LocalSet> {
    const id = uuid();
    const ts = now();
    const row: SetRow = {
      id,
      exercise_id: input.exercise_id,
      category_id: input.category_id,
      weight: input.weight,
      reps: input.reps,
      weight_unit: input.weight_unit ?? "lbs",
      performed_at: input.performed_at ?? todayIsoDate(),
      target_weight: input.target_weight ?? null,
      target_reps: input.target_reps ?? null,
      notes: input.notes ?? null,
      volume: null,
      client_id: id,
      user_id: null,
      ...baseRowDefaults(ts),
    };
    const local = pendingSet(row);
    await db.sets.put(local);
    notify();
    return local;
  }

  async function updateSet(
    id: string,
    patch: Partial<AddSetInput>,
  ): Promise<LocalSet | null> {
    const existing = await db.sets.get(id);
    if (!existing) return null;
    const ts = now();
    const updated: LocalSet = {
      ...existing,
      ...patch,
      updated_at: ts,
      sync_status: "pending",
      sync_attempts: 0,
      sync_last_error: null,
    };
    await db.sets.put(updated);
    notify();
    return updated;
  }

  async function deleteSet(id: string): Promise<void> {
    const existing = await db.sets.get(id);
    if (!existing || existing.deleted_at) return;
    const ts = now();
    const updated: LocalSet = {
      ...existing,
      deleted_at: ts,
      updated_at: ts,
      sync_status: "pending",
      sync_attempts: 0,
      sync_last_error: null,
    };
    await db.sets.put(updated);
    notify();
  }

  async function addExercise(input: AddExerciseInput): Promise<LocalExercise> {
    const id = uuid();
    const ts = now();
    const row: ExerciseRow = {
      id,
      name: input.name,
      category_id: input.category_id,
      is_archived: false,
      ...baseRowDefaults(ts),
    };
    const local = pendingExercise(row);
    await db.exercises.put(local);
    notify();
    return local;
  }

  async function addCategory(input: AddCategoryInput): Promise<LocalCategory> {
    const id = uuid();
    const ts = now();
    const row: CategoryRow = {
      id,
      name: input.name,
      sort_order: input.sort_order ?? 0,
      ...baseRowDefaults(ts),
    };
    const local = pendingCategory(row);
    await db.categories.put(local);
    notify();
    return local;
  }

  async function addCardioSession(input: AddCardioSessionInput): Promise<LocalCardioSession> {
    const activity = await db.met_activities.get(input.activity_id);
    if (!activity || activity.deleted_at) {
      throw new Error(`unknown activity_id: ${input.activity_id}`);
    }
    const id = uuid();
    const ts = now();
    const row: CardioSessionRow = {
      id,
      activity_id: input.activity_id,
      performed_at: input.performed_at ?? todayIsoDate(),
      minutes: input.minutes,
      distance: input.distance ?? null,
      notes: input.notes ?? null,
      met_value_snapshot: activity.met_value,
      met_minutes: activity.met_value * input.minutes,
      client_id: id,
      user_id: null,
      ...baseRowDefaults(ts),
    };
    const local = pendingCardio(row);
    await db.cardio_sessions.put(local);
    notify();
    return local;
  }

  async function deleteCardioSession(id: string): Promise<void> {
    const existing = await db.cardio_sessions.get(id);
    if (!existing || existing.deleted_at) return;
    const ts = now();
    const updated: LocalCardioSession = {
      ...existing,
      deleted_at: ts,
      updated_at: ts,
      sync_status: "pending",
      sync_attempts: 0,
      sync_last_error: null,
    };
    await db.cardio_sessions.put(updated);
    notify();
  }

  return {
    addSet,
    updateSet,
    deleteSet,
    addExercise,
    addCategory,
    addCardioSession,
    deleteCardioSession,
  };
}

export type Mutations = ReturnType<typeof createMutations>;
