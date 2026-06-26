import { addDays } from "./utils";

export const SLOT_MINUTES = 15;
export const SLOTS_PER_DAY = 96;
export const HOURS_PER_SLOT = SLOT_MINUTES / 60;

export function slotEndLabel(slot: number): string {
  const totalMins = (slot + 1) * SLOT_MINUTES;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const TASK_PALETTE: readonly string[] = [
  "#22d3ee",
  "#f97316",
  "#a78bfa",
  "#10b981",
  "#f43f5e",
  "#facc15",
  "#38bdf8",
  "#fb7185",
  "#34d399",
  "#c084fc",
  "#fbbf24",
  "#60a5fa",
  "#f472b6",
  "#4ade80",
  "#fde047",
  "#818cf8",
];

export function nextTaskColor(usedColors: readonly string[]): string {
  for (const c of TASK_PALETTE) {
    if (!usedColors.includes(c)) return c;
  }
  return TASK_PALETTE[usedColors.length % TASK_PALETTE.length];
}

export function formatMdy(iso: string): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10));
  return `${m}/${d}/${y}`;
}

export function formatHours(hours: number): string {
  if (Number.isInteger(hours)) return `${hours}`;
  return hours.toFixed(2).replace(/\.?0+$/, "");
}

export interface AllocationLike {
  date: string;
  task_id: string;
}

export interface TaskLike {
  id: string;
  is_work: boolean;
}

export function hoursOnDate(allocs: readonly AllocationLike[], date: string): number {
  let n = 0;
  for (const a of allocs) if (a.date === date) n++;
  return n * HOURS_PER_SLOT;
}

export function workHoursOnDate(
  allocs: readonly AllocationLike[],
  tasksById: ReadonlyMap<string, TaskLike>,
  date: string,
): number {
  let n = 0;
  for (const a of allocs) {
    if (a.date !== date) continue;
    if (tasksById.get(a.task_id)?.is_work) n++;
  }
  return n * HOURS_PER_SLOT;
}

export function taskHoursOnDate(
  allocs: readonly AllocationLike[],
  taskId: string | null,
  date: string,
): number {
  if (!taskId) return 0;
  let n = 0;
  for (const a of allocs) if (a.date === date && a.task_id === taskId) n++;
  return n * HOURS_PER_SLOT;
}

export function workHoursInRange(
  allocs: readonly AllocationLike[],
  tasksById: ReadonlyMap<string, TaskLike>,
  startDate: string,
  endDate: string,
): number {
  let n = 0;
  for (const a of allocs) {
    if (a.date < startDate || a.date > endDate) continue;
    if (tasksById.get(a.task_id)?.is_work) n++;
  }
  return n * HOURS_PER_SLOT;
}

export interface WeekHoursPoint {
  week_start: string;
  hours: number;
}

export interface HoursPoint {
  date: string;
  hours: number;
}

export function hoursPerDay(allocs: readonly AllocationLike[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of allocs) counts.set(a.date, (counts.get(a.date) ?? 0) + 1);
  const out = new Map<string, number>();
  for (const [date, n] of counts) out.set(date, n * HOURS_PER_SLOT);
  return out;
}

export function weeklyHours(
  perDay: ReadonlyMap<string, number>,
  weekStarts: readonly string[],
): WeekHoursPoint[] {
  return weekStarts.map((ws) => {
    let hours = 0;
    for (let i = 0; i < 7; i++) hours += perDay.get(addDays(ws, i)) ?? 0;
    return { week_start: ws, hours };
  });
}

export function rollingHours(
  perDay: ReadonlyMap<string, number>,
  endDates: readonly string[],
  windowDays: number,
): HoursPoint[] {
  return endDates.map((d) => {
    let hours = 0;
    for (let i = 0; i < windowDays; i++) hours += perDay.get(addDays(d, -i)) ?? 0;
    return { date: d, hours };
  });
}

export function dailyHours(
  perDay: ReadonlyMap<string, number>,
  dates: readonly string[],
): HoursPoint[] {
  return dates.map((d) => ({ date: d, hours: perDay.get(d) ?? 0 }));
}
