import { ageDays } from "./age";
import { isSnoozed } from "./snooze";
import { statusLabel } from "./status";
import type { LocalTdlItem, TdlStatus } from "./types";

// What a single card in the status pass can be ruled on: a status to set,
// "archive" — the task is done with the board, not just with today — or
// "skip", the explicit "leave this one as it is" that lets the pass move on
// without a write. Priority is not a ruling: it rides alongside whichever of
// these the card gets (see StatusDecision.rank), since re-ranking a task says
// nothing about whether its status moved.
export type StatusPassAction = TdlStatus | "skip" | "archive";

// Whether a task is worth putting in front of the user to re-state. Anything
// off the board is skipped (archived, deleted, snoozed) and so is anything
// already settled (done, cancelled) — the pass is for work still in flight.
// Unlike triage, **recurring tasks are included**: they are re-cut every day
// precisely so their status is set again today.
export function isStatusPassCandidate(
  item: LocalTdlItem,
  onDate: string,
): boolean {
  if (item.deleted_at || item.is_archived) return false;
  if (isSnoozed(item, onDate)) return false;
  return (
    item.status === "open" ||
    item.status === "worked_today" ||
    item.status === "ready_for_testing" ||
    item.status === "paused"
  );
}

export interface StatusCard {
  item: LocalTdlItem;
  // Days since the task last moved (or since it was added, if it never has).
  stale: number;
}

function rankKey(item: LocalTdlItem): number {
  return item.priority_rank ?? Number.POSITIVE_INFINITY;
}

// The day's cards in the order they are shown. A status pass is a walk back
// over the day's work, so it follows the day's own shape rather than triage's
// most-stalled-first: ranked priorities lead in rank order, then the recurring
// dailies (quick ticks), then each category in board order.
export function collectStatusQueue(
  items: LocalTdlItem[],
  onDate: string,
): StatusCard[] {
  return items
    .filter((item) => isStatusPassCandidate(item, onDate))
    .map((item) => ({ item, stale: ageDays(item, onDate) }))
    .sort(
      (a, b) =>
        rankKey(a.item) - rankKey(b.item) ||
        Number(b.item.is_recurring) - Number(a.item.is_recurring) ||
        a.item.section.localeCompare(b.item.section) ||
        a.item.position - b.item.position ||
        a.item.title.localeCompare(b.item.title),
    );
}

// Tapping the status a task already has is a confirmation, not a change — it
// moves the pass on without a write, the same as a skip. Archive always writes:
// a candidate is never already archived.
export function isNoOp(
  item: Pick<LocalTdlItem, "status">,
  action: StatusPassAction,
): boolean {
  return action === "skip" || action === item.status;
}

export interface StatusDecision {
  id: string;
  title: string;
  action: StatusPassAction;
  // The rank the card was left on, when the user touched the priority picker
  // while it was up. `undefined` means priority was never touched — distinct
  // from `null`, which is a rank deliberately cleared.
  rank?: number | null;
  // The fields the write changed, as they were before it. Undo restores these.
  before: {
    status: TdlStatus;
    last_worked_at: string | null;
    is_archived: boolean;
    priority_rank: number | null;
  };
}

// Whether a ruling actually moved the task's rank (as opposed to leaving the
// picker alone, or re-picking the rank it already held).
export function rankChanged(d: StatusDecision): boolean {
  return d.rank !== undefined && d.rank !== d.before.priority_rank;
}

// Whether a ruling wrote anything at all: a status change, an archive, a new
// rank, or any combination.
export function wroteAnything(d: StatusDecision): boolean {
  if (d.action === "archive") return true;
  if (d.action !== "skip" && d.action !== d.before.status) return true;
  return rankChanged(d);
}

export interface StatusTally {
  // Cards that wrote something — counted once each, however many of the three
  // things they changed.
  updated: number;
  skipped: number;
  archived: number;
  prioritised: number;
  byStatus: Partial<Record<TdlStatus, number>>;
}

export function summariseStatusPass(decisions: StatusDecision[]): StatusTally {
  const tally: StatusTally = {
    updated: 0,
    skipped: 0,
    archived: 0,
    prioritised: 0,
    byStatus: {},
  };
  for (const d of decisions) {
    if (wroteAnything(d)) tally.updated++;
    else tally.skipped++;
    if (rankChanged(d)) tally.prioritised++;
    if (d.action === "archive") tally.archived++;
    else if (d.action !== "skip" && d.action !== d.before.status) {
      tally.byStatus[d.action] = (tally.byStatus[d.action] ?? 0) + 1;
    }
  }
  return tally;
}

// The one-line result of a finished pass, naming only what actually happened.
export function describeStatusPass(decisions: StatusDecision[]): string {
  if (decisions.length === 0) return "Nothing updated";
  const t = summariseStatusPass(decisions);
  if (t.updated === 0)
    return `Reviewed ${t.skipped} task${t.skipped === 1 ? "" : "s"}, none changed`;
  const parts = (Object.entries(t.byStatus) as [TdlStatus, number][])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    // The label is category-specific only for ready_for_testing, which can only
    // ever be set from a Product card, so the section here is immaterial.
    .map(
      ([status, n]) => `${n} ${statusLabel(status, "product").toLowerCase()}`,
    );
  if (t.archived > 0) parts.push(`${t.archived} archived`);
  if (t.prioritised > 0) parts.push(`${t.prioritised} prioritised`);
  const skipped = t.skipped > 0 ? ` · ${t.skipped} skipped` : "";
  return `Updated ${t.updated} task${t.updated === 1 ? "" : "s"} · ${parts.join(", ")}${skipped}`;
}
