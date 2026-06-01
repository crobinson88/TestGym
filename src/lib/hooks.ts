import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import type { LocalSet } from "./db";
import { addDays, todayIsoDate, weekStart } from "./utils";

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

export function useExercise(id?: string) {
  return useLiveQuery(async () => {
    if (!id) return undefined;
    return db.exercises.get(id);
  }, [id]);
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

export function useSetsForDate(date: string) {
  return useLiveQuery(async () => {
    const rows = await db.sets.where("performed_at").equals(date).toArray();
    return rows
      .filter((s) => !s.deleted_at)
      .sort((a, b) =>
        a.updated_at < b.updated_at ? -1 : a.updated_at > b.updated_at ? 1 : 0,
      );
  }, [date]);
}

export interface ExerciseHistoryPoint {
  date: string;
  max_weight: number;
  max_reps: number;
  volume: number;
  sets: number;
}

export interface ExerciseStats {
  totalSets: number;
  totalVolume: number;
  prWeight: number;
  prWeightDate: string;
  prReps: number;
  prRepsWeight: number;
  prRepsDate: string;
  lastSession: string;
  sessionCount: number;
  history: ExerciseHistoryPoint[];
}

export interface DayAgg {
  volume: number;
  sets: number;
  byCategory: Record<string, number>;
}

export interface WeekVolumePoint {
  week_start: string;
  total: number;
  byCategory: Record<string, number>;
}

export interface DashboardStats {
  today: DayAgg;
  lastSession: { date: string; volume: number; sets: number } | null;
  maxSession: { date: string; volume: number } | null;
  thisWeek: { days: number; volume: number };
  lastWeek: { days: number; volume: number };
  allTime: { sets: number; volume: number; days: number };
  categories: { id: string; name: string }[];
  weekly: WeekVolumePoint[];
}

export function useDashboardStats(): DashboardStats | undefined {
  return useLiveQuery(async () => {
    const [allSets, allCats] = await Promise.all([
      db.sets.toArray(),
      db.categories.toArray(),
    ]);
    const live = allSets.filter((s) => !s.deleted_at);
    const cats = allCats
      .filter((c) => !c.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    const catName = new Map(cats.map((c) => [c.id, c.name]));

    type DayBucket = { volume: number; sets: number; byCategory: Record<string, number> };
    const byDate = new Map<string, DayBucket>();
    for (const s of live) {
      const e = byDate.get(s.performed_at) ?? { volume: 0, sets: 0, byCategory: {} };
      const v = s.weight * s.reps;
      e.volume += v;
      e.sets += 1;
      const cn = catName.get(s.category_id) ?? "Other";
      e.byCategory[cn] = (e.byCategory[cn] ?? 0) + v;
      byDate.set(s.performed_at, e);
    }

    const today = todayIsoDate();
    const todayAgg: DayAgg = byDate.get(today) ?? { volume: 0, sets: 0, byCategory: {} };

    const trainingDates = Array.from(byDate.keys()).sort();
    const beforeToday = trainingDates.filter((d) => d < today);
    const lastDate = beforeToday[beforeToday.length - 1] ?? null;
    const lastSession =
      lastDate !== null
        ? {
            date: lastDate,
            volume: byDate.get(lastDate)!.volume,
            sets: byDate.get(lastDate)!.sets,
          }
        : null;

    let maxSession: { date: string; volume: number } | null = null;
    for (const [date, e] of byDate) {
      if (!maxSession || e.volume > maxSession.volume) {
        maxSession = { date, volume: e.volume };
      }
    }

    function weekStats(start: string) {
      const end = addDays(start, 7);
      let volume = 0;
      const days = new Set<string>();
      for (const [date, e] of byDate) {
        if (date >= start && date < end) {
          volume += e.volume;
          days.add(date);
        }
      }
      return { days: days.size, volume };
    }
    const thisWeekStart = weekStart(today);
    const thisWeek = weekStats(thisWeekStart);
    const lastWeek = weekStats(addDays(thisWeekStart, -7));

    const weekly: WeekVolumePoint[] = [];
    for (let i = 7; i >= 0; i--) {
      const ws = addDays(thisWeekStart, -i * 7);
      const we = addDays(ws, 7);
      const point: WeekVolumePoint = { week_start: ws, total: 0, byCategory: {} };
      for (const cat of cats) point.byCategory[cat.name] = 0;
      for (const [date, e] of byDate) {
        if (date >= ws && date < we) {
          for (const [cn, v] of Object.entries(e.byCategory)) {
            point.byCategory[cn] = (point.byCategory[cn] ?? 0) + v;
            point.total += v;
          }
        }
      }
      weekly.push(point);
    }

    const allTime = {
      sets: live.length,
      volume: live.reduce((sum, s) => sum + s.weight * s.reps, 0),
      days: byDate.size,
    };

    return {
      today: todayAgg,
      lastSession,
      maxSession,
      thisWeek,
      lastWeek,
      allTime,
      categories: cats.map((c) => ({ id: c.id, name: c.name })),
      weekly,
    };
  }, []);
}

export function useExerciseStats(exerciseId?: string): ExerciseStats | null | undefined {
  return useLiveQuery(async () => {
    if (!exerciseId) return undefined;
    const rows = await db.sets.where("exercise_id").equals(exerciseId).toArray();
    const live = rows.filter((s) => !s.deleted_at);
    if (live.length === 0) return null;

    const byDate = new Map<string, LocalSet[]>();
    for (const s of live) {
      const arr = byDate.get(s.performed_at) ?? [];
      arr.push(s);
      byDate.set(s.performed_at, arr);
    }

    const history: ExerciseHistoryPoint[] = Array.from(byDate.entries())
      .map(([date, sets]) => ({
        date,
        max_weight: Math.max(...sets.map((s) => s.weight)),
        max_reps: Math.max(...sets.map((s) => s.reps)),
        volume: sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
        sets: sets.length,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    let prWeight = 0;
    let prWeightDate = "";
    let prReps = 0;
    let prRepsWeight = 0;
    let prRepsDate = "";
    for (const s of live) {
      if (s.weight > prWeight) {
        prWeight = s.weight;
        prWeightDate = s.performed_at;
      }
      if (s.reps > prReps || (s.reps === prReps && s.weight > prRepsWeight)) {
        prReps = s.reps;
        prRepsWeight = s.weight;
        prRepsDate = s.performed_at;
      }
    }

    const totalVolume = live.reduce((sum, s) => sum + s.weight * s.reps, 0);
    const lastSession = history[history.length - 1].date;

    return {
      totalSets: live.length,
      totalVolume,
      prWeight,
      prWeightDate,
      prReps,
      prRepsWeight,
      prRepsDate,
      lastSession,
      sessionCount: history.length,
      history,
    };
  }, [exerciseId]);
}
