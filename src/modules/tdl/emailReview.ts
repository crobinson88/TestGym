// The email review pass: decide, one email at a time, which of the mail sitting
// in your accounts is actually a task.
//
// It follows the propose-then-confirm rule the suggested-snooze and
// roll-forward flows use rather than triage's write-as-you-tap: the candidates
// come from a server call that writes nothing, every ruling is held here, and
// only confirming the pass creates the tasks and the ledger rows. A pass needs
// the network anyway (the mail has to be fetched), so there is no offline
// rhythm to protect — and a half-finished pass that wrote nothing is the safer
// failure.
//
// Pure: no db, no sync, no fetch. The modal supplies the candidates and writes
// what comes back out.
import type { EmailRuling } from "@/lib/database.types";

// The category a reviewed email lands in, remembered per device like the quick
// add bar's pick (resolveQuickAddCategory resolves both).
export const EMAIL_REVIEW_CATEGORY_STORAGE_KEY = "tdl:emailReviewCategory";

// One email waiting to be ruled on, as /api/fireflies-import's "email-review"
// action returns it. `suggested` / `title` / `action` are Claude's read of the
// mail — advice the user overrules in a tap, never a filter: every email in the
// window is shown.
export interface EmailCandidate {
  accountId: string;
  accountLabel: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  url: string;
  receivedAt: string | null;
  suggested: boolean;
  title: string;
  action: string;
}

// "later" writes nothing at all, so the thread comes back in the next pass —
// the explicit "I haven't decided" that lets a pass end without lying.
export type ReviewAction = "add" | "skip" | "later";

export interface ReviewRuling {
  candidate: EmailCandidate;
  action: ReviewAction;
  // The title as it stood when ruled, edited or not. Only read for "add".
  title: string;
  // Category key the task lands in. Only read for "add".
  section: string;
}

export interface ReviewTally {
  added: number;
  skipped: number;
  later: number;
}

// A thread is ruled once per mailbox, so the same thread in two accounts is two
// candidates.
export function candidateKey(
  c: Pick<EmailCandidate, "accountId" | "threadId">,
): string {
  return `${c.accountId}:${c.threadId}`;
}

