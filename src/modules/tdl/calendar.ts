// Pure helpers for the "Add Calendar" flow: gather the day's Priorities /
// Daily Tasks / Do First items into a deduped, ordered candidate list, lay them
// out on the day's timeline around whatever is already booked, and describe
// that timeline well enough for the modal to draw it. Kept free of the sync/db
// and network layers so it stays import-safe in tests.

import { addDays } from "@/lib/utils";
import { UNCATEGORISED, type SectionConfig } from "./sections";
import { selectPriorityItems } from "./priority";
import { selectDoFirstItems } from "./quadrant";
import type { LocalTdlItem, TdlStatus } from "./types";

// The groups an item can be pulled from, in the order the user asked for: a
// Priority beats a Do First beats a Daily Task beats the item's own category.
// An item that sits in more than one gets a single event, tagged with its
// highest source here. "category" covers every other live category — those
// candidates carry the category's own label in `sourceLabel`.
export type CalendarSource = "priorities" | "do_first" | "daily_tasks" | "category";

// Labels for the three headline groups. A "category" candidate reads as its
// category instead, so the entry here is only a fallback.
export const CALENDAR_SOURCE_LABEL: Record<CalendarSource, string> = {
  priorities: "Priority",
  do_first: "Do First",
  daily_tasks: "Daily Task",
  category: "Task",
};

// "Daily Tasks" is a user-managed category (its key is a uuid), so match it by
// label rather than a fixed key.
const DAILY_TASKS_LABEL = "daily tasks";

// Minutes given to an item with no time estimate.
export const DEFAULT_DURATION_MIN = 30;
// Where the back-to-back chain starts on the day (24h clock).
export const DEFAULT_START_HOUR = 9;
// The latest a block may end. Nothing is scheduled past this — anything left
// over is reported as overflow rather than pushed into the evening.
export const DEFAULT_END_HOUR = 19;
// Same defaults expressed as minutes-from-midnight, for the time pickers.
export const DEFAULT_START_MINUTES = DEFAULT_START_HOUR * 60;
export const DEFAULT_END_MINUTES = DEFAULT_END_HOUR * 60;

// Bounds for a hand-adjusted block length.
export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 12 * 60;
export const DURATION_STEP_MIN = 5;

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

// Minutes-from-midnight as a 12h clock label ("9:30 AM"), rolling past midnight
// so a chain that overruns still reads sensibly.
export function prettyMinutes(minutes: number): string {
  const within = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(within / 60);
  const m = within % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${period}`;
}

// Compact gridline label for the day view: "9 AM", "12 PM". Falls back to the
// full clock for an off-the-hour minute.
export function prettyHourLabel(minutes: number): string {
  const within = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  if (within % 60 !== 0) return prettyMinutes(minutes);
  const h = within / 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${h < 12 ? "AM" : "PM"}`;
}

// "45m" / "1h" / "1h 30m" — the block length as it reads on a calendar.
export function prettyDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Deep link to the day the blocks were written to, so the user can jump
// straight to Google Calendar and see what got booked. No `/u/0/` — Google
// resolves the signed-in account itself, which is right when several are.
export function googleCalendarDayUrl(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return "https://calendar.google.com/calendar/r";
  return `https://calendar.google.com/calendar/r/day/${y}/${m}/${d}`;
}

export function clampDuration(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_DURATION_MIN;
  return Math.min(MAX_DURATION_MIN, Math.max(MIN_DURATION_MIN, Math.round(minutes)));
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
  // What the row reads as: "Priority" / "Do First" / "Daily Task", or the
  // item's category label for everything else.
  sourceLabel: string;
}

function dailyTaskKeys(categories: readonly SectionConfig[]): Set<string> {
  return new Set(
    categories
      .filter((c) => c.label.trim().toLowerCase() === DAILY_TASKS_LABEL)
      .map((c) => c.key),
  );
}

