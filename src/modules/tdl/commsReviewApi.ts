// Network edges of the comms review pass. Kept apart from commsReview.ts so the
// decision logic there stays pure and testable.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { CommsCandidate, CommsSource, LedgerRow } from "./commsReview";

// Where each source got to. Slack pages are 1-based ints; Gmail hands back an
// opaque page token. A null means that source reached the end of the range.
export interface CommsCursors {
  slack?: Record<string, number | null>;
  email?: Record<string, string | null>;
}

export interface CommsFetch {
  workspaces: { id: string; label: string }[];
  accounts: { id: string; label: string; address: string }[];
  candidates: CommsCandidate[];
  scanned: number;
  matched: number;
  // How many board tasks the comms were weighed against.
  tasks: number;
  cursors: CommsCursors;
  // Every source walked its whole range and none of them failed.
  done: boolean;
  // One entry per source that could not be read, so a revoked grant does not
  // read as a quiet week.
  errors: { source: CommsSource; label: string; message: string }[];
}

// Read a response as JSON, degrading gracefully when the server returns a
// non-JSON body (Vercel's plain-text 500 on a function crash).
async function readJson<T>(res: Response): Promise<{ parsed: T | null; text: string }> {
  const text = await res.text();
  try {
    return { parsed: JSON.parse(text) as T, text };
  } catch {
    return { parsed: null, text };
  }
}

// Multiplexed onto the meeting-import endpoint: api/ is at Vercel's Hobby-plan
// 12-function cap. Returns candidates only — nothing is written server-side.
export async function fetchCommsCandidates(
  token: string,
  from: string,
  to: string,
  cursors: CommsCursors = {},
): Promise<CommsFetch> {
  const res = await fetch("/api/fireflies-import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "comms-review", from, to, commsCursors: cursors }),
  });
  const { parsed, text } = await readJson<Partial<CommsFetch> & { error?: string }>(res);
  if (!res.ok || !parsed) {
    const detail = parsed?.error ?? text.trim().slice(0, 140);
    throw new Error(
      detail ? `Comms review failed (${res.status}): ${detail}` : `Comms review failed (${res.status})`,
    );
  }
  return {
    workspaces: parsed.workspaces ?? [],
    accounts: parsed.accounts ?? [],
    candidates: parsed.candidates ?? [],
    scanned: parsed.scanned ?? 0,
    matched: parsed.matched ?? 0,
    tasks: parsed.tasks ?? 0,
    cursors: parsed.cursors ?? {},
    // Absent `done` is treated as finished: better to end the pass than to loop
    // fetching pages that never come.
    done: parsed.done ?? true,
    errors: parsed.errors ?? [],
  };
}

// The match ledger is written straight to Supabase rather than through the
// Dexie outbox: a review pass needs the network to fetch the comms in the first
// place, so there is no offline write to queue (the same reasoning that keeps
// the workstreams board out of the sync set). The task changes it causes —
// completing a task, appending to its notes — DO go through the offline-first
// path like every other task write.
//
// The hand-written Database type omits the Relationships key supabase-js wants,
// which narrows writes to `never`; cast the same way outbox.ts and the email
// review writer do rather than regenerate and churn every module.
export async function recordCommsMatches(rows: readonly LedgerRow[]): Promise<void> {
  if (rows.length === 0) return;
  const table = supabase.from("comms_matches") as ReturnType<SupabaseClient<Database>["from"]>;
  const { error } = await table.insert(rows as never);
  if (error) throw new Error(error.message);
}
