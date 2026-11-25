import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { groupPLogs, type PDay } from "./compute";

// Every live P instance grouped by day. Feeds the Stats P calendar.
export function usePLogDays(): Map<string, PDay> | undefined {
  return useLiveQuery(async () => groupPLogs(await db.p_logs.toArray()), []);
}
