import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { todayIsoDate } from "@/lib/utils";
import { SECTIONS } from "./sections";
import { isSnoozed } from "./snooze";
import type { LocalTdlDay, LocalTdlItem, TdlStatus } from "./types";

export interface DayBundle {
  items: LocalTdlItem[];
  // Items used for the day's completion score. Same as `items` plus the
  // done-then-archived tasks, which keep counting even though they no longer
  // render on the board.
  completionItems: LocalTdlItem[];
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
    if (!snapshot_date)
      return { items: [], completionItems: [], day: null, bySection: bucket([]) };
    const [rows, day] = await Promise.all([
      db.tdl_items.where("snapshot_date").equals(snapshot_date).toArray(),
      db.tdl_days.get(snapshot_date),
    ]);
    // Snoozed items disappear from the day view until the snapshot reaches
    // their wake-up date; they live on in the snoozed list instead.
    const live = rows.filter((r) => !r.deleted_at && !r.is_archived && !isSnoozed(r));
    // dayCompletion keeps done-then-archived items; hand it everything live
    // (including archived) and let it decide what counts.
    const completionItems = rows.filter((r) => !r.deleted_at);
    return {
      items: live,
      completionItems,
      day: day ?? null,
      bySection: bucket(live),
    };
  }, [snapshot_date]);
}

export function useArchivedItems(): LocalTdlItem[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.tdl_items.toArray();
    return rows
      .filter((r) => r.is_archived && !r.deleted_at)
      .sort(
        (a, b) =>
          b.snapshot_date.localeCompare(a.snapshot_date) ||
          a.section.localeCompare(b.section) ||
          a.position - b.position,
      );
  }, []);
}

const SECTION_INDEX = new Map(SECTIONS.map((s, i) => [s.key, i]));

// Items currently snoozed (wake-up date still after `today`), deduped and
// ordered by section. A snoozed item carries forward each day, so the same task
// can have a row on several snapshots; keep only the tip of each roll-forward
// chain (the row no other live row carries from) so each task shows once.
export function selectSnoozed(rows: LocalTdlItem[], today: string): LocalTdlItem[] {
  const live = rows.filter(
    (r) => !r.deleted_at && !r.is_archived && isSnoozed(r, today),
  );
  const carriedFrom = new Set(
    live.map((r) => r.origin_item_id).filter((id): id is string => Boolean(id)),
  );
  return live
    .filter((r) => !carriedFrom.has(r.id))
    .sort(
      (a, b) =>
        (SECTION_INDEX.get(a.section) ?? 0) - (SECTION_INDEX.get(b.section) ?? 0) ||
        (a.snoozed_until ?? "").localeCompare(b.snoozed_until ?? "") ||
        a.position - b.position,
    );
}

export function useSnoozedItems(): LocalTdlItem[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.tdl_items.toArray();
    return selectSnoozed(rows, todayIsoDate());
  }, []);
}

export interface DayCompletion {
  total: number;
  done: number;
  active: number;
  ratio: number;
  activeRatio: number;
  priorityTotal: number;
  priorityActive: number;
  // "Don't want to do" items: how many exist today vs how many are finished.
  reluctantTotal: number;
  reluctantDone: number;
}

export function dayCompletion(items: LocalTdlItem[]): DayCompletion {
  // Archived items normally drop off the day, but an item that was marked done
  // and then archived stays counted — archiving a finished task shouldn't claw
  // back the point it earned.
  const nonRecurring = items.filter(
    (i) => !i.is_recurring && !isSnoozed(i) && (!i.is_archived || i.status === "done"),
  );
  const counted = nonRecurring.filter(
    (i) =>
      i.status === "open" ||
      i.status === "worked_today" ||
      i.status === "ready_for_testing" ||
      i.status === "done",
  );
  const isActive = (i: LocalTdlItem) => i.status === "worked_today" || i.status === "done";
  const done = counted.filter((i) => i.status === "done").length;
  const active = counted.filter(isActive).length;
  const total = counted.length;
  const priority = counted.filter((i) => i.priority_rank != null);
  const reluctant = counted.filter((i) => i.is_reluctant);
  return {
    total,
    done,
    active,
    ratio: total === 0 ? 0 : done / total,
    activeRatio: total === 0 ? 0 : active / total,
    priorityTotal: priority.length,
    priorityActive: priority.filter(isActive).length,
    reluctantTotal: reluctant.length,
    reluctantDone: reluctant.filter((i) => i.status === "done").length,
  };
}

export interface SectionStatusCounts {
  open: number;
  inProgress: number;
  testing: number;
  done: number;
  cancelled: number;
}

// Per-section status tally for the section header. Snoozed items are excluded to
// match the board (they live on the snoozed list, not the day). `inProgress`
// covers everything actively being worked but not done, so `ready_for_testing`
// always counts toward it; in Product it is *also* surfaced as `testing`.
export function sectionStatusCounts(
  items: LocalTdlItem[],
  isProduct = false,
): SectionStatusCounts {
  const counts: SectionStatusCounts = {
    open: 0,
    inProgress: 0,
    testing: 0,
    done: 0,
    cancelled: 0,
  };
  for (const item of items) {
    if (isSnoozed(item)) continue;
    const status: TdlStatus = item.status;
    if (status === "ready_for_testing") {
      counts.inProgress += 1;
      if (isProduct) counts.testing += 1;
    } else if (status === "worked_today") {
      counts.inProgress += 1;
    } else if (status === "open") {
      counts.open += 1;
    } else if (status === "done") {
      counts.done += 1;
    } else if (status === "cancelled") {
      counts.cancelled += 1;
    }
  }
  return counts;
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
    const live = rows.filter(
      (r) => !r.deleted_at && !r.is_recurring && (!r.is_archived || r.status === "done"),
    );
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
