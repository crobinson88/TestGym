// Pure helpers for the Completed list — the weekly log of finished work. Kept
// free of the db/sync layer so they stay import-safe in tests; the store-backed
// hooks and mutations live in completions.ts.

import { addDays, dayMonth, todayIsoDate, weekStart } from "@/lib/utils";
import type { TdlCompletionKind, TdlSweptItem } from "@/lib/database.types";
import type { TdlStatus } from "./types";
import { chainIndexOf, rootItemId, type ChainLink } from "./chain";

export interface CompletionLike {
  id: string;
  kind: TdlCompletionKind;
  thread_id: string;
  workstream_id: string | null;
  category_key: string | null;
  title: string;
  completed_on: string;
  week_start: string;
  time_estimate_min: number | null;
  swept_items: TdlSweptItem[];
  note: string | null;
  deleted_at: string | null;
}

export interface WeekSummary {
  total: number;
  items: number;
  workstreams: number;
  // Items rolled up inside the week's workstream entries — work that shipped
  // without a log line of its own.
  sweptItems: number;
  minutes: number;
  byCategory: { key: string; count: number }[];
}

export interface CompletedWeek<T extends CompletionLike = CompletionLike> {
  week_start: string;
  entries: T[];
  summary: WeekSummary;
}

// Monday of the week an entry belongs to. Every completion stores this so the
// weekly grouping is an index hit rather than a scan-and-derive.
export function weekOf(iso: string): string {
  return weekStart(iso);
}

export function weekRange(week_start: string): { from: string; to: string } {
  return { from: week_start, to: addDays(week_start, 6) };
}

// "29 Sep – 05 Oct" — the week's span, always Mon–Sun.
export function weekRangeLabel(week_start: string): string {
  const { from, to } = weekRange(week_start);
  return `${dayMonth(from)} – ${dayMonth(to)}`;
}

// "This week" / "Last week" for the two that need no reading, the span for the
// rest. Relative to `today`, so a week that has rolled over renames itself.
export function weekLabel(week_start: string, today = todayIsoDate()): string {
  const current = weekStart(today);
  if (week_start === current) return "This week";
  if (week_start === addDays(current, -7)) return "Last week";
  return weekRangeLabel(week_start);
}

export function summariseWeek(entries: readonly CompletionLike[]): WeekSummary {
  const byCategory = new Map<string, number>();
  let items = 0;
  let workstreams = 0;
  let sweptItems = 0;
  let minutes = 0;
  for (const e of entries) {
    if (e.kind === "workstream") {
      workstreams++;
      sweptItems += e.swept_items.length;
    } else {
      items++;
    }
    minutes += e.time_estimate_min ?? 0;
    if (e.category_key) byCategory.set(e.category_key, (byCategory.get(e.category_key) ?? 0) + 1);
  }
  return {
    total: entries.length,
    items,
    workstreams,
    sweptItems,
    minutes,
    byCategory: [...byCategory.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
  };
}

// Live entries grouped into weeks, newest week first and newest completion
// first inside each. Entries carry their own `week_start`, so a row logged
// against an earlier day files itself under that week, not the one it was
// typed in.
export function groupByWeek<T extends CompletionLike>(rows: readonly T[]): CompletedWeek<T>[] {
  const byWeek = new Map<string, T[]>();
  for (const row of rows) {
    if (row.deleted_at) continue;
    const arr = byWeek.get(row.week_start) ?? [];
    arr.push(row);
    byWeek.set(row.week_start, arr);
  }
  return [...byWeek.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([week_start, entries]) => {
      const sorted = [...entries].sort(
        (a, b) => b.completed_on.localeCompare(a.completed_on) || a.title.localeCompare(b.title),
      );
      return { week_start, entries: sorted, summary: summariseWeek(sorted) };
    });
}

export function matchesCompletionQuery(entry: CompletionLike, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (entry.title.toLowerCase().includes(q)) return true;
  if (entry.note?.toLowerCase().includes(q)) return true;
  return entry.swept_items.some((s) => s.title.toLowerCase().includes(q));
}

// The chain roots already on the log. A task rolls forward into a new row every
// day, so this — not the row id — is what says "already completed".
export function loggedThreadIds(rows: readonly CompletionLike[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (!row.deleted_at) out.add(row.thread_id);
  }
  return out;
}

export interface SweepItem extends ChainLink {
  snapshot_date: string;
  section: string;
  title: string;
  status: TdlStatus;
  time_estimate_min: number | null;
  workstream_id: string | null;
  is_recurring: boolean;
  deleted_at: string | null;
}

export interface SweepCandidate<T extends SweepItem = SweepItem> {
  item: T;
  threadId: string;
}

// What the "Close out the week" sweep offers: every task marked done inside the
// week that isn't on the log yet. Recurring tasks are skipped — they reset every
// day, so "done" on one of them is a daily tick, not a finished piece of work.
// A task worked across several days has a row per day; only the latest is
// offered, keyed on the roll-forward chain root, so one task yields one entry.
export function collectSweepCandidates<T extends SweepItem>(
  items: readonly T[],
  completions: readonly CompletionLike[],
  range: { from: string; to: string },
  // Every item held locally, for walking the chain — the rows inside the week
  // aren't enough to reach a root that sits before it.
  allItems: readonly ChainLink[] = items,
): SweepCandidate<T>[] {
  const logged = loggedThreadIds(completions);
  const byId = chainIndexOf(allItems);
  const best = new Map<string, SweepCandidate<T>>();
  for (const item of items) {
    if (item.deleted_at || item.is_recurring) continue;
    if (item.status !== "done") continue;
    if (item.snapshot_date < range.from || item.snapshot_date > range.to) continue;
    const threadId = rootItemId({ id: item.id, origin_item_id: item.origin_item_id }, byId);
    if (logged.has(threadId)) continue;
    const held = best.get(threadId);
    if (!held || item.snapshot_date > held.item.snapshot_date) {
      best.set(threadId, { item, threadId });
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      a.item.section.localeCompare(b.item.section) ||
      a.item.snapshot_date.localeCompare(b.item.snapshot_date) ||
      a.item.title.localeCompare(b.item.title),
  );
}

export function sweepMinutes(candidates: readonly SweepCandidate[]): number {
  return candidates.reduce((sum, c) => sum + (c.item.time_estimate_min ?? 0), 0);
}

// "3h 30m" / "45m" / "—". Used for the week's hours-shipped line.
export function formatMinutes(total: number): string {
  if (total <= 0) return "—";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
