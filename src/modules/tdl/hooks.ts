import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { SECTIONS } from "./sections";
import type { LocalTdlDay, LocalTdlItem } from "./types";

export interface DayBundle {
  items: LocalTdlItem[];
  day: LocalTdlDay | null;
  bySection: Record<string, { recurring: LocalTdlItem[]; dated: LocalTdlItem[] }>;
}

function bucket(items: LocalTdlItem[]): DayBundle["bySection"] {
  const out: DayBundle["bySection"] = {};
  for (const s of SECTIONS) out[s.key] = { recurring: [], dated: [] };
  for (const item of items) {
    const slot = out[item.section] ?? (out[item.section] = { recurring: [], dated: [] });
    if (item.is_recurring) slot.recurring.push(item);
    else slot.dated.push(item);
  }
  for (const slot of Object.values(out)) {
    slot.recurring.sort((a, b) => a.position - b.position);
    slot.dated.sort((a, b) => a.position - b.position);
  }
  return out;
}

export function useDay(snapshot_date?: string): DayBundle | undefined {
  return useLiveQuery(async () => {
    if (!snapshot_date) return { items: [], day: null, bySection: bucket([]) };
    const [rows, day] = await Promise.all([
      db.tdl_items.where("snapshot_date").equals(snapshot_date).toArray(),
      db.tdl_days.get(snapshot_date),
    ]);
    const live = rows.filter((r) => !r.deleted_at);
    return {
      items: live,
      day: day ?? null,
      bySection: bucket(live),
    };
  }, [snapshot_date]);
}

export interface DayCompletion {
  total: number;
  done: number;
  ratio: number;
}

export function dayCompletion(items: LocalTdlItem[]): DayCompletion {
  const nonRecurring = items.filter((i) => !i.is_recurring);
  const counted = nonRecurring.filter(
    (i) =>
      i.status === "open" ||
      i.status === "worked_today" ||
      i.status === "ready_for_testing" ||
      i.status === "done",
  );
  const done = counted.filter((i) => i.status === "done").length;
  const total = counted.length;
  return { total, done, ratio: total === 0 ? 0 : done / total };
}

export interface HistoryPoint {
  snapshot_date: string;
  total: number;
  done: number;
  ratio: number;
}

export function useHistory(limit = 90): HistoryPoint[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.tdl_items.toArray();
    const live = rows.filter((r) => !r.deleted_at && !r.is_recurring);
    const byDate = new Map<string, LocalTdlItem[]>();
    for (const r of live) {
      const arr = byDate.get(r.snapshot_date) ?? [];
      arr.push(r);
      byDate.set(r.snapshot_date, arr);
    }
    const dates = Array.from(byDate.keys()).sort();
    const slice = dates.slice(-limit);
    return slice.map((d) => {
      const items = byDate.get(d)!;
      const c = dayCompletion(items);
      return { snapshot_date: d, total: c.total, done: c.done, ratio: c.ratio };
    });
  }, [limit]);
}

export function useKnownDates(limit = 365): string[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.tdl_items.toArray();
    const live = rows.filter((r) => !r.deleted_at);
    const dates = new Set<string>();
    for (const r of live) dates.add(r.snapshot_date);
    return Array.from(dates).sort().slice(-limit);
  }, [limit]);
}

export function usePrevDateWithItems(snapshot_date?: string): string | undefined {
  return useLiveQuery(async () => {
    if (!snapshot_date) return undefined;
    const rows = await db.tdl_items.toArray();
    const live = rows.filter((r) => !r.deleted_at);
    const dates = Array.from(new Set(live.map((r) => r.snapshot_date)))
      .filter((d) => d < snapshot_date)
      .sort();
    return dates[dates.length - 1];
  }, [snapshot_date]);
}
