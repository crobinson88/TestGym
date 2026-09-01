import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { syncEngine } from "@/lib/sync";
import { dayCompletion } from "@/modules/tdl";
import { HOURS_PER_SLOT } from "@/lib/time";
import { addDays, todayIsoDate } from "@/lib/utils";
import {
  GYM_GROWTH_WINDOW_DAYS,
  ROLLING_HOURS_WINDOW_DAYS,
  buildHabitRows,
  habitDates,
  type HabitDayRow,
  type HabitMark,
  type ManualHabitKey,
  type TdlDaySummary,
} from "./compute";

// Days of history the derived columns need before the first visible row.
const LOOKBACK_DAYS = Math.max(ROLLING_HOURS_WINDOW_DAYS, GYM_GROWTH_WINDOW_DAYS + 1);

export function useHabitRows(endDate: string, days: number): HabitDayRow[] | undefined {
  return useLiveQuery(async () => {
    const dates = habitDates(endDate, days);
    const windowStart = dates[0];
    const fetchStart = addDays(windowStart, -LOOKBACK_DAYS);

    const [habitRows, allocs, tdlItems, sets] = await Promise.all([
      db.daily_habits.where("habit_date").between(windowStart, endDate, true, true).toArray(),
      db.timeAllocations.where("date").between(fetchStart, endDate, true, true).toArray(),
      db.tdl_items.where("snapshot_date").between(windowStart, endDate, true, true).toArray(),
      db.sets.where("performed_at").between(fetchStart, endDate, true, true).toArray(),
    ]);

    // One live row per day, newest wins — same dedup as the smoking log.
    const marks = new Map<string, HabitMark>();
    const markStamps = new Map<string, string>();
    for (const row of habitRows) {
      if (row.deleted_at) continue;
      const prev = markStamps.get(row.habit_date);
      if (prev && prev >= row.updated_at) continue;
      markStamps.set(row.habit_date, row.updated_at);
      marks.set(row.habit_date, { early_start: row.early_start, early_bed: row.early_bed });
    }

    const hours = new Map<string, number>();
    for (const a of allocs) {
      if (a.deleted_at) continue;
      hours.set(a.date, (hours.get(a.date) ?? 0) + HOURS_PER_SLOT);
    }

    const itemsByDate = new Map<string, typeof tdlItems>();
    for (const item of tdlItems) {
      if (item.deleted_at) continue;
      const bucket = itemsByDate.get(item.snapshot_date);
      if (bucket) bucket.push(item);
      else itemsByDate.set(item.snapshot_date, [item]);
    }
    const tdl = new Map<string, TdlDaySummary>();
    for (const [date, items] of itemsByDate) {
      const c = dayCompletion(items);
      tdl.set(date, {
        total: c.total,
        done: c.done,
        priorityTotal: c.priorityTotal,
        priorityActive: c.priorityActive,
      });
    }

    const gymVolume = new Map<string, number>();
    for (const s of sets) {
      if (s.deleted_at) continue;
      gymVolume.set(s.performed_at, (gymVolume.get(s.performed_at) ?? 0) + s.weight * s.reps);
    }

    return buildHabitRows(dates, { marks, hours, tdl, gymVolume, today: todayIsoDate() });
  }, [endDate, days]);
}

export async function setHabitMark(date: string, habit: ManualHabitKey, value: boolean | null) {
  await syncEngine.mutations.setDailyHabit(date, habit, value);
}
