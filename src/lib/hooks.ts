import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { todayIsoDate } from "./utils";

export function useCategories() {
  return useLiveQuery(async () => {
    const all = await db.categories.toArray();
    return all
      .filter((c) => !c.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, []);
}

export function useExercises(categoryId?: string) {
  return useLiveQuery(async () => {
    const all = await db.exercises.toArray();
    return all
      .filter(
        (e) =>
          !e.deleted_at &&
          !e.is_archived &&
          (categoryId ? e.category_id === categoryId : true),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryId]);
}

export function useLastSet(exerciseId?: string) {
  return useLiveQuery(async () => {
    if (!exerciseId) return undefined;
    const rows = await db.sets.where("exercise_id").equals(exerciseId).toArray();
    const live = rows.filter((s) => !s.deleted_at);
    if (live.length === 0) return null;
    live.sort((a, b) => (a.updated_at > b.updated_at ? -1 : a.updated_at < b.updated_at ? 1 : 0));
    return live[0];
  }, [exerciseId]);
}

export function useTodaySetsForExercise(exerciseId?: string) {
  return useLiveQuery(async () => {
    if (!exerciseId) return [];
    const today = todayIsoDate();
    const rows = await db.sets.where("exercise_id").equals(exerciseId).toArray();
    return rows
      .filter((s) => !s.deleted_at && s.performed_at === today)
      .sort((a, b) =>
        a.updated_at > b.updated_at ? 1 : a.updated_at < b.updated_at ? -1 : 0,
      );
  }, [exerciseId]);
}
