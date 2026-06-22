import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { addDays, todayIsoDate, weekStart } from "@/lib/utils";
import { computeStats, weeklyAccuracy } from "./stats";

export function useFrenchAttempts() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return all
      .filter((a) => !a.deleted_at)
      .sort((a, b) =>
        a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0,
      );
  }, []);
}

export function useFrenchStats() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return computeStats(all);
  }, []);
}

export function useFrenchWeeklyAccuracy(weeks = 8) {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    const thisWeekStart = weekStart(todayIsoDate());
    const starts: string[] = [];
    for (let i = weeks - 1; i >= 0; i--) starts.push(addDays(thisWeekStart, -i * 7));
    return weeklyAccuracy(all, starts);
  }, [weeks]);
}
