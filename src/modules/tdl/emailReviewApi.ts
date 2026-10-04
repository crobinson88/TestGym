// Network edges of the email review pass. Kept apart from emailReview.ts so the
// decision logic there stays pure and testable.
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { EmailCandidate, LedgerRow } from "./emailReview";

export interface ReviewFetch {
  accounts: { id: string; label: string; address: string }[];
  candidates: EmailCandidate[];
  scanned: number;
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
export async function fetchEmailCandidates(token: string): Promise<ReviewFetch> {
  const res = await fetch("/api/fireflies-import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "email-review" }),
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
