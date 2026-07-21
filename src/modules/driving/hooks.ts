import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { computeStats } from "./stats";

export function useDrivingAttempts() {
  return useLiveQuery(async () => {
    const all = await db.driving_attempts.toArray();
    return all
      .filter((a) => !a.deleted_at)
      .sort((a, b) =>
        a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0,
      );
  }, []);
}

export function useDrivingStats() {
  return useLiveQuery(async () => {
    const all = await db.driving_attempts.toArray();
    return computeStats(all);
  }, []);
}
