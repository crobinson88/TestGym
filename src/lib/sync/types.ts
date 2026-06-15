import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import type { GymDB } from "../db";

export type Client = SupabaseClient<Database>;

export type Logger = (msg: string, ...args: unknown[]) => void;

export interface SyncDeps {
  client: Client;
  db: GymDB;
  log?: Logger;
  now?: () => string;
}

export type SyncTable =
  | "sets"
  | "exercises"
  | "categories"
  | "met_activities"
  | "cardio_sessions"
  | "tdl_items"
  | "tdl_days"
  | "tdl_categories"
  | "time_tasks"
  | "time_allocations"
  | "share_trades"
  | "stocks";

export const SYNC_TABLES: readonly SyncTable[] = [
  "categories",
  "exercises",
  "met_activities",
  "sets",
  "cardio_sessions",
  "tdl_categories",
  "tdl_items",
  "tdl_days",
  "time_tasks",
  "time_allocations",
  "share_trades",
  "stocks",
];

// Dexie store names match the Supabase table name for every table except the
// time-tracking pair, which uses camelCase stores. Map SyncTable -> Dexie store.
export const DEXIE_TABLE: Record<SyncTable, string> = {
  sets: "sets",
  exercises: "exercises",
  categories: "categories",
  met_activities: "met_activities",
  cardio_sessions: "cardio_sessions",
  tdl_items: "tdl_items",
  tdl_days: "tdl_days",
  tdl_categories: "tdl_categories",
  time_tasks: "timeTasks",
  time_allocations: "timeAllocations",
  share_trades: "share_trades",
  stocks: "stocks",
};

export interface DrainResult {
  pushed: number;
  failed: number;
}

export interface PullResult {
  fetched: Record<SyncTable, number>;
}

export type SyncStatusEvent =
  | { kind: "idle" }
  | { kind: "pulling" }
  | { kind: "pushing"; pending: number }
  | { kind: "error"; message: string };
