import { addDays } from "@/lib/utils";
import { ageDays } from "./age";
import { isSnoozed } from "./snooze";
import type { LocalTdlItem } from "./types";

// Days without progress after which an open task reads as "not actually being
// done this week". Matches the age styling's top tier (AGE_MAX_DAYS), so a
// suggestion only ever lands on a row already washed red on the board.
export const STALE_AFTER_DAYS = 3;

// A task due inside this window is never suggested — deferring something that
// lands in a couple of days is how it gets missed.
export const DUE_SOON_DAYS = 3;

// Where an undated suggestion wakes up: far enough out to clear the board,
// close enough that it comes back the same fortnight.
export const DEFAULT_SNOOZE_DAYS = 7;

// A dated task wakes this many days before it is due, so it reappears with
// room to actually do it.
export const DUE_LEAD_DAYS = 2;

export type SnoozeReason = "stale" | "paused";

export interface SnoozeSuggestion {
  item: LocalTdlItem;
  reason: SnoozeReason;
  // Days since the task last moved (or since it was added, if it never has).
  stale: number;
  // Suggested wake-up date, always after the item's own day.
  until: string;
}

type Options = {
  staleAfterDays?: number;
  dueSoonDays?: number;
  snoozeDays?: number;
};

// The wake-up date to offer for one item: a dated task comes back shortly
// before it is due, everything else a week out. Never earlier than tomorrow,
// since a snooze only ever moves an item into the future.
export function suggestedWake(
  item: Pick<LocalTdlItem, "due_date" | "snapshot_date">,
  onDate: string,
  snoozeDays = DEFAULT_SNOOZE_DAYS,
): string {
  const floor = addDays(onDate > item.snapshot_date ? onDate : item.snapshot_date, 1);
  const wake =
    item.due_date && item.due_date > onDate
      ? addDays(item.due_date, -DUE_LEAD_DAYS)
      : addDays(onDate, snoozeDays);
  return wake > floor ? wake : floor;
}

// Where a "wake everything in N days" chip puts one item: the horizon, capped at
// the date the item's own due date would have picked, so a bulk re-date can
// never push a dated task past its deadline.
export function horizonWake(
  item: Pick<LocalTdlItem, "due_date" | "snapshot_date">,
  onDate: string,
  days: number,
): string {
  const horizon = suggestedWake({ ...item, due_date: null }, onDate, days);
  if (!item.due_date || item.due_date <= onDate) return horizon;
  const dueAware = suggestedWake(item, onDate, days);
  return horizon < dueAware ? horizon : dueAware;
}

// Whether a task is worth offering up for a snooze. The bar is deliberately
// conservative — a suggestion the user has to untick is worse than one we never
// made — so anything that reads as "this is today's work" is left alone:
// priorities, reluctant tasks (the flag means do it anyway), work already in
// flight, and anything due soon.
export function isSnoozeCandidate(
  item: LocalTdlItem,
  onDate: string,
  opts: Options = {},
): boolean {
  if (item.deleted_at || item.is_archived) return false;
  // A recurring task is re-cut every day; snoozing one says nothing about tomorrow.
  if (item.is_recurring) return false;
  if (isSnoozed(item, onDate)) return false;
  if (item.is_reluctant) return false;
  if (item.priority_rank != null) return false;
  if (item.status !== "open" && item.status !== "paused") return false;
  if (item.due_date && item.due_date <= addDays(onDate, opts.dueSoonDays ?? DUE_SOON_DAYS)) {
    return false;
  }
  // Paused is a hand-made "not now" — take it off the board whatever its age.
  if (item.status === "paused") return true;
  return ageDays(item, onDate) >= (opts.staleAfterDays ?? STALE_AFTER_DAYS);
}

// Every task on the day that looks snoozeable, most-stalled first, each with the
// wake-up date to pre-fill. Pure: the caller decides what is actually written.
export function suggestSnoozes(
  items: LocalTdlItem[],
  onDate: string,
  opts: Options = {},
): SnoozeSuggestion[] {
  return items
    .filter((item) => isSnoozeCandidate(item, onDate, opts))
    .map((item) => ({
      item,
      reason: item.status === "paused" ? ("paused" as const) : ("stale" as const),
      stale: ageDays(item, onDate),
      until: suggestedWake(item, onDate, opts.snoozeDays),
    }))
    .sort(
      (a, b) =>
        b.stale - a.stale ||
        a.item.section.localeCompare(b.item.section) ||
        a.item.position - b.item.position ||
        a.item.title.localeCompare(b.item.title),
    );
}
