import { v4 as uuid } from "uuid";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LocalTdlCompletion, LocalTdlItem, LocalTdlWorkstream } from "@/lib/db";
import type { TdlSweptItem } from "@/lib/database.types";
import { syncEngine } from "@/lib/sync";
import { todayIsoDate } from "@/lib/utils";
import { chainIndexOf, rootItemId, type ChainLink } from "./chain";
import {
  collectSweepCandidates,
  groupByWeek,
  loggedThreadIds,
  weekOf,
  weekRange,
  type CompletedWeek,
  type SweepCandidate,
} from "./completed";
import { unarchiveItem } from "./repo";

// The Completed list: things you've finished, logged week by week. An entry is a
// snapshot, not a pointer — completing something records its title and category
// so the log still reads right once the task is archived, renamed or deleted.
// Sending a task here also marks it done and archives it, which takes it off the
// board and stops it rolling forward; `dayCompletion` keeps done-then-archived
// items, so the day it was finished on still gets the credit.

const nowIso = () => new Date().toISOString();

function pokeOutbox() {
  if (typeof navigator === "undefined" || navigator.onLine) {
    void syncEngine.drain();
  }
}

export function useCompletions(): LocalTdlCompletion[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.tdl_completions.toArray();
    return rows.filter((r) => !r.deleted_at);
  }, []);
}

export function useCompletedWeeks(): CompletedWeek<LocalTdlCompletion>[] | undefined {
  return useLiveQuery(async () => groupByWeek(await db.tdl_completions.toArray()), []);
}

// How many things are on the log for the week a given day falls in — the count
// the day header's Completed button shows.
export function useWeekCompletedCount(snapshot_date?: string): number | undefined {
  return useLiveQuery(async () => {
    const week = weekOf(snapshot_date ?? todayIsoDate());
    const rows = await db.tdl_completions.where("week_start").equals(week).toArray();
    return rows.filter((r) => !r.deleted_at).length;
  }, [snapshot_date]);
}

async function chainIndex(): Promise<Map<string, ChainLink>> {
  return chainIndexOf(await db.tdl_items.toArray());
}

async function liveCompletions(): Promise<LocalTdlCompletion[]> {
  return (await db.tdl_completions.toArray()).filter((r) => !r.deleted_at);
}

function completionRow(input: {
  threadId: string;
  kind: "item" | "workstream";
  title: string;
  categoryKey: string | null;
  completedOn: string;
  sourceItemId?: string | null;
  workstreamId?: string | null;
  timeEstimateMin?: number | null;
  sweptItems?: TdlSweptItem[];
  note?: string | null;
  ts: string;
}): LocalTdlCompletion {
  return {
    id: uuid(),
    kind: input.kind,
    thread_id: input.threadId,
    source_item_id: input.sourceItemId ?? null,
    workstream_id: input.workstreamId ?? null,
    category_key: input.categoryKey,
    title: input.title,
    completed_on: input.completedOn,
    week_start: weekOf(input.completedOn),
    time_estimate_min: input.timeEstimateMin ?? null,
    swept_items: input.sweptItems ?? [],
    note: input.note ?? null,
    created_at: input.ts,
    updated_at: input.ts,
    deleted_at: null,
    sync_status: "pending",
  };
}

function finishedItem(item: LocalTdlItem, ts: string): LocalTdlItem {
  return {
    ...item,
    status: "done",
    is_archived: true,
    // A snoozed task that gets completed shouldn't wake back up.
    snoozed_until: null,
    last_worked_at: item.last_worked_at ?? ts,
    updated_at: ts,
    sync_status: "pending",
  };
}

// Send tasks to the Completed list. `completedOn` is the day the work is being
// credited to (the day being viewed), defaulting to the item's own day so
// completing from a past board files the entry in that week. Anything already on
// the log is skipped, so completing twice is a no-op. Returns how many landed.
export async function completeItems(
  ids: readonly string[],
  completedOn?: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const ts = nowIso();
  const today = todayIsoDate();
  const byId = await chainIndex();
  const logged = loggedThreadIds(await liveCompletions());
  let added = 0;
  await db.transaction("rw", db.tdl_items, db.tdl_completions, async () => {
    for (const id of ids) {
      const item = await db.tdl_items.get(id);
      if (!item || item.deleted_at) continue;
      const threadId = rootItemId({ id: item.id, origin_item_id: item.origin_item_id }, byId);
      if (logged.has(threadId)) continue;
      logged.add(threadId);
      // A future-dated board shouldn't log work as finished ahead of time.
      const on = completedOn ?? (item.snapshot_date > today ? today : item.snapshot_date);
      await db.tdl_completions.add(
        completionRow({
          threadId,
          kind: "item",
          title: item.title,
          categoryKey: item.section,
          completedOn: on,
          sourceItemId: item.id,
          workstreamId: item.workstream_id,
          timeEstimateMin: item.time_estimate_min,
          ts,
        }),
      );
      await db.tdl_items.put(finishedItem(item, ts));
      added++;
    }
  });
  pokeOutbox();
  return added;
}

export interface WorkstreamCompletion {
  entry: LocalTdlCompletion;
  swept: number;
}

