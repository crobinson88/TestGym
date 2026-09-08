// US federal public holidays, computed rather than listed so the app never
// runs off the end of a hard-coded table. The Stats page uses these to stop a
// day nobody works from reading as a day you skipped: work streaks bridge them
// and the work habit columns leave them blank.
import { addDays } from "@/lib/utils";

export interface Holiday {
  date: string;
  name: string;
  // The observed weekday for a holiday whose real date fell on a weekend.
  observed: boolean;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dayOfWeek(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map((p) => parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// The `n`th `weekday` of a month (1-based); `n = -1` means the last one.
function nthWeekday(year: number, month: number, weekday: number, n: number): string {
  if (n === -1) {
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let day = daysInMonth;
    while (dayOfWeek(iso(year, month, day)) !== weekday) day--;
    return iso(year, month, day);
  }
  let day = 1;
  while (dayOfWeek(iso(year, month, day)) !== weekday) day++;
  return iso(year, month, day + (n - 1) * 7);
}

// Federal rule: a fixed-date holiday on Saturday is observed the Friday before,
// on Sunday the Monday after. The observed weekday is the day off, so that's
// what the stats skip — the weekend date itself is a weekend either way.
function observedDate(date: string): string | null {
  const dow = dayOfWeek(date);
  if (dow === 6) return addDays(date, -1);
  if (dow === 0) return addDays(date, 1);
  return null;
}

const FIXED: readonly { month: number; day: number; name: string }[] = [
  { month: 1, day: 1, name: "New Year's Day" },
  { month: 6, day: 19, name: "Juneteenth" },
  { month: 7, day: 4, name: "Independence Day" },
  { month: 11, day: 11, name: "Veterans Day" },
  { month: 12, day: 25, name: "Christmas Day" },
];

const FLOATING: readonly {
  month: number;
  weekday: number;
  n: number;
  name: string;
}[] = [
  { month: 1, weekday: 1, n: 3, name: "Martin Luther King Jr. Day" },
  { month: 2, weekday: 1, n: 3, name: "Presidents' Day" },
  { month: 5, weekday: 1, n: -1, name: "Memorial Day" },
  { month: 9, weekday: 1, n: 1, name: "Labor Day" },
  { month: 10, weekday: 1, n: 2, name: "Columbus Day" },
  { month: 11, weekday: 4, n: 4, name: "Thanksgiving Day" },
];

// Every federal holiday in `year`, sorted by date. A fixed-date holiday that
// falls on a weekend yields both the real date and its observed weekday.
export function holidaysForYear(year: number): Holiday[] {
  const out: Holiday[] = [];
  for (const h of FIXED) {
    const date = iso(year, h.month, h.day);
    out.push({ date, name: h.name, observed: false });
    const shifted = observedDate(date);
    if (shifted) out.push({ date: shifted, name: `${h.name} (observed)`, observed: true });
  }
  for (const h of FLOATING) {
    out.push({ date: nthWeekday(year, h.month, h.weekday, h.n), name: h.name, observed: false });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// New Year's Day observed can land in the previous December, so a year's map
// is built from its own holidays plus the next year's spillover.
const cache = new Map<number, Map<string, string>>();

function yearMap(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;
  const map = new Map<string, string>();
  for (const h of [...holidaysForYear(year), ...holidaysForYear(year + 1)]) {
    if (h.date.startsWith(`${year}-`)) map.set(h.date, h.name);
  }
  cache.set(year, map);
  return map;
}

// The holiday falling on this date, or null. Names carry "(observed)" where the
// real date was a weekend.
export function holidayName(date: string): string | null {
  return yearMap(parseInt(date.slice(0, 4), 10)).get(date) ?? null;
}

export function isHoliday(date: string): boolean {
  return holidayName(date) !== null;
}

// A day off is a hand-marked pause — sick, PTO, anything that legitimately
// stopped the day. Keyed by date, valued by the free-text reason (null when
// none was typed).
export type DayOffMap = ReadonlyMap<string, string | null>;

export const NO_DAYS_OFF: DayOffMap = new Map();

// What a day off without a typed reason is called in the UI.
export const DAY_OFF_LABEL = "Day off";

// Why a stat stands down on this date, or null when the day counts normally.
// Only the work stats pass `includeHolidays` — a public holiday is no reason to
// skip the gym, but a sick day is, so every stat but Smoke-free honours a day
// off.
export function pauseReason(
  date: string,
  daysOff: DayOffMap,
  includeHolidays: boolean,
): string | null {
  if (daysOff.has(date)) return daysOff.get(date) || DAY_OFF_LABEL;
  return includeHolidays ? holidayName(date) : null;
}

// A paused day is only ignored when it's genuinely empty — work logged on a
// public holiday or a sick day is work you did, and counts like any other day.
export type SkipDay = (date: string) => boolean;

export function skipEmptyPauses(
  hasData: (date: string) => boolean,
  daysOff: DayOffMap,
  includeHolidays: boolean,
): SkipDay {
  return (date) => pauseReason(date, daysOff, includeHolidays) !== null && !hasData(date);
}

export function skipEmptyHolidays(hasData: (date: string) => boolean): SkipDay {
  return skipEmptyPauses(hasData, NO_DAYS_OFF, true);
}

export const NEVER_SKIP: SkipDay = () => false;

// Runaway guard: nothing in the calendar produces a long chain of skipped days,
// so a walk that goes this far back is a bug, not a holiday season.
const MAX_SKIP_WALK = 30;

// The nearest date at or before `from` that isn't skipped.
export function lastCountingDay(from: string, skip: SkipDay): string {
  let cursor = from;
  for (let i = 0; i < MAX_SKIP_WALK && skip(cursor); i++) cursor = addDays(cursor, -1);
  return cursor;
}

// The `count` most recent non-skipped dates ending at `endDate`, newest first.
// A skipped day extends the window one day further back instead of eating a
// slot, so a 7-day window always covers 7 days that counted.
export function countingDaysBack(endDate: string, count: number, skip: SkipDay): string[] {
  const out: string[] = [];
  let cursor = endDate;
  // Bound the walk so a pathological skip predicate can't loop forever.
  for (let guard = 0; out.length < count && guard < count + MAX_SKIP_WALK; guard++) {
    if (!skip(cursor)) out.push(cursor);
    cursor = addDays(cursor, -1);
  }
  return out;
}

// Whether every day strictly between `from` and `to` is skipped — the test for
// a streak bridging a holiday.
export function onlySkippedBetween(from: string, to: string, skip: SkipDay): boolean {
  let cursor = addDays(from, 1);
  while (cursor < to) {
    if (!skip(cursor)) return false;
    cursor = addDays(cursor, 1);
  }
  return cursor === to;
}
