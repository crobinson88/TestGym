import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LocalFoodEntry, LocalFoodGoal } from "@/lib/db";

// All non-deleted food entries. Ordering is left to the caller (groupByDate).
export function useFoodEntries(): LocalFoodEntry[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.food_entries.toArray();
    return all.filter((r) => !r.deleted_at);
  }, []);
}

export function useFoodEntriesForDate(date: string): LocalFoodEntry[] | undefined {
  return useLiveQuery(async () => {
    const all = await db.food_entries.where("entry_date").equals(date).toArray();
    return all
      .filter((r) => !r.deleted_at)
      .sort((a, b) =>
        a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
      );
  }, [date]);
}

export function useFoodEntry(id?: string): LocalFoodEntry | undefined {
  return useLiveQuery(async () => {
    if (!id) return undefined;
    return db.food_entries.get(id);
  }, [id]);
}

// The single live goals row (newest wins if offline races left duplicates).
// Returns null once loaded with no goals set, undefined while loading.
export function useFoodGoals(): LocalFoodGoal | null | undefined {
  return useLiveQuery(async () => {
    const all = await db.food_goals.toArray();
    const live = all
      .filter((r) => !r.deleted_at)
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
    return live[0] ?? null;
  }, []);
}
