// Pure helpers for the "Add Calendar" flow: gather the day's Priorities /
// Daily Tasks / Do First items into a deduped, ordered candidate list and lay
// them out back-to-back on the day's timeline. Kept free of the sync/db and
// network layers so it stays import-safe in tests.

import { addDays } from "@/lib/utils";
import type { SectionConfig } from "./sections";
import { selectPriorityItems } from "./priority";
import { selectDoFirstItems } from "./quadrant";
import type { LocalTdlItem, TdlStatus } from "./types";

// The three groups an item can be pulled from, in the priority order the user
// asked for: a Priority beats a Daily Task beats a Do First. An item that sits
// in more than one gets a single event, tagged with its highest source here.
export type CalendarSource = "priorities" | "daily_tasks" | "do_first";

export const CALENDAR_SOURCE_LABEL: Record<CalendarSource, string> = {
  priorities: "Priority",
  daily_tasks: "Daily Task",
  do_first: "Do First",
};

// "Daily Tasks" is a user-managed category (its key is a uuid), so match it by
// label rather than a fixed key.
const DAILY_TASKS_LABEL = "daily tasks";

// Minutes given to an item with no time estimate.
export const DEFAULT_DURATION_MIN = 30;
// Where the back-to-back chain starts on the day (24h clock).
export const DEFAULT_START_HOUR = 9;
// Same default expressed as minutes-from-midnight, for the time picker.
export const DEFAULT_START_MINUTES = DEFAULT_START_HOUR * 60;

// Parse an "HH:MM" 24h time string into minutes-from-midnight, or null if it
// isn't a valid time. Used to turn the picker's value into a schedule start.
export function parseTimeToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

// Format minutes-from-midnight back into an "HH:MM" 24h string for the picker.
export function minutesToTime(minutes: number): string {
  const within = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${pad(Math.floor(within / 60))}:${pad(within % 60)}`;
}

// Statuses that still represent work to do — done/cancelled items don't earn a
// calendar block.
const ACTIONABLE: ReadonlySet<TdlStatus> = new Set([
  "open",
  "worked_today",
  "ready_for_testing",
  "paused",
]);

export interface CalendarCandidate {
  id: string;
  title: string;
  timeEstimateMin: number | null;
  source: CalendarSource;
}

function dailyTaskKeys(categories: readonly SectionConfig[]): Set<string> {
  return new Set(
    categories
      .filter((c) => c.label.trim().toLowerCase() === DAILY_TASKS_LABEL)
      .map((c) => c.key),
  );
}

// Gather the actionable Priorities, Daily Tasks and Do First items into one
// deduped list. An item present in several groups appears once, keeping its
// highest-priority source; the list is ordered Priorities → Daily Tasks → Do
// First (and within Priorities by rank, elsewhere by board position).
export function collectCalendarCandidates(
  items: readonly LocalTdlItem[],
  categories: readonly SectionConfig[],
): CalendarCandidate[] {
  const actionable = items.filter((i) => ACTIONABLE.has(i.status));
  const dailyKeys = dailyTaskKeys(categories);

  const groups: { source: CalendarSource; list: LocalTdlItem[] }[] = [
    { source: "priorities", list: selectPriorityItems(actionable) },
    {
      source: "daily_tasks",
      list: actionable
        .filter((i) => dailyKeys.has(i.section))
        .sort((a, b) => a.position - b.position),
    },
    { source: "do_first", list: selectDoFirstItems(actionable) },
  ];

  const seen = new Set<string>();
  const out: CalendarCandidate[] = [];
  for (const { source, list } of groups) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({
        id: item.id,
        title: item.title,
        timeEstimateMin: item.time_estimate_min ?? null,
        source,
      });
    }
  }
  return out;
}

export interface ScheduledEvent extends CalendarCandidate {
  durationMin: number;
  // Naive local wall-clock strings (no offset); the caller pairs them with an
  // IANA timeZone so Google places them correctly regardless of DST.
  startDateTime: string;
  endDateTime: string;
}

// A block of already-booked time on the day, in minutes-from-midnight. The
// component derives these from the user's Google Calendar so new blocks slot
// into the gaps instead of clashing.
export interface BusyInterval {
  start: number;
  end: number;
}

// Sort busy intervals by start and merge any that overlap or touch, so the
// slot search can walk them once. Zero/negative-length intervals are dropped.
export function mergeBusy(intervals: readonly BusyInterval[]): BusyInterval[] {
  const sorted = intervals
    .filter((b) => b.end > b.start)
    .map((b) => ({ start: b.start, end: b.end }))
    .sort((a, b) => a.start - b.start);
  const out: BusyInterval[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out;
}

// Earliest minute >= `from` where a block of `duration` fits without touching
// any (pre-merged) busy interval. Each overlap bumps the start to that
// interval's end; repeat until a clear slot is found.
function nextFreeStart(
  from: number,
  duration: number,
  busy: readonly BusyInterval[],
): number {
  let start = from;
  let bumped = true;
  while (bumped) {
    bumped = false;
    for (const b of busy) {
      if (start < b.end && start + duration > b.start) {
        start = b.end;
        bumped = true;
      }
    }
  }
  return start;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// Format a date + minutes-from-midnight into a naive RFC3339 local string,
// rolling over into later days if the running total passes midnight.
function localDateTime(date: string, minutesFromMidnight: number): string {
  const dayOffset = Math.floor(minutesFromMidnight / (24 * 60));
  const within = minutesFromMidnight - dayOffset * 24 * 60;
  const hh = Math.floor(within / 60);
  const mm = within % 60;
  return `${addDays(date, dayOffset)}T${pad(hh)}:${pad(mm)}:00`;
}

// Lay the candidates out from `startMinutes` (or `startHour`) on `date`. Each
// block is its time estimate (or the default when unset). Order is preserved,
// so the Priorities land earliest in the day. When `busy` intervals are given,
// each block is pushed to the earliest free slot at or after the running cursor
// so nothing clashes with an existing calendar event; with no busy intervals it
// falls back to a plain back-to-back chain.
export function scheduleEvents(
  candidates: readonly CalendarCandidate[],
  opts: {
    date: string;
    startHour?: number;
    startMinutes?: number;
    defaultDurationMin?: number;
    busy?: readonly BusyInterval[];
  },
): ScheduledEvent[] {
  const startMinutes =
    opts.startMinutes ?? (opts.startHour ?? DEFAULT_START_HOUR) * 60;
  const defaultDuration = opts.defaultDurationMin ?? DEFAULT_DURATION_MIN;
  const busy = mergeBusy(opts.busy ?? []);
  let cursor = startMinutes;
  const out: ScheduledEvent[] = [];
  for (const c of candidates) {
    const durationMin =
      c.timeEstimateMin != null && c.timeEstimateMin > 0 ? c.timeEstimateMin : defaultDuration;
    const start = nextFreeStart(cursor, durationMin, busy);
    const startDateTime = localDateTime(opts.date, start);
    const endDateTime = localDateTime(opts.date, start + durationMin);
    out.push({ ...c, durationMin, startDateTime, endDateTime });
    cursor = start + durationMin;
  }
  return out;
}
