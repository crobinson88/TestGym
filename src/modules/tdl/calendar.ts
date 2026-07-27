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

// Lay the candidates end-to-end starting at `startHour` on `date`. Each block is
// its time estimate (or the default when unset). Order is preserved, so the
// Priorities land earliest in the day.
export function scheduleEvents(
  candidates: readonly CalendarCandidate[],
  opts: {
    date: string;
    startHour?: number;
    defaultDurationMin?: number;
  },
): ScheduledEvent[] {
  const startHour = opts.startHour ?? DEFAULT_START_HOUR;
  const defaultDuration = opts.defaultDurationMin ?? DEFAULT_DURATION_MIN;
  let cursor = startHour * 60;
  const out: ScheduledEvent[] = [];
  for (const c of candidates) {
    const durationMin =
      c.timeEstimateMin != null && c.timeEstimateMin > 0 ? c.timeEstimateMin : defaultDuration;
    const startDateTime = localDateTime(opts.date, cursor);
    const endDateTime = localDateTime(opts.date, cursor + durationMin);
    out.push({ ...c, durationMin, startDateTime, endDateTime });
    cursor += durationMin;
  }
  return out;
}
