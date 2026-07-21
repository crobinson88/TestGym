import Dexie, { type Table } from "dexie";
import type {
  CardioSessionRow,
  CategoryRow,
  ConflictRow,
  ExerciseRow,
  FoodEntryRow,
  FoodGoalRow,
  ForecastRow,
  DrivingAttemptRow,
  FrenchAttemptRow,
  MarketNoteRow,
  MetActivityRow,
  ReadingItemRow,
  SetRow,
  ShareTradeRow,
  SmokingLogRow,
  StockRow,
  TipRow,
  TdlCategoryRow,
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

export interface LocalTdlCategory extends TdlCategoryRow {
  sync_status: SyncStatus;
}

export interface MetaRow {
  key: string;
  value: string;
  updated_at: string;
}

// Investor-relations document, as fetched from SEC EDGAR / FMP. This is a
// derived, regenerable cache — not user-authored content.
export interface IrCacheDoc {
  id: string;
  title: string;
  form: string | null;
  date: string;
  url: string;
  source: "sec" | "fmp";
}

// Local-only cache of a ticker's IR document list. Deliberately NOT a sync
// table: it never touches Supabase, so refreshing it can't break stock sync and
// needs no schema migration. Re-fetched per-device on demand.
export interface IrCacheRow {
  ticker: string;
  documents: IrCacheDoc[];
  refreshed_at: string;
}

export interface LocalTimeTask extends TimeTaskRow {
  sync_status: SyncStatus;
}

export interface LocalTimeAllocation extends TimeAllocationRow {
  sync_status: SyncStatus;
}

export interface LocalShareTrade extends ShareTradeRow {
  sync_status: SyncStatus;
  sync_attempts: number;
  sync_last_error: string | null;
}

export interface LocalStock extends StockRow {
  sync_status: SyncStatus;
}

export interface LocalForecast extends ForecastRow {
  sync_status: SyncStatus;
}

export interface LocalDrivingAttempt extends DrivingAttemptRow {
  sync_status: SyncStatus;
}

export interface LocalFrenchAttempt extends FrenchAttemptRow {
  sync_status: SyncStatus;
}

export interface LocalReadingItem extends ReadingItemRow {
  sync_status: SyncStatus;
}

export interface LocalTip extends TipRow {
  sync_status: SyncStatus;
}

export interface LocalMarketNote extends MarketNoteRow {
  sync_status: SyncStatus;
}

export interface LocalSmokingLog extends SmokingLogRow {
  sync_status: SyncStatus;
}

export interface LocalFoodEntry extends FoodEntryRow {
  sync_status: SyncStatus;
}

export interface LocalFoodGoal extends FoodGoalRow {
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
  tdl_categories!: Table<LocalTdlCategory, string>;
  share_trades!: Table<LocalShareTrade, string>;
  stocks!: Table<LocalStock, string>;
  forecasts!: Table<LocalForecast, string>;
  french_attempts!: Table<LocalFrenchAttempt, string>;
  driving_attempts!: Table<LocalDrivingAttempt, string>;
  reading_items!: Table<LocalReadingItem, string>;
  tips!: Table<LocalTip, string>;
  market_notes!: Table<LocalMarketNote, string>;
  smoking_logs!: Table<LocalSmokingLog, string>;
  food_entries!: Table<LocalFoodEntry, string>;
  food_goals!: Table<LocalFoodGoal, string>;
  ir_cache!: Table<IrCacheRow, string>;

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
    this.version(7).stores({
      tdl_categories: "id, key, sort_order, updated_at, sync_status, deleted_at",
    });
    this.version(8).stores({
      share_trades:
        "id, ticker, side, traded_at, updated_at, sync_status, deleted_at",
    });
    this.version(9).stores({
      stocks: "id, ticker, updated_at, sync_status, deleted_at",
    });
    this.version(10).stores({
      forecasts: "id, ticker, made_on, target_date, updated_at, sync_status, deleted_at",
    });
    this.version(11).upgrade(async (tx) => {
      await tx
        .table("tdl_items")
        .toCollection()
        .modify((row: LocalTdlItem) => {
          if (row.images === undefined) row.images = [];
        });
    });
    this.version(12).stores({
      french_attempts: "id, kind, started_at, updated_at, sync_status, deleted_at",
    });
    this.version(13).stores({
      reading_items: "id, is_read, created_at, updated_at, sync_status, deleted_at",
    });
    this.version(14).stores({
      tips: "id, ticker, status, received_at, updated_at, sync_status, deleted_at",
    });
    this.version(15).stores({
      market_notes: "id, noted_at, updated_at, sync_status, deleted_at",
    });
    this.version(16).stores({
      ir_cache: "ticker, refreshed_at",
    });
    // Priority flag → priority rank. Carry a flagged item over as rank 1 (most
    // important); unflagged items become unranked (null).
    this.version(17).upgrade(async (tx) => {
      await tx
        .table("tdl_items")
        .toCollection()
        .modify((row: LocalTdlItem & { is_priority?: boolean }) => {
          if (row.priority_rank === undefined) {
            row.priority_rank = row.is_priority ? 1 : null;
          }
          delete row.is_priority;
        });
    });
    this.version(18).upgrade(async (tx) => {
      await tx
        .table("tdl_items")
        .toCollection()
        .modify((row: LocalTdlItem) => {
          if (row.is_reluctant === undefined) row.is_reluctant = false;
          if (row.reluctance_reason === undefined) row.reluctance_reason = null;
        });
    });
    this.version(19).stores({
      smoking_logs: "id, log_date, updated_at, sync_status, deleted_at",
    });
    this.version(20).upgrade(async (tx) => {
      await tx
        .table("exercises")
        .toCollection()
        .modify((row: LocalExercise) => {
          if (row.ready_for_increase === undefined) row.ready_for_increase = false;
        });
    });
    this.version(21).upgrade(async (tx) => {
      await tx
        .table("market_notes")
        .toCollection()
        .modify((row: LocalMarketNote) => {
          if (row.research === undefined) row.research = [];
        });
    });
    this.version(22).upgrade(async (tx) => {
      await tx
        .table("tdl_items")
        .toCollection()
        .modify((row: LocalTdlItem) => {
          if (row.last_worked_at === undefined) row.last_worked_at = null;
        });
    });
    this.version(23).upgrade(async (tx) => {
      await tx
        .table("tdl_items")
        .toCollection()
        .modify((row: LocalTdlItem) => {
          if (row.eisenhower_quadrant === undefined) row.eisenhower_quadrant = null;
        });
    });
    this.version(24).stores({
      food_entries: "id, entry_date, updated_at, sync_status, deleted_at",
      food_goals: "id, updated_at, sync_status, deleted_at",
    });
    this.version(25).upgrade(async (tx) => {
      await tx
        .table("food_goals")
        .toCollection()
        .modify((row: LocalFoodGoal) => {
          if (row.sex === undefined) row.sex = "male";
          if (row.age === undefined) row.age = null;
          if (row.height_cm === undefined) row.height_cm = null;
          if (row.weight_lb === undefined) row.weight_lb = null;
          if (row.activity_factor === undefined) row.activity_factor = 1.2;
        });
    });
    this.version(26).stores({
      driving_attempts: "id, section, started_at, updated_at, sync_status, deleted_at",
    });
  }
}

export const db = new GymDB();