// Gather the day's actionable items into one deduped list, grouped by where
// they come from: Priorities → Do First → Daily Tasks → every other category in
// board order, with items whose category is gone last under Uncategorised. An
// item present in several groups appears once, keeping its highest-priority
// source; Priorities are ordered by rank, everything else by board position.
export function collectCalendarCandidates(
  items: readonly LocalTdlItem[],
  categories: readonly SectionConfig[],
): CalendarCandidate[] {
  const actionable = items.filter((i) => ACTIONABLE.has(i.status));
  const dailyKeys = dailyTaskKeys(categories);
  const byPosition = (a: LocalTdlItem, b: LocalTdlItem) => a.position - b.position;

  const groups: { source: CalendarSource; label: string; list: LocalTdlItem[] }[] = [
    {
      source: "priorities",
      label: CALENDAR_SOURCE_LABEL.priorities,
      list: selectPriorityItems(actionable),
    },
    {
      source: "do_first",
      label: CALENDAR_SOURCE_LABEL.do_first,
      list: selectDoFirstItems(actionable),
    },
    {
      source: "daily_tasks",
      label: CALENDAR_SOURCE_LABEL.daily_tasks,
      list: actionable.filter((i) => dailyKeys.has(i.section)).sort(byPosition),
    },
  ];

  for (const category of categories) {
    if (dailyKeys.has(category.key)) continue;
    groups.push({
      source: "category",
      label: category.label,
      list: actionable.filter((i) => i.section === category.key).sort(byPosition),
    });
  }

  const liveKeys = new Set(categories.map((c) => c.key));
  groups.push({
    source: "category",
    label: UNCATEGORISED.label,
    list: actionable.filter((i) => !liveKeys.has(i.section)).sort(byPosition),
  });

  const seen = new Set<string>();
  const out: CalendarCandidate[] = [];
  for (const { source, label, list } of groups) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({
        id: item.id,
        title: item.title,
        timeEstimateMin: item.time_estimate_min ?? null,
        source,
        sourceLabel: label,
      });
    }
  }
  return out;
}

// Free-text filter for the modal's search box: case-insensitive substring over
// the title and the source label ("priority", "daily task", a category name),
// so a long day can be narrowed to the one block you want to move. Empty query
// matches all.
export function matchesCandidateQuery(
  candidate: Pick<CalendarCandidate, "title" | "sourceLabel">,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    candidate.title.toLowerCase().includes(q) ||
    candidate.sourceLabel.toLowerCase().includes(q)
  );
}

// One heading's worth of rows in the modal's task list. Groups follow the order
// the candidates already carry (Priorities → Do First → Daily Tasks → each
// category), so a hand-dragged day still reads under the right heading.
export interface CandidateGroup {
  source: CalendarSource;
  label: string;
  candidates: CalendarCandidate[];
}

// Split a candidate list into its source groups, keeping each group in the
// order its first member appears and each member in its incoming order. Empty
// groups never exist — a group is created by its first candidate.
export function groupCandidates(
  candidates: readonly CalendarCandidate[],
): CandidateGroup[] {
  const out: CandidateGroup[] = [];
  const byLabel = new Map<string, CandidateGroup>();
  for (const candidate of candidates) {
    let group = byLabel.get(candidate.sourceLabel);
    if (!group) {
      group = { source: candidate.source, label: candidate.sourceLabel, candidates: [] };
      byLabel.set(candidate.sourceLabel, group);
      out.push(group);
    }
    group.candidates.push(candidate);
  }
  return out;
}

// Per-item adjustments made in the modal. A duration replaces the item's time
// estimate; a start pins the block to that minute-of-day instead of letting it
// flow in the back-to-back chain.
export interface CalendarOverride {
  durationMin?: number | null;
  startMinutes?: number | null;
}

