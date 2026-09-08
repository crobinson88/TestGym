import type { DailyHabitRow } from "@/lib/database.types";
import type { DayOffMap } from "@/lib/holidays";

// Hand-marked days off out of `daily_habits` rows, date → reason. One live row
// per day, newest wins — the same dedup the habit grid and smoking log use.
export function dayOffMap(rows: readonly DailyHabitRow[]): DayOffMap {
  const stamps = new Map<string, string>();
  const out = new Map<string, string | null>();
  for (const row of rows) {
    if (row.deleted_at) continue;
    const prev = stamps.get(row.habit_date);
    if (prev && prev >= row.updated_at) continue;
    stamps.set(row.habit_date, row.updated_at);
    if (row.day_off) out.set(row.habit_date, row.day_off_reason);
    else out.delete(row.habit_date);
  }
  return out;
}
