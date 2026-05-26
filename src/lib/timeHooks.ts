import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import { db, type TimeAllocationRow, type TimeTaskRow } from "./db";
import { nextTaskColor } from "./time";

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
    return db.timeAllocations.where("date").equals(date).toArray();
  }, [date]);
}

export function useAllocationsInRange(startDate: string, endDate: string) {
  return useLiveQuery(async () => {
    return db.timeAllocations
      .where("date")
      .between(startDate, endDate, true, true)
      .toArray();
  }, [startDate, endDate]);
}

function nowIso() {
  return new Date().toISOString();
}

export async function createTimeTask(input: { name: string; isWork: boolean }): Promise<TimeTaskRow> {
  const name = input.name.trim();
  if (!name) throw new Error("Task name required");
  const existing = await db.timeTasks.toArray();
  const usedColors = existing.filter((t) => !t.deleted_at).map((t) => t.color);
  const maxSort = existing.reduce((m, t) => Math.max(m, t.sort_order), -1);
  const row: TimeTaskRow = {
    id: uuidv4(),
    name,
    color: nextTaskColor(usedColors),
    is_work: input.isWork,
    sort_order: maxSort + 1,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  };
  await db.timeTasks.put(row);
  return row;
}

export async function updateTimeTask(
  id: string,
  patch: Partial<Pick<TimeTaskRow, "name" | "is_work" | "color">>,
) {
  const existing = await db.timeTasks.get(id);
  if (!existing) return;
  const next: TimeTaskRow = {
    ...existing,
    ...patch,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    updated_at: nowIso(),
  };
  await db.timeTasks.put(next);
}

export async function deleteTimeTaskCascade(id: string) {
  await db.transaction("rw", db.timeTasks, db.timeAllocations, async () => {
    const existing = await db.timeTasks.get(id);
    if (!existing) return;
    await db.timeTasks.put({ ...existing, deleted_at: nowIso(), updated_at: nowIso() });
    await db.timeAllocations.where("task_id").equals(id).delete();
  });
}

export async function countAllocationsForTask(id: string): Promise<number> {
  return db.timeAllocations.where("task_id").equals(id).count();
}

export async function setAllocation(date: string, slot: number, taskId: string) {
  const id = `${date}#${slot}`;
  const row: TimeAllocationRow = {
    id,
    date,
    slot,
    task_id: taskId,
    updated_at: nowIso(),
  };
  await db.timeAllocations.put(row);
}

export async function clearAllocation(date: string, slot: number) {
  const id = `${date}#${slot}`;
  await db.timeAllocations.delete(id);
}

export async function toggleOrAssignAllocation(date: string, slot: number, taskId: string) {
  const id = `${date}#${slot}`;
  const existing = await db.timeAllocations.get(id);
  if (existing && existing.task_id === taskId) {
    await db.timeAllocations.delete(id);
    return;
  }
  await setAllocation(date, slot, taskId);
}