export interface ScheduledEvent extends CalendarCandidate {
  durationMin: number;
  // Minutes-from-midnight of the viewed day, for the timeline drawing.
  startMinutes: number;
  endMinutes: number;
  // True when the user pinned this block rather than letting it flow.
  pinned: boolean;
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
// interval's end; repeat until a clear slot is found. With a `limit` (the end
// of the scheduling window) a block that can't finish by then returns null —
// the caller reports it as overflow rather than booking the evening.
function nextFreeStart(
  from: number,
  duration: number,
  busy: readonly BusyInterval[],
  limit?: number | null,
): number | null {
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
    if (limit != null && start + duration > limit) return null;
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
// block is its time estimate (or an override, or the default when unset).
//
// Pinned blocks are placed first, exactly where the user put them, and then
// count as busy so the flowing blocks route around them. Everything else keeps
// the candidate order and takes the earliest free slot at or after the running
// cursor, so nothing clashes with an existing calendar event; with no busy
// intervals that degrades to a plain back-to-back chain. The result is sorted
// by start time — the order the day actually happens in.
//
// `endMinutes` closes the window: a flowing block that can't finish by then is
// left out of the result entirely (the caller highlights it as "won't fit"),
// and the cursor doesn't move, so a shorter task further down the list can
// still take the tail of the day. A pinned block is explicit intent and is
// always placed, even if the user pinned it past the end of the window.
export function scheduleEvents(
  candidates: readonly CalendarCandidate[],
  opts: {
    date: string;
    startHour?: number;
    startMinutes?: number;
    endMinutes?: number | null;
    defaultDurationMin?: number;
    busy?: readonly BusyInterval[];
    overrides?: Readonly<Record<string, CalendarOverride>>;
  },
): ScheduledEvent[] {
  const startMinutes =
    opts.startMinutes ?? (opts.startHour ?? DEFAULT_START_HOUR) * 60;
  const defaultDuration = opts.defaultDurationMin ?? DEFAULT_DURATION_MIN;
  const overrides = opts.overrides ?? {};

  const durationOf = (c: CalendarCandidate): number => {
    const over = overrides[c.id]?.durationMin;
    if (over != null && over > 0) return clampDuration(over);
    return c.timeEstimateMin != null && c.timeEstimateMin > 0
      ? c.timeEstimateMin
      : defaultDuration;
  };
  const pinOf = (c: CalendarCandidate): number | null => {
    const pin = overrides[c.id]?.startMinutes;
    if (pin == null || !Number.isFinite(pin)) return null;
    return Math.max(0, Math.round(pin));
  };

  const placed = new Map<string, { start: number; duration: number }>();
  const pinnedBusy: BusyInterval[] = [];
  for (const c of candidates) {
    const pin = pinOf(c);
    if (pin == null) continue;
    const duration = durationOf(c);
    placed.set(c.id, { start: pin, duration });
    pinnedBusy.push({ start: pin, end: pin + duration });
  }

  const busy = mergeBusy([...(opts.busy ?? []), ...pinnedBusy]);
  const limit = opts.endMinutes ?? null;
  let cursor = startMinutes;
  for (const c of candidates) {
    if (placed.has(c.id)) continue;
    const duration = durationOf(c);
    const start = nextFreeStart(cursor, duration, busy, limit);
    if (start == null) continue;
    placed.set(c.id, { start, duration });
    cursor = start + duration;
  }

  return candidates
    .filter((c) => placed.has(c.id))
    .map((c) => {
      const { start, duration } = placed.get(c.id) as { start: number; duration: number };
      return {
        ...c,
        durationMin: duration,
        startMinutes: start,
        endMinutes: start + duration,
        pinned: pinOf(c) != null,
        startDateTime: localDateTime(opts.date, start),
        endDateTime: localDateTime(opts.date, start + duration),
      };
    })
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

// The window the day view draws: wide enough for every block, the chosen start
// time and (with `to`) the end of the scheduling window, snapped out to whole
// hours so the gridlines read as a clock. Drawing through to `to` keeps the
// "day ends here" line visible even when the blocks finish long before it.
export function timelineRange(
  blocks: readonly { start: number; end: number }[],
  opts: { from: number; to?: number | null; minSpanMin?: number },
): { start: number; end: number } {
  const minSpan = opts.minSpanMin ?? 4 * 60;
  let start = opts.from;
  let end = Math.max(opts.from + minSpan, opts.to ?? -Infinity);
  for (const b of blocks) {
    if (b.start < start) start = b.start;
    if (b.end > end) end = b.end;
  }
  start = Math.max(0, Math.floor(start / 60) * 60);
  end = Math.ceil(end / 60) * 60;
  if (end - start < minSpan) end = start + minSpan;
  return { start, end };
}

// Side-by-side placement for blocks that overlap in time: each gets a lane and
// the number of lanes its overlapping cluster needs, so the day view can render
// a clash (a pinned block over an existing event) as two columns rather than
// one block hidden behind another. Input order is preserved in the output.
export function layoutLanes<T extends { start: number; end: number }>(
  blocks: readonly T[],
): { block: T; lane: number; lanes: number }[] {
  const order = blocks
    .map((block, index) => ({ block, index }))
    .sort((a, b) => a.block.start - b.block.start || a.index - b.index);

  const out: { block: T; index: number; lane: number; lanes: number }[] = [];
  let cluster: typeof out = [];
  let clusterEnd = -Infinity;
  let laneEnds: number[] = [];

  const closeCluster = () => {
    for (const entry of cluster) entry.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };

  for (const { block, index } of order) {
    if (block.start >= clusterEnd) {
      closeCluster();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= block.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.end);
    } else {
      laneEnds[lane] = block.end;
    }
    const entry = { block, index, lane, lanes: laneEnds.length };
    cluster.push(entry);
    out.push(entry);
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  closeCluster();

  return out
    .sort((a, b) => a.index - b.index)
    .map(({ block, lane, lanes }) => ({ block, lane, lanes }));
}

// --- Drag to reorder -------------------------------------------------------

// Dragged blocks land on a clean 5-minute grid.
export const DRAG_SNAP_MIN = 5;

export function snapMinutes(minutes: number, step: number = DRAG_SNAP_MIN): number {
  const s = Math.max(1, Math.round(step));
  return Math.max(0, Math.round(minutes / s) * s);
}

// Re-sequence the candidate list to a hand-picked order. Ids missing from
// `order` (an item that appeared after the modal opened) keep their relative
// position at the end; a null/empty order leaves the list alone.
export function applyCandidateOrder<T extends { id: string }>(
  candidates: readonly T[],
  order: readonly string[] | null | undefined,
): T[] {
  if (!order || order.length === 0) return [...candidates];
  const rank = new Map(order.map((id, i) => [id, i]));
  return candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const ra = rank.get(a.c.id);
      const rb = rank.get(b.c.id);
      if (ra == null && rb == null) return a.i - b.i;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    })
    .map(({ c }) => c);
}

interface PlacedBlock {
  id: string;
  startMinutes: number;
  endMinutes: number;
}

// Where a dragged block lands in the sequence: it goes before the first other
// block whose midpoint sits after the dragged block's own midpoint at the drop
// point — the usual "past the halfway line and they swap" rule, which gives a
// little hysteresis so blocks don't flicker back and forth under the finger.
// Only flowing (unpinned) blocks are anchors; pinned ones hold their own time
// whatever the order says. The chain re-flows from the returned order, so every
// following block's start and end shift automatically.
export function reorderForDrop(
  order: readonly string[],
  placed: readonly PlacedBlock[],
  draggedId: string,
  dropStartMinutes: number,
): string[] {
  if (!order.includes(draggedId)) return [...order];
  const dragged = placed.find((p) => p.id === draggedId);
  const duration = dragged ? dragged.endMinutes - dragged.startMinutes : 0;
  const center = dropStartMinutes + duration / 2;

  const others = placed
    .filter((p) => p.id !== draggedId)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const anchor = others.find((p) => center < (p.startMinutes + p.endMinutes) / 2);

  const rest = order.filter((id) => id !== draggedId);
  const at = anchor ? rest.indexOf(anchor.id) : -1;
  if (at < 0) return [...rest, draggedId];
  return [...rest.slice(0, at), draggedId, ...rest.slice(at)];
}

// Keyboard equivalent of a drag: swap a block one slot earlier (delta < 0) or
// later in the flowing sequence, leaving pinned and unscheduled ids untouched.
export function reorderByStep(
  order: readonly string[],
  sequence: readonly string[],
  id: string,
  delta: number,
): string[] {
  const at = sequence.indexOf(id);
  if (at < 0 || delta === 0) return [...order];
  const target = at + (delta < 0 ? -1 : 1);
  if (target < 0 || target >= sequence.length) return [...order];
  const rest = order.filter((x) => x !== id);
  const idx = rest.indexOf(sequence[target]);
  if (idx < 0) return [...order];
  return delta < 0
    ? [...rest.slice(0, idx), id, ...rest.slice(idx)]
    : [...rest.slice(0, idx + 1), id, ...rest.slice(idx + 1)];
}
