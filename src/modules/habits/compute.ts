import {
  countingDaysBack,
  pauseReason,
  skipAllPauses,
  type DayOffMap,
  type SkipDay,
} from "@/lib/holidays";
import { SLOT_MINUTES, formatHours } from "@/lib/time";
import { addDays } from "@/lib/utils";
import { ACTION_TARGET } from "@/modules/tdl/targets";

// Every column is derived from data the app already holds. These two read the
// time log, and a stored `daily_habits` flag overrides the derived value for a
// day the log doesn't tell the truth about.
export type ManualHabitKey = "early_start" | "early_bed";

export type HabitColumnKey =
  | ManualHabitKey
  | "rolling_hours"
  | "priority_task"
  | "task_completion"
  | "gym_growth";

export interface HabitColumn {
  key: HabitColumnKey;
  label: string;
  short: string;
  manual: boolean;
  hint: string;
  // The work columns ignore US public holidays: an empty holiday is blank
  // rather than a miss, and the rolling window steps over it. The personal
  // columns (bed, start, gym) count holidays like any other day. Every column
  // honours a hand-marked day off — a sick day stops the lot.
  ignoresHolidays: boolean;
}

export const ROLLING_HOURS_WINDOW_DAYS = 7;
// Matches the target floor on the Stats rolling-hours chart.
export const ROLLING_HOURS_TARGET = 70;
export const GYM_GROWTH_WINDOW_DAYS = 5;
// 5:30 column: any time logged before 6am counts as an early start.
export const EARLY_START_BEFORE_MINUTES = 6 * 60;
// 9:30 column: the Bed category logged starting at or before 9:30pm.
export const EARLY_BED_BY_MINUTES = 21 * 60 + 30;
// The time-tracking task whose slots mark bedtime.
export const BED_TASK_NAME = "Bed";

// Minutes past midnight → "5:30am" / "9:30pm", for the column hints and titles.
export function clockLabel(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")}${suffix}`;
}

export const slotStartMinutes = (slot: number) => slot * SLOT_MINUTES;

// Column order mirrors the spreadsheet this replaces.
export const HABIT_COLUMNS: readonly HabitColumn[] = [
  {
    key: "early_start",
    label: "5:30am Start",
    short: "5:30",
    manual: true,
    hint: `Time logged before ${clockLabel(EARLY_START_BEFORE_MINUTES)}`,
    ignoresHolidays: false,
  },
  {
    key: "early_bed",
    label: "9:30pm Bed",
    short: "9:30",
    manual: true,
    hint: `"${BED_TASK_NAME}" logged by ${clockLabel(EARLY_BED_BY_MINUTES)}`,
    ignoresHolidays: false,
  },
  {
    key: "rolling_hours",
    label: "7 Day Ave",
    short: "7d",
    manual: false,
    hint: `Rolling ${ROLLING_HOURS_WINDOW_DAYS} logged days — hit at ${ROLLING_HOURS_TARGET}h+ · US holidays skipped`,
    ignoresHolidays: true,
  },
  {
    key: "priority_task",
    label: "Priority Task",
    short: "Pri",
    manual: false,
    hint: "A ranked priority worked or done that day · US holidays skipped",
    ignoresHolidays: true,
  },
  {
    key: "task_completion",
    label: "Task Completion",
    short: "Task",
    manual: false,
    hint: `Action items worked or done against the daily target of ${ACTION_TARGET} — the to-do list's Action Items pie`,
    ignoresHolidays: true,
  },
  {
    key: "gym_growth",
    label: "Gym Weight",
    short: "Gym",
    manual: false,
    hint: `Rolling ${GYM_GROWTH_WINDOW_DAYS}-day lifted volume vs the previous ${GYM_GROWTH_WINDOW_DAYS} days — hit when growing`,
    ignoresHolidays: false,
  },
];

export interface HabitMark {
  early_start: boolean | null;
  early_bed: boolean | null;
}

export interface TdlDaySummary {
  total: number;
  done: number;
  // Worked-today or done — what the to-do list's Action Items pie counts.
  active: number;
  priorityTotal: number;
  priorityActive: number;
}

// "hit" = green Y, "miss" = red N, "none" = the day has nothing to say.
export type CellState = "hit" | "miss" | "none";

export interface HabitCell {
  state: CellState;
  text: string;
  title: string;
}

export interface HabitDayRow {
  date: string;
  isWeekend: boolean;
  isFuture: boolean;
  // Why the work columns stand down on this date — the US public holiday, or
  // the hand-marked day off's reason — else null. Empty days only: a paused
  // day you logged against counts like any other.
  holiday: string | null;
  // The day is marked off by hand, so every column stands down, not just the
  // work three. Carries the reason where one was typed.
  dayOff: string | null;
  // The stored flag, whatever was logged that day — what the row's toggle
  // reads, so marking a busy day off still shows as marked.
  isDayOff: boolean;
  // The stored overrides for the day, null where the column is running derived.
  marks: HabitMark;
  cells: Record<HabitColumnKey, HabitCell>;
}