// Claude's picks first — they are what the pass is really for — then newest
// first inside each group so a stale thread is not the first thing in front of
// you. Mail with no date sorts last rather than jumping the queue.
//
// Applied to ONE page, not the accumulated queue: pages arrive as the user
// works through them, and re-sorting everything would shuffle cards they have
// not reached yet (see appendCandidates).
export function orderCandidates(
  candidates: readonly EmailCandidate[],
): EmailCandidate[] {
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const key = candidateKey(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.sort((a, b) => {
    if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
    const at = a.receivedAt ?? "";
    const bt = b.receivedAt ?? "";
    if (at !== bt) return bt.localeCompare(at);
    return a.subject.localeCompare(b.subject);
  });
}

// The queue is append-only: each page is ordered on its own and added to the
// end. A thread can also straddle two Gmail pages, and it is not in the ledger
// until the pass is confirmed, so an already-queued key is dropped here rather
// than shown twice.
export function appendCandidates(
  queue: readonly EmailCandidate[],
  page: readonly EmailCandidate[],
): EmailCandidate[] {
  const held = new Set(queue.map(candidateKey));
  return [
    ...queue,
    ...orderCandidates(page).filter((c) => !held.has(candidateKey(c))),
  ];
}

export function suggestedCount(candidates: readonly EmailCandidate[]): number {
  return candidates.filter((c) => c.suggested).length;
}

// "Kyp B" <kyp@example.com> → Kyp B. Falls back to the address, since a bare
// address is a perfectly good name for a row.
export function senderName(from: string): string {
  const trimmed = from.trim();
  if (!trimmed) return "";
  const named = /^(.*?)\s*<([^>]+)>\s*$/.exec(trimmed);
  if (!named) return trimmed;
  const name = named[1].replace(/^["']|["']$/g, "").trim();
  return name || named[2].trim();
}

// What a task carries over from the email it came from: who asked, what thread,
// what they wanted, and a link back. The link matters most — the task is a
// pointer to a conversation, not a copy of it.
export function reviewNotes(c: EmailCandidate): string {
  return [
    `From: ${c.from.trim()}`,
    c.subject.trim() ? `Subject: ${c.subject.trim()}` : null,
    `Mailbox: ${c.accountLabel}`,
    c.action.trim() || null,
    c.url,
  ]
    .filter(Boolean)
    .join("\n");
}

// The title that actually lands, after an edit and after trimming. Falls back
// through the suggestion and the subject so a task is never created untitled.
export function resolveTitle(
  c: EmailCandidate,
  edited: string | null | undefined,
): string {
  return edited?.trim() || c.title.trim() || c.subject.trim() || "(no subject)";
}

export interface LedgerRow {
  account_id: string;
  thread_id: string;
  ruling: EmailRuling;
  sender: string;
  subject: string;
  item_id: string | null;
}

// The rows that record this pass. "later" rulings are deliberately absent: no
// row means the thread is offered again next time.
export function ledgerRows(
  rulings: readonly ReviewRuling[],
  itemIdByKey: ReadonlyMap<string, string> = new Map(),
): LedgerRow[] {
  return rulings
    .filter((r) => r.action !== "later")
    .map((r) => ({
      account_id: r.candidate.accountId,
      thread_id: r.candidate.threadId,
      ruling: r.action === "add" ? "added" : "skipped",
      sender: r.candidate.from,
      subject: r.candidate.subject,
      item_id: itemIdByKey.get(candidateKey(r.candidate)) ?? null,
    }));
}

export function summariseReview(rulings: readonly ReviewRuling[]): ReviewTally {
  return {
    added: rulings.filter((r) => r.action === "add").length,
    skipped: rulings.filter((r) => r.action === "skip").length,
    later: rulings.filter((r) => r.action === "later").length,
  };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function describeReview(rulings: readonly ReviewRuling[]): string {
  const { added, skipped, later } = summariseReview(rulings);
  if (added + skipped + later === 0) return "Nothing reviewed";
  const parts = [
    added > 0 ? `${plural(added, "task")} added` : null,
    skipped > 0 ? `${skipped} skipped` : null,
    later > 0 ? `${later} left for later` : null,
  ].filter(Boolean);
  return parts.join(", ");
}

// --- Swipe-left-to-skip ------------------------------------------------------
//
// The pass is a queue worked one-handed on a phone, so the commonest ruling —
// "not a task" — also comes off a leftward swipe on the card. The geometry is
// pure so the thresholds are testable without a touch device. Nothing is
// written until Confirm and Undo is free, so a mis-swipe costs nothing, which
// is what makes a gesture an acceptable way to reach a ruling at all.

// Until the pointer has moved this far the gesture has not declared itself and
// the modal body keeps the scroll.
export const SWIPE_SLOP_PX = 10;
// How far left the card must travel to commit: a share of its own width, with
// a floor so a narrow card still takes a deliberate pull.
export const SWIPE_COMMIT_RATIO = 0.3;
export const SWIPE_COMMIT_MIN_PX = 72;
// How long the committed card takes to leave before the next one is seeded.
export const SWIPE_EXIT_MS = 160;

export function swipeThreshold(width: number): number {
  return Math.max(SWIPE_COMMIT_MIN_PX, width * SWIPE_COMMIT_RATIO);
}

// The card only moves left: there is nothing revealed on the other side, so a
// rightward drag is held at rest rather than rubber-banding the layout.
export function swipeOffset(dx: number): number {
  return dx < 0 ? dx : 0;
}

// Whether a gesture has declared itself horizontal. A tie, and anything
// vertical-dominant, stays with the scroller.
export function isHorizontalSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_SLOP_PX && Math.abs(dx) > Math.abs(dy);
}

export function swipeCommitted(dx: number, width: number): boolean {
  return swipeOffset(dx) <= -swipeThreshold(width);
}

// How far through the pull the user is, 0 → 1, for fading in the affordance
// behind the card.
export function swipeProgress(dx: number, width: number): number {
  const threshold = swipeThreshold(width);
  if (threshold <= 0) return 0;
  return Math.min(1, Math.abs(swipeOffset(dx)) / threshold);
}
