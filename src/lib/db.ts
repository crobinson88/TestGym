import Dexie, { type Table } from "dexie";
import type {
  CategoryRow,
  ExerciseRow,
  SetRow,
} from "./database.types";

export type SyncStatus = "pending" | "synced" | "error";

export interface LocalSet extends SetRow {
  sync_status: SyncStatus;
  sync_attempts: number;
  sync_last_error: string | null;
}

export interface LocalExercise extends ExerciseRow {
  sync_status: SyncStatus;
}

export interface LocalCategory extends CategoryRow {
  sync_status: SyncStatus;
}

export interface MetaRow {
  key: string;
  value: string;
  updated_at: string;
}

export class GymDB extends Dexie {
  sets!: Table<LocalSet, string>;
  exercises!: Table<LocalExercise, string>;
  categories!: Table<LocalCategory, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = "gym-tracker") {
    super(name);
    this.version(1).stores({
      sets: "id, exercise_id, category_id, performed_at, updated_at, sync_status, deleted_at",
      exercises: "id, category_id, name, updated_at, is_archived, deleted_at",
      categories: "id, name, sort_order, updated_at, deleted_at",
      meta: "key",
    });
  }
}

export const db = new GymDB();