export interface HabitSources {
  // Hand-marked days off, date → reason.
  daysOff: DayOffMap;
  // Hand-set overrides; a non-null flag wins over the derived value.
  marks: ReadonlyMap<string, HabitMark>;
  // Hours logged per day, all tasks — the same series behind the rolling-hours chart.
  hours: ReadonlyMap<string, number>;
  // Earliest time-tracking slot logged that day, any task.
  firstSlot: ReadonlyMap<string, number>;
  // Earliest slot logged that day against the "Bed" task.
  firstBedSlot: ReadonlyMap<string, number>;
  tdl: ReadonlyMap<string, TdlDaySummary>;
  // Lifted volume (weight × reps) per day.
  gymVolume: ReadonlyMap<string, number>;
  today: string;
}

const BLANK: HabitCell = { state: "none", text: "—", title: "No data" };

export function isWeekend(iso: string): boolean {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
}

// The `days` dates ending at `endDate`, oldest first.
export function habitDates(endDate: string, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDays(endDate, -i));
  return out;
}

function sumWindow(
  values: ReadonlyMap<string, number>,
  endDate: string,
  days: number,
  skip?: SkipDay,
): number {
  const window = skip
    ? countingDaysBack(endDate, days, skip)
    : Array.from({ length: days }, (_, i) => addDays(endDate, -i));
  let total = 0;
  for (const date of window) total += values.get(date) ?? 0;
  return total;
}

function overrideCell(value: boolean, label: string): HabitCell {
  return {
    state: value ? "hit" : "miss",
    text: value ? "Y" : "N",
    title: `${label}: ${value ? "yes" : "no"} (set by hand)`,
  };
}

function yesNoCell(hit: boolean, title: string): HabitCell {
  return { state: hit ? "hit" : "miss", text: hit ? "Y" : "N", title };
}

// 5:30 column: Y when the day's first logged slot starts before 6am. A day with
// nothing logged says nothing, so it stays blank rather than counting as a miss.
export function earlyStartCell(
  firstSlot: number | undefined,
  override: boolean | null,
): HabitCell {
  if (override !== null) return overrideCell(override, "5:30am start");
  if (firstSlot === undefined) return { ...BLANK, title: "No time logged that day" };
  const start = slotStartMinutes(firstSlot);
  return yesNoCell(
    start < EARLY_START_BEFORE_MINUTES,
    `First time logged at ${clockLabel(start)} (before ${clockLabel(EARLY_START_BEFORE_MINUTES)} counts)`,
  );
}

// 9:30 column: Y when the day's first "Bed" slot starts at or before 9:30pm. No
// Bed logged means the day is unknown, not a miss.
export function earlyBedCell(
  firstBedSlot: number | undefined,
  override: boolean | null,
): HabitCell {
  if (override !== null) return overrideCell(override, "9:30pm bed");
  if (firstBedSlot === undefined) {
    return { ...BLANK, title: `No "${BED_TASK_NAME}" time logged that day` };
  }
  const start = slotStartMinutes(firstBedSlot);
  return yesNoCell(
    start <= EARLY_BED_BY_MINUTES,
    `${BED_TASK_NAME} logged from ${clockLabel(start)} (by ${clockLabel(EARLY_BED_BY_MINUTES)} counts)`,
  );
}

// The window covers ROLLING_HOURS_WINDOW_DAYS days that counted — an empty US
// public holiday pushes it a day further back rather than eating a slot, so the
// target stays comparable across holiday weeks.
function rollingHoursCell(
  hours: ReadonlyMap<string, number>,
  date: string,
  skip: SkipDay,
): HabitCell {
  const total = sumWindow(hours, date, ROLLING_HOURS_WINDOW_DAYS, skip);
  if (total === 0) return BLANK;
  const shown = formatHours(Math.round(total * 10) / 10);
  return {
    state: total >= ROLLING_HOURS_TARGET ? "hit" : "miss",
    text: shown,
    title: `${shown}h over the last ${ROLLING_HOURS_WINDOW_DAYS} logged days, holidays and days off skipped (target ${ROLLING_HOURS_TARGET}h)`,
  };
}

function priorityCell(day: TdlDaySummary | undefined): HabitCell {
  if (!day || day.total === 0) return BLANK;
  if (day.priorityTotal === 0) {
    return { state: "miss", text: "N", title: "No priority ranked that day" };
  }
  const hit = day.priorityActive > 0;
  return {
    state: hit ? "hit" : "miss",
    text: hit ? "Y" : "N",
    title: `${day.priorityActive} of ${day.priorityTotal} ranked priorities worked or done`,
  };
}

