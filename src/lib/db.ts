import Dexie, { type Table } from "dexie";
import type {
  CardioSessionRow,
  CategoryRow,
  ConflictRow,
  ExerciseRow,
  MetActivityRow,
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

export interface LocalMetActivity extends MetActivityRow {
  sync_status: SyncStatus;
}

export interface LocalCardioSession extends CardioSessionRow {
  sync_status: SyncStatus;
  sync_attempts: number;
  sync_last_error: string | null;
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
  met_activities!: Table<LocalMetActivity, string>;
  cardio_sessions!: Table<LocalCardioSession, string>;
  conflicts!: Table<ConflictRow, string>;
  meta!: Table<MetaRow, string>;

  constructor(name = "gym-tracker") {
    super(name);
    this.version(1).stores({
      sets: "id, exercise_id, category_id, performed_at, updated_at, sync_status, deleted_at",
      exercises: "id, category_id, name, updated_at, sync_status, is_archived, deleted_at",
      categories: "id, name, sort_order, updated_at, sync_status, deleted_at",
      conflicts: "id, table_name, row_id, created_at",
      meta: "key",
    });
    this.version(2).stores({
      sets: "id, exercise_id, category_id, performed_at, updated_at, sync_status, deleted_at",
      exercises: "id, category_id, name, updated_at, sync_status, is_archived, deleted_at",
      categories: "id, name, sort_order, updated_at, sync_status, deleted_at",
      met_activities: "id, name, kind, updated_at, sync_status, is_archived, deleted_at",
      cardio_sessions: "id, activity_id, performed_at, updated_at, sync_status, deleted_at",
      conflicts: "id, table_name, row_id, created_at",
      meta: "key",
    });
  }
}

export const db = new GymDB();
