import { supabase } from "../supabase";
import { db } from "../db";
import { createSyncEngine } from "./engine";

export const syncEngine = createSyncEngine({
  client: supabase,
  db,
  log: (msg, ...args) => {
    if (import.meta.env.DEV) console.debug("[sync]", msg, ...args);
  },
});

export { createSyncEngine } from "./engine";
export { mergeRemote } from "./realtime";
export type { SyncEngine } from "./engine";
export type { AddSetInput, AddExerciseInput, AddCategoryInput } from "./mutations";
export type { SyncStatusEvent } from "./types";
