import { ageDays, AGE_MAX_DAYS, daysStale } from "./age";
import { isSnoozed } from "./snooze";
import type { LocalTdlItem } from "./types";

// Suggests tasks for the "Don't want to do" list — the ones you keep stepping
// over but still need to do. It reads as the mirror image of the snooze
// suggester: snooze offers up stalled junk to push OFF the board and never
// touches priorities or anything due soon, whereas this surfaces work you're
// plainly avoiding — a blown deadline or a ranked-but-untouched task is exactly
// what belongs here. Pure: the caller decides what actually gets flagged.

// No progress for this many days reads as "you keep putting this off" — the same
// red-washed bar the board's age styling and the snooze suggester use.
export const RELUCTANT_STALE_DAYS = AGE_MAX_DAYS;

// A due date this close counts as looming: a dreaded task with a deadline bearing
// down is the whole point of the list.
export const RELUCTANT_DUE_SOON_DAYS = 3;

// Minutes at/above which a task's sheer size adds to the dread. Half of it earns
// a smaller bump.
export const RELUCTANT_BIG_MINUTES = 60;

// One page of suggestions. Refresh pages through the ranked list five at a time.
export const RELUCTANT_SUGGESTION_LIMIT = 5;

export type ReluctantReason = "overdue" | "stale" | "due_soon";

export interface ReluctantSuggestion {
  item: LocalTdlItem;
  // Blended avoidance score — higher means more likely being dodged.
  score: number;
  // Days since the task last moved (or since it was added, if it never has).
  stale: number;
  // Days past the due date, 0 when not overdue.
  overdue: number;
  reason: ReluctantReason;
}

type Options = {
  staleAfterDays?: number;
  dueSoonDays?: number;
  bigMinutes?: number;
};

// Days a dated task is overdue by, 0 when it isn't (or has no due date).
function overdueDays(item: Pick<LocalTdlItem, "due_date">, onDate: string): number {
  if (!item.due_date || item.due_date >= onDate) return 0;
  return daysStale(item.due_date, onDate);
}

// Days until a task is due, null when it has no future due date.
function dueInDays(item: Pick<LocalTdlItem, "due_date">, onDate: string): number | null {
  if (!item.due_date || item.due_date < onDate) return null;
  return daysStale(onDate, item.due_date);
}

// The blended "how much are you dodging this?" score. Staleness is the base;
// a blown deadline weighs double; a looming deadline and a big time estimate
// each add a fixed bump. Ordering only — the reason line names the top signal.
export function avoidanceScore(item: LocalTdlItem, onDate: string, opts: Options = {}): number {
  const stale = ageDays(item, onDate);
  const over = overdueDays(item, onDate);
  const dueIn = dueInDays(item, onDate);
  const bigMin = opts.bigMinutes ?? RELUCTANT_BIG_MINUTES;
  const size = item.time_estimate_min ?? 0;

  let score = stale;
  score += over * 2;
  if (dueIn != null && dueIn <= (opts.dueSoonDays ?? RELUCTANT_DUE_SOON_DAYS)) score += 3;
  if (size >= bigMin) score += 3;
  else if (size >= bigMin / 2) score += 1;
  return score;
}

// The strongest signal, for the headline reason line. The candidacy gate below
// guarantees at least one of these holds.
function reasonFor(item: LocalTdlItem, onDate: string, opts: Options = {}): ReluctantReason {
  if (overdueDays(item, onDate) > 0) return "overdue";
  if (ageDays(item, onDate) >= (opts.staleAfterDays ?? RELUCTANT_STALE_DAYS)) return "stale";
  return "due_soon";
}

// Whether a task is worth offering up for the "Don't want to do" list. It must be
// live, actionable and untouched (`open`), not already flagged, and show at least
// one avoidance signal — sat past the stale bar, overdue, or due soon — so a fresh
// task you only just added never gets suggested.
export function isReluctantCandidate(
  item: LocalTdlItem,
  onDate: string,
  opts: Options = {},
): boolean {
  if (item.deleted_at || item.is_archived) return false;
  // A recurring task is re-cut every day; being reluctant about one says nothing
  // about tomorrow's copy.
  if (item.is_recurring) return false;
  if (isSnoozed(item, onDate)) return false;
  if (item.is_reluctant) return false;
  // Only untouched work — anything in progress, paused, done or cancelled isn't
  // being avoided.
  if (item.status !== "open") return false;

  const stale = ageDays(item, onDate);
  const over = overdueDays(item, onDate);
  const dueIn = dueInDays(item, onDate);
  const dueSoon = dueIn != null && dueIn <= (opts.dueSoonDays ?? RELUCTANT_DUE_SOON_DAYS);
  return stale >= (opts.staleAfterDays ?? RELUCTANT_STALE_DAYS) || over > 0 || dueSoon;
}

// Every candidate on the day, most-avoided first. Unlike the snooze suggester
// this keeps ranked priorities in — a dreaded-but-important task is a prime
// entry. The caller pages through the list five at a time.
export function suggestReluctant(
  items: LocalTdlItem[],
  onDate: string,
  opts: Options = {},
): ReluctantSuggestion[] {
  return items
    .filter((item) => isReluctantCandidate(item, onDate, opts))
    .map((item) => ({
      item,
      score: avoidanceScore(item, onDate, opts),
      stale: ageDays(item, onDate),
      overdue: overdueDays(item, onDate),
      reason: reasonFor(item, onDate, opts),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.item.section.localeCompare(b.item.section) ||
        a.item.position - b.item.position ||
        a.item.title.localeCompare(b.item.title),
    );
}
