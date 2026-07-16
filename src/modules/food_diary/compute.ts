import type { FoodEntryRow } from "@/lib/database.types";

export interface DailyTotals {
  calories: number;
  protein: number;
  count: number;
}

export interface DayGroup {
  date: string;
  entries: FoodEntryRow[];
  totals: DailyTotals;
}

export interface GoalProgress {
  value: number;
  goal: number;
  // Fraction of the goal met, clamped to [0, 1] for bar/ring rendering.
  pct: number;
  // Signed distance to the goal: positive = still to go, negative = over.
  remaining: number;
  over: boolean;
}

// Sum the calories + protein of a day's entries. Callers pass an already
// date-filtered, non-deleted list.
export function sumEntries(entries: FoodEntryRow[]): DailyTotals {
  return entries.reduce<DailyTotals>(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      count: acc.count + 1,
    }),
    { calories: 0, protein: 0, count: 0 },
  );
}

// Group entries by their date, newest day first. Within a day, newest entry
// leads (by created_at) so the most recent log sits on top.
export function groupByDate(entries: FoodEntryRow[]): DayGroup[] {
  const byDate = new Map<string, FoodEntryRow[]>();
  for (const e of entries) {
    const list = byDate.get(e.entry_date);
    if (list) list.push(e);
    else byDate.set(e.entry_date, [e]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, list]) => {
      const sorted = [...list].sort((a, b) =>
        a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
      );
      return { date, entries: sorted, totals: sumEntries(sorted) };
    });
}

// Progress of a running total against a goal. A goal of 0 (or unset) means "no
// goal": pct stays 0 and nothing reads as over.
export function goalProgress(value: number, goal: number): GoalProgress {
  if (goal <= 0) {
    return { value, goal: 0, pct: 0, remaining: 0, over: false };
  }
  const pct = Math.min(1, value / goal);
  const remaining = goal - value;
  return { value, goal, pct, remaining, over: value > goal };
}
