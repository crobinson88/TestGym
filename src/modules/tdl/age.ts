import type { LocalTdlItem } from "./types";
import type { TdlStatus } from "./types";

// Days-since-last-worked at which an item hits maximum "stale" urgency. Below
// this it escalates one tier per day; at or beyond it, it stays at the top tier.
export const AGE_MAX_DAYS = 3;

// 0 = fresh (no styling), 1..3 = escalating urgency, 3 = the ceiling.
export type AgeLevel = 0 | 1 | 2 | 3;

// Statuses that count as having "worked on" the item. Cancelling is abandonment,
// not work, so it never stamps last_worked_at.
export function isWorkedStatus(status: TdlStatus): boolean {
  return status === "worked_today" || status === "ready_for_testing" || status === "done";
}

// Decide an item's next last_worked_at on a status change. It stamps `now` only
// when the status leaves "open" for a worked/done state; going back to "open"
// (including the day-wide "Reset all to Open") leaves the prior stamp intact, so
// it always reflects the last real progress. An explicit patched value wins.
export function nextLastWorkedAt(args: {
  prevStatus: TdlStatus;
  nextStatus: TdlStatus;
  prevLastWorked: string | null;
  patchLastWorked?: string | null;
  now: string;
}): string | null {
  if (args.patchLastWorked !== undefined) return args.patchLastWorked;
  if (args.prevStatus === "open" && isWorkedStatus(args.nextStatus)) return args.now;
  return args.prevLastWorked ?? null;
}

type AgeItem = Pick<
  LocalTdlItem,
  "last_worked_at" | "snapshot_date" | "origin_snapshot_date" | "status"
>;

// The day an item was last acted on: the date its status last moved off "open",
// falling back to the day it was added (origin) when it has never been worked.
export function lastActivityDate(item: AgeItem): string {
  if (item.last_worked_at) return item.last_worked_at.slice(0, 10);
  return item.origin_snapshot_date ?? item.snapshot_date;
}

// Whole days from a → b (both YYYY-MM-DD), clamped at 0 so a future last-activity
// date never reads as "negative age".
export function daysStale(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map((p) => parseInt(p, 10));
  const [by, bm, bd] = b.split("-").map((p) => parseInt(p, 10));
  const diff = Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
  return Math.max(0, diff);
}

// Days between the item's last activity and the board day it is shown on.
export function ageDays(item: AgeItem, reference = item.snapshot_date): number {
  return daysStale(lastActivityDate(item), reference);
}

// Urgency tier from the age in days. Done/cancelled items never build urgency —
// only open, in-progress work goes stale.
export function ageLevel(item: AgeItem, reference = item.snapshot_date): AgeLevel {
  if (item.status === "done" || item.status === "cancelled") return 0;
  const days = ageDays(item, reference);
  if (days <= 0) return 0;
  if (days === 1) return 1;
  if (days === 2) return 2;
  return 3;
}
