import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import { db, type LocalTimeAllocation, type LocalTimeTask } from "./db";
import { syncEngine } from "./sync";
import {
  dailyHours,
  hoursPerDay,
  nextTaskColor,
  rollingHours,
  weeklyHours,
  type HoursPoint,
  type WeekHoursPoint,
} from "./time";
import { addDays, todayIsoDate, weekStart } from "./utils";

const ROLLING_WINDOW_DAYS = 7;
const ROLLING_SPAN_DAYS = 56;
const DAILY_SPAN_DAYS = 7;
const WEEKS_BACK = 8;

function pokeOutbox() {
  if (typeof navigator === "undefined" || navigator.onLine) {
    void syncEngine.drain();
  }
}

const live = (a: LocalTimeAllocation) => !a.deleted_at;

export interface TimeDashboardStats {
  weekly: WeekHoursPoint[];
  rolling: HoursPoint[];
  daily: HoursPoint[];
}

// Each chart's window can be shifted independently: `daily`/`rolling` step by
// whole days, `weekly` steps by whole weeks. 0 = current, negative = earlier.
export interface TimeWindowOffsets {
  daily?: number;
  weekly?: number;
  rolling?: number;
}

export function useTimeDashboardStats(
  offsets: TimeWindowOffsets = {},
): TimeDashboardStats | undefined {
  const dailyOffset = offsets.daily ?? 0;
  const weeklyOffset = offsets.weekly ?? 0;
  const rollingOffset = offsets.rolling ?? 0;
  return useLiveQuery(async () => {
    const today = todayIsoDate();
    const dailyAnchor = addDays(today, dailyOffset);
    const rollingAnchor = addDays(today, rollingOffset);
    const anchorWeekStart = addDays(weekStart(today), weeklyOffset * 7);

    const firstWeekStart = addDays(anchorWeekStart, -(WEEKS_BACK - 1) * 7);
    const rollingStart = addDays(rollingAnchor, -(ROLLING_SPAN_DAYS - 1));
    const rollingFetchStart = addDays(rollingStart, -(ROLLING_WINDOW_DAYS - 1));
    const dailyStart = addDays(dailyAnchor, -(DAILY_SPAN_DAYS - 1));
    const earliest = [firstWeekStart, rollingFetchStart, dailyStart].reduce((a, b) =>
      a < b ? a : b,
    );
    // Windows never extend past today (next is disabled at offset 0), but derive
    // the upper bound defensively so a future offset would still fetch.
    const latest = [today, dailyAnchor, rollingAnchor, addDays(anchorWeekStart, 6)].reduce((a, b) =>
      a > b ? a : b,
    );

    const allocs = (
      await db.timeAllocations.where("date").between(earliest, latest, true, true).toArray()
    ).filter(live);
    const perDay = hoursPerDay(allocs);

    const weekStarts: string[] = [];
    for (let i = WEEKS_BACK - 1; i >= 0; i--) weekStarts.push(addDays(anchorWeekStart, -i * 7));
    const weekly = weeklyHours(perDay, weekStarts);

    const rollingDates: string[] = [];
    for (let i = ROLLING_SPAN_DAYS - 1; i >= 0; i--) rollingDates.push(addDays(rollingAnchor, -i));
    const rolling = rollingHours(perDay, rollingDates, ROLLING_WINDOW_DAYS);

    const dailyDates: string[] = [];
    for (let i = DAILY_SPAN_DAYS - 1; i >= 0; i--) dailyDates.push(addDays(dailyAnchor, -i));
    const daily = dailyHours(perDay, dailyDates);

    return { weekly, rolling, daily };
  }, [dailyOffset, weeklyOffset, rollingOffset]);
}