// Send a whole workstream to the Completed list: one entry named after it,
// carrying a snapshot of the tasks it closed, and every one of those tasks
// marked done + archived. The workstream itself is stood down with
// `completed_at` rather than deleted, so it leaves the pickers but keeps its
// items and its history. Items already on the log keep their own entry and are
// left out of the sweep.
export async function completeWorkstream(
  workstreamId: string,
  completedOn?: string,
): Promise<WorkstreamCompletion | null> {
  const ws = await db.tdl_workstreams.get(workstreamId);
  if (!ws || ws.deleted_at) return null;
  const logged = loggedThreadIds(await liveCompletions());
  if (logged.has(workstreamId)) return null;
  const ts = nowIso();
  const on = completedOn ?? todayIsoDate();
  const byId = await chainIndex();
  const rows = (await db.tdl_items.where("workstream_id").equals(workstreamId).toArray()).filter(
    (r) => !r.deleted_at,
  );
  // A task rolls forward into a row per day; sweep the latest row of each chain
  // so a task carried through the week is closed once, not five times.
  const latest = new Map<string, LocalTdlItem>();
  for (const item of rows) {
    const threadId = rootItemId({ id: item.id, origin_item_id: item.origin_item_id }, byId);
    const held = latest.get(threadId);
    if (!held || item.snapshot_date > held.snapshot_date) latest.set(threadId, item);
  }
  const sweepable = [...latest.entries()].filter(([threadId]) => !logged.has(threadId));
  const swept_items: TdlSweptItem[] = sweepable.map(([, item]) => ({
    item_id: item.id,
    title: item.title,
  }));
  const minutes = sweepable.reduce((sum, [, item]) => sum + (item.time_estimate_min ?? 0), 0);
  const entry = completionRow({
    threadId: workstreamId,
    kind: "workstream",
    title: ws.label,
    categoryKey: ws.category_key,
    completedOn: on,
    workstreamId,
    timeEstimateMin: minutes > 0 ? minutes : null,
    sweptItems: swept_items,
    ts,
  });
  await db.transaction(
    "rw",
    db.tdl_items,
    db.tdl_completions,
    db.tdl_workstreams,
    async () => {
      await db.tdl_completions.add(entry);
      for (const [, item] of sweepable) {
        if (item.status === "cancelled") continue;
        await db.tdl_items.put(finishedItem(item, ts));
      }
      await db.tdl_workstreams.put({
        ...ws,
        completed_at: ts,
        updated_at: ts,
        sync_status: "pending",
      });
    },
  );
  pokeOutbox();
  return { entry, swept: swept_items.length };
}

// Re-open a completed workstream without touching the log — it comes back into
// the pickers with its items where they were left.
export async function reopenWorkstream(workstreamId: string): Promise<void> {
  const ws = await db.tdl_workstreams.get(workstreamId);
  if (!ws || ws.deleted_at || !ws.completed_at) return;
  const ts = nowIso();
  await db.tdl_workstreams.put({
    ...ws,
    completed_at: null,
    updated_at: ts,
    sync_status: "pending",
  });
  pokeOutbox();
}

// Take an entry back off the log. An item entry unarchives its task onto today's
// board (`unarchiveItem`), a workstream entry re-opens the workstream; neither
// restores the swept tasks, which stay archived until put back one by one.
export async function removeCompletion(id: string): Promise<void> {
  const entry = await db.tdl_completions.get(id);
  if (!entry || entry.deleted_at) return;
  const ts = nowIso();
  await db.tdl_completions.put({
    ...entry,
    deleted_at: ts,
    updated_at: ts,
    sync_status: "pending",
  });
  if (entry.kind === "workstream" && entry.workstream_id) {
    await reopenWorkstream(entry.workstream_id);
  } else if (entry.source_item_id) {
    const item = await db.tdl_items.get(entry.source_item_id);
    if (item && !item.deleted_at && item.is_archived) await unarchiveItem(item.id);
  }
  pokeOutbox();
}

export async function setCompletionNote(id: string, note: string): Promise<void> {
  const entry = await db.tdl_completions.get(id);
  if (!entry || entry.deleted_at) return;
  const trimmed = note.trim();
  const next = trimmed === "" ? null : trimmed;
  if (next === entry.note) return;
  const ts = nowIso();
  await db.tdl_completions.put({
    ...entry,
    note: next,
    updated_at: ts,
    sync_status: "pending",
  });
  pokeOutbox();
}

// Live workstreams for a category, with the completed ones dropped — what the
// pickers and the board should show.
export function openWorkstreams(rows: readonly LocalTdlWorkstream[]): LocalTdlWorkstream[] {
  return rows.filter((r) => !r.deleted_at && !r.completed_at);
}

// What the "Close out the week" sweep offers for the week `snapshot_date` falls
// in: every task marked done that week and not already logged.
export function useSweepCandidates(snapshot_date?: string): SweepCandidate<LocalTdlItem>[] | undefined {
  return useLiveQuery(async () => {
    const week = weekOf(snapshot_date ?? todayIsoDate());
    const range = weekRange(week);
    const [items, completions] = await Promise.all([
      db.tdl_items.toArray(),
      db.tdl_completions.toArray(),
    ]);
    return collectSweepCandidates(
      items,
      completions.filter((r) => !r.deleted_at),
      range,
      items,
    );
  }, [snapshot_date]);
}

// Log the sweep's ticked tasks in one go. No `completedOn` is passed, so each
// entry is credited to the day its task was finished on rather than the day the
// sweep is run.
export async function logSweep(
  candidates: readonly SweepCandidate<LocalTdlItem>[],
): Promise<number> {
  return completeItems(candidates.map((c) => c.item.id));
}
