// Network edges of the email review pass. Kept apart from emailReview.ts so the
// decision logic there stays pure and testable.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { EmailAction, EmailCandidate, LedgerRow } from "./emailReview";

export type ReviewCursors = Record<string, string | null>;

export interface ReviewFetch {
  accounts: { id: string; label: string; address: string }[];
  candidates: EmailCandidate[];
  scanned: number;
  matched: number;
  // Where each mailbox got to; passed straight back to load the next page.
  cursors: ReviewCursors;
  // Every mailbox reached the end of its window.
  done: boolean;
  // The mailboxes' own labels, for the picker. Only sent on the first page.
  labels: { accountId: string; id: string; name: string }[];
  // One entry per mailbox that could not be read, so a revoked grant does not
  // read as an empty inbox.
  errors: { accountId: string; label: string; message: string }[];
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
export async function fetchEmailCandidates(
  token: string,
  cursors: ReviewCursors = {},
): Promise<ReviewFetch> {
  const res = await fetch("/api/fireflies-import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "email-review", cursors }),
  });
  const { parsed, text } = await readJson<Partial<ReviewFetch> & { error?: string }>(res);
  if (!res.ok || !parsed) {
    const detail = parsed?.error ?? text.trim().slice(0, 140);
    throw new Error(detail ? `Review failed (${res.status}): ${detail}` : `Review failed (${res.status})`);
  }
  return {
    accounts: parsed.accounts ?? [],
    candidates: parsed.candidates ?? [],
    scanned: parsed.scanned ?? 0,
    matched: parsed.matched ?? 0,
    labels: parsed.labels ?? [],
    cursors: parsed.cursors ?? {},
    // Absent `done` is treated as finished: better to end the pass than to
    // loop fetching pages that never come.
    done: parsed.done ?? true,
    errors: parsed.errors ?? [],
  };
}

// The ledger is written straight to Supabase rather than through the Dexie
// outbox: a review pass needs the network to fetch the mail in the first place,
// so there is no offline write to queue (the same reasoning that keeps the
// workstreams board out of the sync set). The tasks it creates DO go through
// the offline-first path like every other task.
//
// The hand-written Database type omits the Relationships key supabase-js wants,
// which narrows writes to `never`; cast the same way outbox.ts and the
// workstreams writer do rather than regenerate and churn every module.
export async function recordEmailReviews(rows: readonly LedgerRow[]): Promise<void> {
  if (rows.length === 0) return;
  const table = supabase.from("email_reviews") as ReturnType<SupabaseClient<Database>["from"]>;
  const { error } = await table.insert(rows as never);
  if (error) throw new Error(error.message);
}

export interface ApplyResult {
  threadId: string;
  ok: boolean;
  error?: string;
}

// The mailbox half of a confirmed pass: archive and label the ruled threads.
// Separate from the ledger write on purpose — the ledger is ours and always
// succeeds, while this reaches into Gmail and can partly fail, so the caller
// reports what did not land rather than rolling the pass back.
export async function applyEmailActions(
  token: string,
  actions: readonly EmailAction[],
): Promise<ApplyResult[]> {
  if (actions.length === 0) return [];
  const res = await fetch("/api/fireflies-import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "email-apply", actions }),
  });
  const { parsed, text } = await readJson<{ results?: ApplyResult[]; error?: string }>(res);
  if (!res.ok || !parsed) {
    const detail = parsed?.error ?? text.trim().slice(0, 140);
    throw new Error(detail ? `Gmail update failed: ${detail}` : "Gmail update failed");
  }
  return parsed.results ?? [];
}
