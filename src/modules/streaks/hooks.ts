import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { todayIsoDate } from "@/lib/utils";
import {
  FRENCH_TASK_NAME,
  GETBUDDY_TASK_NAME,
  GYM_TASK_NAME,
  TGM_TASK_NAME,
  buildStreaks,
  type Streak,
} from "./compute";

// Ids of every live time task with this name. Duplicate live tasks can share a
// name (two devices adding "TGM" offline), so match by name like the habit grid.
function taskIdsNamed(
  tasks: readonly { id: string; name: string; deleted_at: string | null }[],
  name: string,
): Set<string> {
  const wanted = name.trim().toLowerCase();
  return new Set(
    tasks.filter((t) => !t.deleted_at && t.name.trim().toLowerCase() === wanted).map((t) => t.id),
  );
}

export function useStreaks(): Streak[] | undefined {
  return useLiveQuery(async () => {
    const [attempts, sets, cardio, allocs, timeTasks, smoking] = await Promise.all([
      db.french_attempts.toArray(),
      db.sets.toArray(),
      db.cardio_sessions.toArray(),
      db.timeAllocations.toArray(),
      db.timeTasks.toArray(),
      db.smoking_logs.toArray(),
    ]);

    const french = new Set<string>();
    const gym = new Set<string>();
    const tgm = new Set<string>();
    const getbuddy = new Set<string>();

    for (const a of attempts) {
      if (!a.deleted_at) french.add(a.started_at.slice(0, 10));
    }
    for (const s of sets) {
      if (!s.deleted_at) gym.add(s.performed_at);
    }
    for (const c of cardio) {
      if (!c.deleted_at) gym.add(c.performed_at);
    }

    const byTask: [Set<string>, Set<string>][] = [
      [taskIdsNamed(timeTasks, FRENCH_TASK_NAME), french],
      [taskIdsNamed(timeTasks, GYM_TASK_NAME), gym],
      [taskIdsNamed(timeTasks, TGM_TASK_NAME), tgm],
      [taskIdsNamed(timeTasks, GETBUDDY_TASK_NAME), getbuddy],
    ];
    for (const a of allocs) {
      if (a.deleted_at) continue;
      for (const [ids, days] of byTask) {
        if (ids.has(a.task_id)) days.add(a.date);
      }
    }

    // One live row per day, newest wins — the same dedup as the smoking calendar.
    const smokedByDate = new Map<string, { smoked: boolean; updated_at: string }>();
    for (const r of smoking) {
      if (r.deleted_at) continue;
      const prev = smokedByDate.get(r.log_date);
      if (!prev || r.updated_at > prev.updated_at) {
        smokedByDate.set(r.log_date, { smoked: r.smoked, updated_at: r.updated_at });
      }
    }
    const smoke_free = new Set<string>();
    for (const [date, v] of smokedByDate) {
      if (!v.smoked) smoke_free.add(date);
    }

    return buildStreaks({ today: todayIsoDate(), french, gym, tgm, getbuddy, smoke_free });
  }, []);
}
