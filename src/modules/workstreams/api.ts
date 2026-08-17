import { v4 as uuid } from "uuid";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database, WorkstreamRow, WorkstreamStatus, WorkstreamType } from "@/lib/database.types";

// Workstreams bypass the Dexie outbox on purpose (see the migration header):
// these rows track processes on other machines, so a queued offline edit would
// be writing about state it can no longer see. Every call here hits Supabase
// directly and surfaces the failure to the caller.

// This project's Database type is hand-written and omits the per-table
// `Relationships` key supabase-js expects, so the client narrows every write
// payload to `never`. Reads are unaffected. The sync outbox casts the same way
// (see lib/sync/outbox.ts) — do the same here rather than regenerate the types
// and churn every other module.
function writes() {
  return supabase.from("workstreams") as ReturnType<SupabaseClient<Database>["from"]>;
}

export async function fetchWorkstreams(): Promise<WorkstreamRow[]> {
  const { data, error } = await supabase
    .from("workstreams")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as WorkstreamRow[];
}

export async function setWorkstreamStatus(
  id: string,
  status: WorkstreamStatus,
): Promise<void> {
  const { error } = await writes()
    .update({ status, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// Soft delete, matching the rest of the app — the row leaves the board but the
// unique index frees up so the same terminal session can be logged again.
export async function dismissWorkstream(id: string): Promise<void> {
  const ts = new Date().toISOString();
  const { error } = await writes()
    .update({ deleted_at: ts, updated_at: ts } as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function clearCompleted(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const ts = new Date().toISOString();
  const { error } = await writes()
    .update({ deleted_at: ts, updated_at: ts } as never)
    .in("id", ids as string[]);
  if (error) throw new Error(error.message);
}

export interface AddWorkstreamInput {
  title: string;
  type: WorkstreamType;
  last_action?: string | null;
  metadata?: Record<string, unknown>;
}

// Hand-typed rows (web/Cowork chats). source_id stays null so they never
// collide with hook-driven rows on the live-source unique index.
export async function addWorkstream(input: AddWorkstreamInput): Promise<WorkstreamRow> {
  const id = uuid();
  const ts = new Date().toISOString();
  const { data, error } = await writes()
    .insert({
      id,
      title: input.title.trim(),
      type: input.type,
      status: "in_progress",
      source_id: null,
      last_action: input.last_action?.trim() || null,
      metadata: input.metadata ?? {},
      client_id: id,
      updated_at: ts,
      deleted_at: null,
    } as never)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as WorkstreamRow;
}

export interface TriageResult {
  scanned: number;
  logged: number;
}

// FR-3, on demand rather than on a cron: Hobby-plan crons only fire once a day,
// which is useless for a live board. Multiplexed onto /api/fireflies-import to
// stay inside the 12-function budget.
export async function triageEmail(token: string): Promise<TriageResult> {
  const res = await fetch("/api/fireflies-import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "workstream-triage" }),
  });
  type Payload = { scanned?: number; logged?: number; error?: string };
  let parsed: Payload | null = null;
  try {
    parsed = (await res.json()) as Payload;
  } catch {
    parsed = null;
  }
  if (!res.ok) throw new Error(parsed?.error || `triage failed (${res.status})`);
  return { scanned: parsed?.scanned ?? 0, logged: parsed?.logged ?? 0 };
}
