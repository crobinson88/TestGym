import Dexie, { type Table } from "dexie";
import type {
  CardioSessionRow,
  CategoryRow,
  ConflictRow,
  ExerciseRow,
  MetActivityRow,
  SetRow,
  TdlDayRow,
  TdlItemRow,
  TimeAllocationRow,
  TimeTaskRow,
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

export interface LocalTdlItem extends TdlItemRow {
  sync_status: SyncStatus;
}

export interface LocalTdlDay extends TdlDayRow {
  sync_status: SyncStatus;
}

export interface MetaRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface LocalTimeTask extends TimeTaskRow {
  sync_status: SyncStatus;
}

export interface LocalTimeAllocation extends TimeAllocationRow {
  sync_status: SyncStatus;
}

export class GymDB extends Dexie {
  sets!: Table<LocalSet, string>;
  exercises!: Table<LocalExercise, string>;
  categories!: Table<LocalCategory, string>;
  met_activities!: Table<LocalMetActivity, string>;
  cardio_sessions!: Table<LocalCardioSession, string>;
  conflicts!: Table<ConflictRow, string>;
  meta!: Table<MetaRow, string>;
  timeTasks!: Table<LocalTimeTask, string>;
  timeAllocations!: Table<LocalTimeAllocation, string>;
  tdl_items!: Table<LocalTdlItem, string>;
  tdl_days!: Table<LocalTdlDay, string>;

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
    this.version(3).stores({
      sets: "id, exercise_id, category_id, performed_at, updated_at, sync_status, deleted_at",
      exercises: "id, category_id, name, updated_at, sync_status, is_archived, deleted_at",
      categories: "id, name, sort_order, updated_at, sync_status, deleted_at",
      met_activities: "id, name, kind, updated_at, sync_status, is_archived, deleted_at",
      cardio_sessions: "id, activity_id, performed_at, updated_at, sync_status, deleted_at",
      conflicts: "id, table_name, row_id, created_at",
      meta: "key",
      timeTasks: "id, name, sort_order, is_work, updated_at, deleted_at",
      timeAllocations: "id, date, task_id, [date+slot], updated_at",
    });
    this.version(4).stores({
      tdl_items:
        "id, snapshot_date, [snapshot_date+section+position], updated_at, sync_status, deleted_at",
      tdl_days: "snapshot_date, updated_at, sync_status, deleted_at",
    });
    this.version(5)
      .stores({
        tdl_items:
          "id, snapshot_date, [snapshot_date+section+position], updated_at, sync_status, deleted_at, is_archived",
      })
      .upgrade(async (tx) => {
        await tx
          .table("tdl_items")
          .toCollection()
          .modify((row: LocalTdlItem) => {
            if (row.is_archived === undefined) row.is_archived = false;
            if (row.snoozed_until === undefined) row.snoozed_until = null;
          });
      });
    this.version(6)
      .stores({
        timeTasks: "id, name, sort_order, is_work, updated_at, sync_status, deleted_at",
        timeAllocations: "id, date, task_id, [date+slot], updated_at, sync_status, deleted_at",
      })
      .upgrade(async (tx) => {
        const now = new Date().toISOString();
        // Pre-sync time rows were local-only; mark them pending so the
        // outbox finally pushes the backlog to Supabase.
        await tx
          .table("timeTasks")
          .toCollection()
          .modify((row: LocalTimeTask) => {
            if (row.sync_status === undefined) row.sync_status = "pending";
            if (row.created_at === undefined) row.created_at = now;
            if (row.deleted_at === undefined) row.deleted_at = null;
          });
        await tx
          .table("timeAllocations")
          .toCollection()
          .modify((row: LocalTimeAllocation) => {
            if (row.sync_status === undefined) row.sync_status = "pending";
            if (row.created_at === undefined) row.created_at = now;
            if (row.deleted_at === undefined) row.deleted_at = null;
          });
      });
  }
}

export const db = new GymDB();