export function useTimeTasks() {
  return useLiveQuery(async () => {
    const all = await db.timeTasks.toArray();
    return all
      .filter((t) => !t.deleted_at)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, []);
}

export function useAllocationsForDate(date: string) {
  return useLiveQuery(async () => {
    const rows = await db.timeAllocations.where("date").equals(date).toArray();
    return rows.filter(live);
  }, [date]);
}

export function useAllocationsInRange(startDate: string, endDate: string) {
  return useLiveQuery(async () => {
    const rows = await db.timeAllocations
      .where("date")
      .between(startDate, endDate, true, true)
      .toArray();
    return rows.filter(live);
  }, [startDate, endDate]);
}

function nowIso() {
  return new Date().toISOString();
}

export async function createTimeTask(input: { name: string; isWork: boolean }): Promise<LocalTimeTask> {
  const name = input.name.trim();
  if (!name) throw new Error("Task name required");
  const existing = await db.timeTasks.toArray();
  const liveTasks = existing.filter((t) => !t.deleted_at);
  // Reuse an existing live task with the same name instead of minting a second
  // row. Two devices each creating e.g. "TGM" offline used to produce duplicate
  // categories with different ids, diverging the task list and day grid.
  const dupe = liveTasks.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (dupe) return dupe;
  const usedColors = liveTasks.map((t) => t.color);
  const maxSort = existing.reduce((m, t) => Math.max(m, t.sort_order), -1);
  const row: LocalTimeTask = {
    id: uuidv4(),
    name,
    color: nextTaskColor(usedColors),
    is_work: input.isWork,
    sort_order: maxSort + 1,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
    sync_status: "pending",
  };
  await db.timeTasks.put(row);
  pokeOutbox();
  return row;
}

export async function updateTimeTask(
  id: string,
  patch: Partial<Pick<LocalTimeTask, "name" | "is_work" | "color">>,
) {
  const existing = await db.timeTasks.get(id);
  if (!existing) return;
  const next: LocalTimeTask = {
    ...existing,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    updated_at: nowIso(),
    sync_status: "pending",
  };
  await db.timeTasks.put(next);
  pokeOutbox();
}

export async function deleteTimeTaskCascade(id: string) {
  await db.transaction("rw", db.timeTasks, db.timeAllocations, async () => {
    const existing = await db.timeTasks.get(id);
    if (!existing) return;
    const ts = nowIso();
    await db.timeTasks.put({
      ...existing,
      deleted_at: ts,
      updated_at: ts,
      sync_status: "pending",
    });
    const allocs = await db.timeAllocations.where("task_id").equals(id).toArray();
    for (const a of allocs) {
      if (a.deleted_at) continue;
      await db.timeAllocations.put({
        ...a,
        deleted_at: ts,
        updated_at: ts,
        sync_status: "pending",
      });
    }
  });
  pokeOutbox();
}

export async function countAllocationsForTask(id: string): Promise<number> {
  const rows = await db.timeAllocations.where("task_id").equals(id).toArray();
  return rows.filter(live).length;
}

export async function setAllocation(date: string, slot: number, taskId: string) {
  const id = `${date}#${slot}`;
  const existing = await db.timeAllocations.get(id);
  const ts = nowIso();
  const row: LocalTimeAllocation = {
    id,
    date,
    slot,
    task_id: taskId,
    created_at: existing?.created_at ?? ts,
    updated_at: ts,
    deleted_at: null,
    sync_status: "pending",
  };
  await db.timeAllocations.put(row);
  pokeOutbox();
}

export async function clearAllocation(date: string, slot: number) {
  const id = `${date}#${slot}`;
  const existing = await db.timeAllocations.get(id);
  if (!existing || existing.deleted_at) return;
  const ts = nowIso();
  await db.timeAllocations.put({
    ...existing,
    deleted_at: ts,
    updated_at: ts,
    sync_status: "pending",
  });
  pokeOutbox();
}

export async function toggleOrAssignAllocation(date: string, slot: number, taskId: string) {
  const id = `${date}#${slot}`;
  const existing = await db.timeAllocations.get(id);
  if (existing && !existing.deleted_at && existing.task_id === taskId) {
    await clearAllocation(date, slot);
    return;
  }
  await setAllocation(date, slot, taskId);
}
