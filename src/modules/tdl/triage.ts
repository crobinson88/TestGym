import { addDays } from "@/lib/utils";
import { ageDays } from "./age";
import { isSnoozed } from "./snooze";
import type { LocalTdlItem } from "./types";

// What a single card in the triage flow can be ruled on. "keep" writes nothing —
// it is the explicit "yes, this stays on the board" that lets the pass finish.
export type TriageAction = "keep" | "archive" | "delete" | "snooze";

export type SnoozeHorizon = "tomorrow" | "two_business_days" | "next_week" | "next_month";

export const SNOOZE_HORIZONS: { key: SnoozeHorizon; label: string }[] = [
  { key: "tomorrow", label: "Tomorrow" },
  { key: "two_business_days", label: "2 business days" },
  { key: "next_week", label: "Next week" },
  { key: "next_month", label: "Next month" },
];

function dayOfWeek(iso: string): number {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const dow = dayOfWeek(iso);
  return dow === 0 || dow === 6;
}

// Step forward `days` working days, skipping Saturdays and Sundays. Counts
// landings, not calendar days, so Friday + 2 is Tuesday.
export function addBusinessDays(iso: string, days: number): string {
  let out = iso;
  let left = days;
  while (left > 0) {
    out = addDays(out, 1);
    if (!isWeekend(out)) left--;
  }
  return out;
}

// The Monday after `iso`. A Sunday's "next week" is tomorrow; every other day
// gets the start of the following week.
export function nextMonday(iso: string): string {
  const dow = dayOfWeek(iso);
  return addDays(iso, dow === 0 ? 1 : 8 - dow);
}

// The 1st of the month after `iso`.
export function firstOfNextMonth(iso: string): string {
  const [y, m] = iso.split("-").map((p) => parseInt(p, 10));
  const year = m === 12 ? y + 1 : y;
  const month = m === 12 ? 1 : m + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

// The wake-up date one horizon chip resolves to for a given item. The base is
// the later of the day being triaged and the item's own day, and the result is
// floored at the day after it: a snooze only ever moves an item forward (and
// snoozeItem rejects anything that doesn't).
export function horizonDate(
  item: Pick<LocalTdlItem, "snapshot_date">,
  onDate: string,
  horizon: SnoozeHorizon,
): string {
  const base = onDate > item.snapshot_date ? onDate : item.snapshot_date;
  const wake =
    horizon === "tomorrow"
      ? addDays(base, 1)
      : horizon === "two_business_days"
        ? addBusinessDays(base, 2)
        : horizon === "next_week"
          ? nextMonday(base)
          : firstOfNextMonth(base);
  const floor = addDays(base, 1);
  return wake > floor ? wake : floor;
}

// Whether a task is worth putting in front of the user one card at a time.
// Anything already dealt with is skipped: archived, deleted, snoozed, finished
// or abandoned work needs no ruling. Recurring tasks are left out for the same
// reason they are never suggested for a snooze — they are re-cut every day, so
// archiving or deferring one says nothing about tomorrow.
export function isTriageCandidate(item: LocalTdlItem, onDate: string): boolean {
  if (item.deleted_at || item.is_archived) return false;
  if (item.is_recurring) return false;
  if (isSnoozed(item, onDate)) return false;
  return (
    item.status === "open" ||
    item.status === "worked_today" ||
    item.status === "ready_for_testing" ||
    item.status === "paused"
  );
}

export interface TriageCard {
  item: LocalTdlItem;
  // Days since the task last moved (or since it was added, if it never has).
  stale: number;
}

// The day's cards in the order they are shown: most-stalled first, so the
// crustiest work gets ruled on while the user still has patience for it. Pure —
// the caller snapshots this once so its own writes can't reshuffle the pass.
export function collectTriageQueue(items: LocalTdlItem[], onDate: string): TriageCard[] {
  return items
    .filter((item) => isTriageCandidate(item, onDate))
    .map((item) => ({ item, stale: ageDays(item, onDate) }))
    .sort(
      (a, b) =>
        b.stale - a.stale ||
        a.item.section.localeCompare(b.item.section) ||
        a.item.position - b.item.position ||
        a.item.title.localeCompare(b.item.title),
    );
}

export interface TriageDecision {
  id: string;
  title: string;
  action: TriageAction;
  // Only set for a snooze: the wake-up date that was written.
  until?: string;
  // The fields the write changed, as they were before it. Undo restores these.
  before: {
    is_archived: boolean;
    deleted_at: string | null;
    snoozed_until: string | null;
  };
}

export type TriageTally = Record<TriageAction, number>;

export function summariseTriage(decisions: TriageDecision[]): TriageTally {
  const tally: TriageTally = { keep: 0, archive: 0, delete: 0, snooze: 0 };
  for (const d of decisions) tally[d.action]++;
  return tally;
}

// The one-line result of a finished pass, naming only the actions that happened.
export function describeTriage(decisions: TriageDecision[]): string {
  if (decisions.length === 0) return "Nothing triaged";
  const t = summariseTriage(decisions);
  const parts: string[] = [];
  if (t.keep) parts.push(`${t.keep} kept`);
  if (t.archive) parts.push(`${t.archive} archived`);
  if (t.delete) parts.push(`${t.delete} deleted`);
  if (t.snooze) parts.push(`${t.snooze} snoozed`);
  return `Triaged ${decisions.length} task${decisions.length === 1 ? "" : "s"} · ${parts.join(", ")}`;
}