// Mirrors the to-do list's Action Items pie exactly: progress toward the daily
// target of ACTION_TARGET items worked or done, not a share of the day's list.
export function completionCell(day: TdlDaySummary | undefined): HabitCell {
  if (!day || day.total === 0) return BLANK;
  const pct = Math.round((day.active / ACTION_TARGET) * 100);
  return {
    state: day.active >= ACTION_TARGET ? "hit" : "miss",
    text: `${pct}%`,
    title: `${day.active} of ${ACTION_TARGET} action items worked or done`,
  };
}

// The spreadsheet's gym column: sum(volume over the 5 days ending today) ÷
// sum(volume over the 5 days ending yesterday). Y when the rolling window is
// growing. An empty prior window is the sheet's #DIV/0! — shown as no data.
export function gymGrowthCell(
  gymVolume: ReadonlyMap<string, number>,
  date: string,
): HabitCell {
  const prior = sumWindow(gymVolume, addDays(date, -1), GYM_GROWTH_WINDOW_DAYS);
  if (prior === 0) return BLANK;
  const current = sumWindow(gymVolume, date, GYM_GROWTH_WINDOW_DAYS);
  const ratio = current / prior;
  return {
    state: ratio > 1 ? "hit" : "miss",
    text: ratio.toFixed(2),
    title: `Rolling ${GYM_GROWTH_WINDOW_DAYS}-day volume ${ratio > 1 ? "growing" : "shrinking"} (${ratio.toFixed(2)}×)`,
  };
}

function pausedCell(reason: string): HabitCell {
  return { state: "none", text: "—", title: `${reason} — not counted` };
}

export function buildHabitRows(dates: readonly string[], src: HabitSources): HabitDayRow[] {
  // The 7-day window always steps over a holiday or day off, logged or not,
  // so it covers seven working days (the to-do columns below only stand down
  // when the day is genuinely empty).
  const skipHours = skipAllPauses(src.daysOff, true);
  return dates.map((date) => {
    const mark = src.marks.get(date);
    const marks: HabitMark = {
      early_start: mark?.early_start ?? null,
      early_bed: mark?.early_bed ?? null,
    };
    const future = date > src.today;
    const tdl = src.tdl.get(date);
    const worked = (tdl?.active ?? 0) > 0;
    // A paused day with to-do activity is a day you worked — the work columns
    // only stand down when the day is genuinely empty.
    const holiday = worked ? null : pauseReason(date, src.daysOff, true);
    // Only a hand-marked day off pauses the personal columns; a public holiday
    // is no reason to skip the gym or sleep in.
    const dayOff = worked ? null : pauseReason(date, src.daysOff, false);
    const paused = (reason: string | null, cell: () => HabitCell) =>
      future ? BLANK : reason ? pausedCell(reason) : cell();
    return {
      date,
      isWeekend: isWeekend(date),
      isFuture: future,
      holiday,
      dayOff,
      isDayOff: src.daysOff.has(date),
      marks,
      cells: {
        early_start: paused(dayOff, () =>
          earlyStartCell(src.firstSlot.get(date), marks.early_start),
        ),
        early_bed: paused(dayOff, () =>
          earlyBedCell(src.firstBedSlot.get(date), marks.early_bed),
        ),
        // The rolling window steps over paused days rather than blanking the
        // cell, so the 70h target stays comparable through a sick week.
        rolling_hours: future ? BLANK : rollingHoursCell(src.hours, date, skipHours),
        priority_task: paused(holiday, () => priorityCell(tdl)),
        task_completion: paused(holiday, () => completionCell(tdl)),
        gym_growth: paused(dayOff, () => gymGrowthCell(src.gymVolume, date)),
      },
    };
  });
}

export interface ColumnTally {
  key: HabitColumnKey;
  hit: number;
  marked: number;
}

// Hit rate per column across the visible window, ignoring days with no data.
export function tallyColumns(rows: readonly HabitDayRow[]): ColumnTally[] {
  return HABIT_COLUMNS.map((col) => {
    let hit = 0;
    let marked = 0;
    for (const row of rows) {
      const cell = row.cells[col.key];
      if (cell.state === "none") continue;
      marked++;
      if (cell.state === "hit") hit++;
    }
    return { key: col.key, hit, marked };
  });
}

// Consecutive days ending at the most recent non-future day where the habit was
// hit. Days with no data break the streak, matching the sheet's day count — but
// a US public holiday is stepped over on the columns that ignore them, so it
// neither breaks the run nor adds to it.
export function currentStreak(
  rows: readonly HabitDayRow[],
  key: HabitColumnKey,
): number {
  const ignoresHolidays = HABIT_COLUMNS.find((c) => c.key === key)?.ignoresHolidays ?? false;
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.isFuture) continue;
    // A day off steps over every column; a holiday only the work three.
    if (row.dayOff || (ignoresHolidays && row.holiday)) continue;
    if (row.cells[key].state !== "hit") break;
    streak++;
  }
  return streak;
}

// Tap order for a manual cell: unmarked → Y → N → unmarked.
export function nextMarkValue(current: boolean | null): boolean | null {
  if (current === null) return true;
  return current ? false : null;
}
