// The comms review pass: read what you actually wrote across Slack and email
// over a date range, and rule on the to-do tasks it matches.
//
// One card per task, carrying the communications that evidence it and Claude's
// read — "done" (it shipped) or "connected" (related, still in flight). The
// user rules on each: complete it, link the evidence to it, say it is not a
// match, or decide later.
//
// Propose-then-confirm, like the email review pass and the suggested snoozes
// rather than triage's write-as-you-tap: the server call writes nothing, every
// ruling is held in modal state, and only confirming completes tasks and writes
// the match ledger. A pass needs the network anyway (the comms have to be
// fetched), so there is no offline rhythm to protect — and a half-finished
// pass that wrote nothing is the safer failure.
//
// Pure: no db, no sync, no fetch. The modal supplies the candidates and writes
// what comes back out.
import type { CommsRuling as LedgerRuling, CommsSource } from "@/lib/database.types";

export type { CommsSource };

// The category a reviewed task's evidence lands in is the task's own, so unlike
// the email review there is nothing to remember per device.

// How much of the past a pass covers by default: a working week back from
// today, which is the window "what did I work on" is usually asked over.
export const DEFAULT_RANGE_DAYS = 7;

// One communication the user sent, as the server returns it.
export interface Comm {
  source: CommsSource;
  // Stable id within the source: a Slack `ts` or a Gmail thread id. With
  // `source` this is the ledger key, matching the partial unique index.
  key: string;
  accountLabel: string;
  // "#channel" for Slack, the subject line for email.
  heading: string;
  text: string;
  url: string | null;
  at: string | null;
}

// One card: a task, the comms that evidence it, and Claude's read. The verdict
// is advice the user overrules in a tap, never a filter.
export interface CommsCandidate {
  // The roll-forward chain root — a task gets a fresh row every day it carries
  // over, so the ledger keys on the chain, as tdl_comments and
  // tdl_completions do.
  threadId: string;
  itemId: string;
  itemTitle: string;
  categoryLabel: string;
  status: string;
  verdict: "done" | "connected";
  reason: string;
  comms: Comm[];
}

// "later" writes nothing at all, so the pair comes back in the next pass — the
// explicit "I haven't decided" that lets a pass end without lying.
export type CommsAction = "done" | "connected" | "skip" | "later";

export interface CommsRuling {
  candidate: CommsCandidate;
  action: CommsAction;
}

export interface CommsTally {
  done: number;
  connected: number;
  skipped: number;
  later: number;
}

// --- The date range ----------------------------------------------------------

export interface DateRange {
  from: string;
  to: string;
}

