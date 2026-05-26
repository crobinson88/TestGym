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
  | "cardio_sessions";

export const SYNC_TABLES: readonly SyncTable[] = [
  "categories",
  "exercises",
  "met_activities",
  "sets",
  "cardio_sessions",
];

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
