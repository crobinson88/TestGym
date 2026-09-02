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
  },
  {
    key: "early_bed",
    label: "9:30pm Bed",
    short: "9:30",
    manual: true,
    hint: `"${BED_TASK_NAME}" logged by ${clockLabel(EARLY_BED_BY_MINUTES)}`,
  },
  {
    key: "rolling_hours",
    label: "7 Day Ave",
    short: "7d",
    manual: false,
    hint: `Rolling ${ROLLING_HOURS_WINDOW_DAYS}-day logged hours — hit at ${ROLLING_HOURS_TARGET}h+`,
  },
  {
    key: "priority_task",
    label: "Priority Task",
    short: "Pri",
    manual: false,
    hint: "A ranked priority worked or done that day",
  },
  {
    key: "task_completion",
    label: "Task Completion",
    short: "Task",
    manual: false,
    hint: `Action items worked or done against the daily target of ${ACTION_TARGET} — the to-do list's Action Items pie`,
  },
  {
    key: "gym_growth",
    label: "Gym Weight",
    short: "Gym",
    manual: false,
    hint: `Rolling ${GYM_GROWTH_WINDOW_DAYS}-day lifted volume vs the previous ${GYM_GROWTH_WINDOW_DAYS} days — hit when growing`,
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
  // The stored overrides for the day, null where the column is running derived.
  marks: HabitMark;
  cells: Record<HabitColumnKey, HabitCell>;
}

export interface HabitSources {
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
): number {
  let total = 0;
  for (let i = 0; i < days; i++) total += values.get(addDays(endDate, -i)) ?? 0;
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

function rollingHoursCell(hours: ReadonlyMap<string, number>, date: string): HabitCell {
  const total = sumWindow(hours, date, ROLLING_HOURS_WINDOW_DAYS);
  if (total === 0) return BLANK;
  return {
    state: total >= ROLLING_HOURS_TARGET ? "hit" : "miss",
    text: formatHours(Math.round(total * 10) / 10),
    title: `${formatHours(Math.round(total * 10) / 10)}h over the last ${ROLLING_HOURS_WINDOW_DAYS} days (target ${ROLLING_HOURS_TARGET}h)`,
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

export function buildHabitRows(dates: readonly string[], src: HabitSources): HabitDayRow[] {
  return dates.map((date) => {
    const mark = src.marks.get(date);
    const marks: HabitMark = {
      early_start: mark?.early_start ?? null,
      early_bed: mark?.early_bed ?? null,
    };
    const future = date > src.today;
    const tdl = src.tdl.get(date);
    return {
      date,
      isWeekend: isWeekend(date),
      isFuture: future,
      marks,
      cells: {
        early_start: future
          ? BLANK
          : earlyStartCell(src.firstSlot.get(date), marks.early_start),
        early_bed: future ? BLANK : earlyBedCell(src.firstBedSlot.get(date), marks.early_bed),
        rolling_hours: future ? BLANK : rollingHoursCell(src.hours, date),
        priority_task: future ? BLANK : priorityCell(tdl),
        task_completion: future ? BLANK : completionCell(tdl),
        gym_growth: future ? BLANK : gymGrowthCell(src.gymVolume, date),
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
// hit. Days with no data break the streak, matching the sheet's day count.
export function currentStreak(
  rows: readonly HabitDayRow[],
  key: HabitColumnKey,
): number {
  let streak = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.isFuture) continue;
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