// UTC-safe day arithmetic: the app's dates are plain YYYY-MM-DD, and parsing
// one as local time shifts it a day either side of midnight in some zones.
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// A week ending today, inclusive of both ends — so seven days, not eight.
export function defaultRange(today: string): DateRange {
  return { from: shiftDate(today, -(DEFAULT_RANGE_DAYS - 1)), to: today };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidRange(from: string, to: string): boolean {
  return ISO_DATE.test(from) && ISO_DATE.test(to) && from <= to;
}

export function rangeDays(from: string, to: string): number {
  if (!isValidRange(from, to)) return 0;
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

// --- The queue ---------------------------------------------------------------

// A card is one task, so the chain root identifies it. Two pages can both turn
// up evidence for the same task; the second is merged rather than shown twice.
export function candidateKey(c: Pick<CommsCandidate, "threadId">): string {
  return c.threadId;
}

export function commKey(c: Pick<Comm, "source" | "key">): string {
  return `${c.source}:${c.key}`;
}

// The newest piece of evidence on a card, for ordering. Comms with no date sort
// last rather than jumping the queue.
export function newestCommAt(c: CommsCandidate): string {
  return c.comms.reduce((newest, m) => ((m.at ?? "") > newest ? (m.at ?? "") : newest), "");
}

// "done" first — they are what the pass is really for, since they are the ones
// that clear the board — then the best-evidenced, then the most recent.
//
// Applied to ONE page, not the accumulated queue: pages arrive as the user works
// through them, and re-sorting everything would shuffle cards they have not
// reached yet (see appendCandidates).
export function orderCandidates(candidates: readonly CommsCandidate[]): CommsCandidate[] {
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const key = candidateKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => {
    if (a.verdict !== b.verdict) return a.verdict === "done" ? -1 : 1;
    if (a.comms.length !== b.comms.length) return b.comms.length - a.comms.length;
    const at = newestCommAt(a);
    const bt = newestCommAt(b);
    if (at !== bt) return bt.localeCompare(at);
    return a.itemTitle.localeCompare(b.itemTitle);
  });
}

// The queue is append-only: each page is ordered on its own and added to the
// end. A task can turn up in two pages (its evidence split across them), and it
// is not in the ledger until the pass is confirmed, so the later page's comms
// are folded into the card already queued rather than dealt as a second card.
export function appendCandidates(
  queue: readonly CommsCandidate[],
  page: readonly CommsCandidate[],
): CommsCandidate[] {
  const indexByKey = new Map(queue.map((c, i) => [candidateKey(c), i] as const));
  const merged = [...queue];
  const fresh: CommsCandidate[] = [];

  for (const c of orderCandidates(page)) {
    const at = indexByKey.get(candidateKey(c));
    if (at === undefined) {
      fresh.push(c);
      continue;
    }
    const held = merged[at];
    const have = new Set(held.comms.map(commKey));
    const added = c.comms.filter((m) => !have.has(commKey(m)));
    if (added.length === 0) continue;
    merged[at] = {
      ...held,
      comms: [...held.comms, ...added],
      // A later page finding finished-work evidence upgrades the card: "done"
      // is the stronger claim and the one the user wants to see.
      verdict: held.verdict === "done" || c.verdict === "done" ? "done" : held.verdict,
      reason: held.verdict === "done" || c.verdict !== "done" ? held.reason : c.reason,
    };
  }

  return [...merged, ...fresh];
}

export function doneCount(candidates: readonly CommsCandidate[]): number {
  return candidates.filter((c) => c.verdict === "done").length;
}

// --- What a ruling writes ----------------------------------------------------

// What gets appended to a task's notes when its evidence is linked to it. The
// links matter most: the note is a pointer back to the conversations, not a
// copy of them.
export function evidenceNote(c: CommsCandidate): string {
  const lines = [`Comms: ${c.reason.trim()}`.trim()];
  for (const m of c.comms) {
    const where = `${m.source === "slack" ? "Slack" : "Email"} · ${m.accountLabel} · ${m.heading}`;
    const when = m.at ? ` · ${m.at.slice(0, 10)}` : "";
    lines.push(`- ${where}${when}${m.url ? `\n  ${m.url}` : ""}`);
  }
  return lines.join("\n");
}

// Appending rather than replacing: the description is the user's, and a review
// pass has no business overwriting it.
export function appendNotes(existing: string | null | undefined, addition: string): string {
  const held = (existing ?? "").trimEnd();
  if (!held) return addition;
  return `${held}\n\n${addition}`;
}

export interface LedgerRow {
  thread_id: string;
  item_id: string | null;
  item_title: string;
  source: CommsSource;
  comm_key: string;
  comm_url: string | null;
  comm_excerpt: string | null;
  comm_at: string | null;
  ruling: LedgerRuling;
}

// How much of a message is worth keeping on the ledger: enough to recognise it
// later without storing the conversation.
const EXCERPT_CHARS = 280;

// The rows that record this pass — ONE PER (task, communication) PAIR, which is
// what the partial unique index is on, so a given message is ruled once against
// a given task chain.
//
// "later" rulings are deliberately absent: no row means the pair is offered
// again next time.
export function ledgerRows(rulings: readonly CommsRuling[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const r of rulings) {
    if (r.action === "later") continue;
    const ruling: LedgerRuling =
      r.action === "done" ? "done" : r.action === "connected" ? "connected" : "skipped";
    for (const m of r.candidate.comms) {
      rows.push({
        thread_id: r.candidate.threadId,
        item_id: r.candidate.itemId,
        item_title: r.candidate.itemTitle,
        source: m.source,
        comm_key: m.key,
        comm_url: m.url,
        comm_excerpt: m.text.trim().slice(0, EXCERPT_CHARS) || null,
        comm_at: m.at,
        ruling,
      });
    }
  }
  return rows;
}

export function summariseCommsReview(rulings: readonly CommsRuling[]): CommsTally {
  return {
    done: rulings.filter((r) => r.action === "done").length,
    connected: rulings.filter((r) => r.action === "connected").length,
    skipped: rulings.filter((r) => r.action === "skip").length,
    later: rulings.filter((r) => r.action === "later").length,
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function describeCommsReview(rulings: readonly CommsRuling[]): string {
  const { done, connected, skipped, later } = summariseCommsReview(rulings);
  if (done + connected + skipped + later === 0) return "Nothing reviewed";
  const parts = [
    done > 0 ? `${plural(done, "task")} completed` : null,
    connected > 0 ? `${connected} linked` : null,
    skipped > 0 ? `${skipped} not a match` : null,
    later > 0 ? `${later} left for later` : null,
  ].filter(Boolean);
  return parts.join(", ");
}
