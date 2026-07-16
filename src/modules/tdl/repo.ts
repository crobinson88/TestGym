import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import type { LocalTdlDay, LocalTdlItem } from "@/lib/db";
import { syncEngine } from "@/lib/sync";
import { isResettable } from "./snooze";
import { nextLastWorkedAt } from "./age";
import type { TdlItemRow, TdlSection, TdlStatus } from "./types";
import type { TdlQuadrant } from "@/lib/database.types";

const nowIso = () => new Date().toISOString();

function pokeOutbox() {
  if (typeof navigator === "undefined" || navigator.onLine) {
    void syncEngine.drain();
  }
}

function coerceStatus(section: TdlSection, status: TdlStatus): TdlStatus {
  if (status === "ready_for_testing" && section !== "product") return "worked_today";
  return status;
}

export interface CreateItemInput {
  snapshot_date: string;
  section: TdlSection;
  title: string;
  is_recurring?: boolean;
  position?: number;
  due_date?: string | null;
  time_estimate_min?: number | null;
  priority_rank?: number | null;
  eisenhower_quadrant?: TdlQuadrant | null;
  is_archived?: boolean;
  snoozed_until?: string | null;
  is_reluctant?: boolean;
  reluctance_reason?: string | null;
  last_worked_at?: string | null;
  notes?: string | null;
  images?: string[];
  status?: TdlStatus;
  origin_item_id?: string | null;
  origin_snapshot_date?: string | null;
}

function pending(row: TdlItemRow): LocalTdlItem {
  return { ...row, sync_status: "pending" };
}

async function nextPosition(snapshot_date: string, section: TdlSection, isRecurring: boolean) {
  const rows = await db.tdl_items
    .where("[snapshot_date+section+position]")
    .between([snapshot_date, section, -Infinity], [snapshot_date, section, Infinity])
    .toArray();
  const live = rows.filter((r) => !r.deleted_at && r.is_recurring === isRecurring);
  if (live.length === 0) return 0;
  return Math.max(...live.map((r) => r.position)) + 1;
}

export async function createItem(input: CreateItemInput): Promise<LocalTdlItem> {
  const title = input.title.trim();
  if (!title) throw new Error("createItem: title required");
  const id = uuid();
  const ts = nowIso();
  const status = coerceStatus(input.section, input.status ?? "open");
  const position =
    input.position ?? (await nextPosition(input.snapshot_date, input.section, input.is_recurring ?? false));
  const row: TdlItemRow = {
    id,
    snapshot_date: input.snapshot_date,
    section: input.section,
    is_recurring: input.is_recurring ?? false,
    position,
    title,
    due_date: input.due_date ?? null,
    time_estimate_min: input.time_estimate_min ?? null,
    status,
    priority_rank: clampRank(input.priority_rank ?? null),
    eisenhower_quadrant: input.eisenhower_quadrant ?? null,
    is_archived: input.is_archived ?? false,
    snoozed_until: input.snoozed_until ?? null,
    is_reluctant: input.is_reluctant ?? false,
    reluctance_reason: input.reluctance_reason ?? null,
    last_worked_at: input.last_worked_at ?? null,
    notes: input.notes ?? null,
    images: input.images ?? [],
    origin_item_id: input.origin_item_id ?? null,
    origin_snapshot_date: input.origin_snapshot_date ?? null,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  const local = pending(row);
  await db.tdl_items.put(local);
  pokeOutbox();
  return local;
}

export async function updateItem(
  id: string,
  patch: Partial<Omit<TdlItemRow, "id" | "created_at">>,
): Promise<LocalTdlItem | null> {
  const existing = await db.tdl_items.get(id);
  if (!existing) return null;
  const ts = nowIso();
  const nextSection = patch.section ?? existing.section;
  const nextStatus = coerceStatus(nextSection, patch.status ?? existing.status);
  const last_worked_at = nextLastWorkedAt({
    prevStatus: existing.status,
    nextStatus,
    prevLastWorked: existing.last_worked_at ?? null,
    patchLastWorked: patch.last_worked_at,
    now: ts,
  });
  const updated: LocalTdlItem = {
    ...existing,
    ...patch,
    section: nextSection,
    status: nextStatus,
    last_worked_at,
    updated_at: ts,
    sync_status: "pending",
  };
  await db.tdl_items.put(updated);
  pokeOutbox();
  return updated;
}

export async function deleteItem(id: string): Promise<void> {
  const existing = await db.tdl_items.get(id);
  if (!existing || existing.deleted_at) return;
  const ts = nowIso();
  await db.tdl_items.put({
    ...existing,
    deleted_at: ts,
    updated_at: ts,
    sync_status: "pending",
  });
  pokeOutbox();
}

const STANDARD_CYCLE: TdlStatus[] = ["open", "worked_today", "done"];
const PRODUCT_CYCLE: TdlStatus[] = ["open", "worked_today", "ready_for_testing", "done"];

// Only the Product category exposes the "ready for testing" step; every other
// category (including user-created ones) uses the standard cycle.
export function statusCycleFor(section: TdlSection): TdlStatus[] {
  return section === "product" ? PRODUCT_CYCLE : STANDARD_CYCLE;
}

export function nextStatus(section: TdlSection, current: TdlStatus): TdlStatus {
  const cycle = statusCycleFor(section);
  if (current === "cancelled") return "open";
  const i = cycle.indexOf(current);
  if (i === -1) return "open";
  return cycle[(i + 1) % cycle.length];
}

export async function cycleStatus(id: string): Promise<LocalTdlItem | null> {
  const existing = await db.tdl_items.get(id);
  if (!existing) return null;
  return updateItem(id, { status: nextStatus(existing.section, existing.status) });
}

import { MAX_PRIORITY_RANK, clampRank, reorderedRankAssignments, usedRanks } from "./priority";
export { MAX_PRIORITY_RANK, clampRank, usedRanks };

export async function setPriorityRank(
  id: string,
  rank: number | null,
): Promise<LocalTdlItem | null> {
  const clamped = clampRank(rank);
  const existing = await db.tdl_items.get(id);
  if (!existing) return null;
  if (clamped != null) {
    // Enforce per-day uniqueness: clear this rank from any other live item on
    // the same day before assigning it here.
    const ts = nowIso();
    const siblings = await db.tdl_items
      .where("snapshot_date")
      .equals(existing.snapshot_date)
      .toArray();
    const conflicts = siblings.filter(
      (s) => s.id !== id && !s.deleted_at && s.priority_rank === clamped,
    );
    if (conflicts.length > 0) {
      await db.transaction("rw", db.tdl_items, async () => {
        for (const c of conflicts) {
          await db.tdl_items.put({
            ...c,
            priority_rank: null,
            updated_at: ts,
            sync_status: "pending",
          });
        }
      });
    }
  }
  return updateItem(id, { priority_rank: clamped });
}

// Reorder the ranked items for a day given their new visual order (the ids of
// every currently-ranked item, top → bottom). Keeps the existing set of rank
// values and shuffles them to match the new order — dragging a task up gives it
// a smaller (more important) rank. Unranked items are ignored.
export async function reorderPriorities(
  snapshot_date: string,
  orderedIds: string[],
): Promise<void> {
  const rows = await Promise.all(orderedIds.map((id) => db.tdl_items.get(id)));
  const items = rows.filter(
    (r): r is LocalTdlItem =>
      !!r && !r.deleted_at && r.snapshot_date === snapshot_date && r.priority_rank != null,
  );
  const assignments = reorderedRankAssignments(items);
  if (assignments.length === 0) return;
  const ts = nowIso();
  await db.transaction("rw", db.tdl_items, async () => {
    for (const { id, rank } of assignments) {
      const existing = await db.tdl_items.get(id);
      if (!existing) continue;
      await db.tdl_items.put({
        ...existing,
        priority_rank: rank,
        updated_at: ts,
        sync_status: "pending",
      });
    }
  });
  pokeOutbox();
}

// Assign (or clear, with null) an item's Eisenhower quadrant. Unlike priority
// rank, quadrants are not unique — any number of items can share one.
export async function setQuadrant(
  id: string,
  quadrant: TdlQuadrant | null,
): Promise<LocalTdlItem | null> {
  return updateItem(id, { eisenhower_quadrant: quadrant });
}

// Flag an item as one we don't want to do (but still need to). Clearing the
// flag also clears the recorded reason.
export async function setReluctant(
  id: string,
  reluctant: boolean,
): Promise<LocalTdlItem | null> {
  return updateItem(
    id,
    reluctant ? { is_reluctant: true } : { is_reluctant: false, reluctance_reason: null },
  );
}

export async function setReluctanceReason(
  id: string,
  reason: string | null,
): Promise<LocalTdlItem | null> {
  const next = reason?.trim() ? reason.trim() : null;
  return updateItem(id, { reluctance_reason: next });
}

// Apply the same patch to many items in one transaction, then poke the outbox
// once. `patchFor` returns null to skip an item (e.g. it no longer exists or the
// change wouldn't apply). Returns how many rows actually changed.
async function bulkUpdate(
  ids: string[],
  patchFor: (item: LocalTdlItem, ts: string) => Partial<TdlItemRow> | null,
): Promise<number> {
  if (ids.length === 0) return 0;
  const ts = nowIso();
  let changed = 0;
  await db.transaction("rw", db.tdl_items, async () => {
    for (const id of ids) {
      const existing = await db.tdl_items.get(id);
      if (!existing) continue;
      const patch = patchFor(existing, ts);
      if (!patch) continue;
      await db.tdl_items.put({
        ...existing,
        ...patch,
        updated_at: ts,
        sync_status: "pending",
      });
      changed++;
    }
  });
  pokeOutbox();
  return changed;
}

// Bulk-archive the given items. Already-archived ones are skipped.
export async function archiveItems(ids: string[]): Promise<number> {
  return bulkUpdate(ids, (it) => (it.is_archived ? null : { is_archived: true }));
}

// Bulk-snooze the given items to `until`. Items whose wake-up date wouldn't be
// after their own day are skipped (snoozing only moves an item into the future).
export async function snoozeItems(ids: string[], until: string): Promise<number> {
  if (!until) return 0;
  return bulkUpdate(ids, (it) => (until > it.snapshot_date ? { snoozed_until: until } : null));
}

// Bulk soft-delete the given items. Already-deleted ones are skipped.
export async function deleteItems(ids: string[]): Promise<number> {
  return bulkUpdate(ids, (it, ts) => (it.deleted_at ? null : { deleted_at: ts }));
}

// Bulk-cancel the given items (status → cancelled). Already-cancelled skipped.
export async function cancelItems(ids: string[]): Promise<number> {
  return bulkUpdate(ids, (it) => (it.status === "cancelled" ? null : { status: "cancelled" }));
}

// Bulk-clear snooze on the given items. Items that aren't snoozed are skipped.
export async function unsnoozeItems(ids: string[]): Promise<number> {
  return bulkUpdate(ids, (it) => (it.snoozed_until == null ? null : { snoozed_until: null }));
}

// Bulk-set the reluctance flag. Clearing it also clears the recorded reason.
export async function setReluctantItems(ids: string[], reluctant: boolean): Promise<number> {
  return bulkUpdate(ids, (it) => {
    if (it.is_reluctant === reluctant) return null;
    return reluctant ? { is_reluctant: true } : { is_reluctant: false, reluctance_reason: null };
  });
}

// Bulk-move the given items to a section, appending each after that section's
// current contents. Items already there are skipped. Returns how many moved.
export async function moveItemsToSection(ids: string[], toSection: TdlSection): Promise<number> {
  let changed = 0;
  for (const id of ids) {
    const existing = await db.tdl_items.get(id);
    if (!existing || existing.deleted_at || existing.section === toSection) continue;
    if (await moveItemToSection(id, toSection)) changed++;
  }
  return changed;
}

export async function archiveItem(id: string): Promise<LocalTdlItem | null> {
  return updateItem(id, { is_archived: true });
}

export async function unarchiveItem(id: string): Promise<LocalTdlItem | null> {
  return updateItem(id, { is_archived: false });
}

export async function snoozeItem(
  id: string,
  until: string,
): Promise<LocalTdlItem | null> {
  const existing = await db.tdl_items.get(id);
  if (!existing) return null;
  if (!until || until <= existing.snapshot_date) {
    throw new Error("snoozeItem: until must be a date after the item's day");
  }
  return updateItem(id, { snoozed_until: until });
}

export async function unsnoozeItem(id: string): Promise<LocalTdlItem | null> {
  return updateItem(id, { snoozed_until: null });
}

export async function moveItem(
  id: string,
  toSection: TdlSection,
  toPosition: number,
): Promise<LocalTdlItem | null> {
  const existing = await db.tdl_items.get(id);
  if (!existing) return null;
  return updateItem(id, {
    section: toSection,
    position: toPosition,
    status: coerceStatus(toSection, existing.status),
  });
}

export async function moveItemToSection(
  id: string,
  toSection: TdlSection,
): Promise<LocalTdlItem | null> {
  const existing = await db.tdl_items.get(id);
  if (!existing) return null;
  if (existing.section === toSection) return existing;
  const position = await nextPosition(existing.snapshot_date, toSection, existing.is_recurring);
  return moveItem(id, toSection, position);
}

export async function reorderSection(
  snapshot_date: string,
  section: TdlSection,
  isRecurring: boolean,
  orderedIds: string[],
): Promise<void> {
  const ts = nowIso();
  await db.transaction("rw", db.tdl_items, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      const existing = await db.tdl_items.get(id);
      if (!existing) continue;
      if (
        existing.snapshot_date !== snapshot_date ||
        existing.section !== section ||
        existing.is_recurring !== isRecurring
      ) {
        continue;
      }
      if (existing.position === i) continue;
      await db.tdl_items.put({
        ...existing,
        position: i,
        updated_at: ts,
        sync_status: "pending",
      });
    }
  });
  pokeOutbox();
}

export async function upsertDay(
  snapshot_date: string,
  patch: Partial<Pick<LocalTdlDay, "note">> = {},
): Promise<LocalTdlDay> {
  const existing = await db.tdl_days.get(snapshot_date);
  const ts = nowIso();
  const next: LocalTdlDay = existing
    ? { ...existing, ...patch, updated_at: ts, sync_status: "pending" }
    : {
        snapshot_date,
        note: patch.note ?? null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
        sync_status: "pending",
      };
  await db.tdl_days.put(next);
  pokeOutbox();
  return next;
}

// Reset every non-archived, non-snoozed item on a day back to "open". Returns
// how many rows changed.
export async function resetDayStatuses(snapshot_date: string): Promise<number> {
  const rows = await db.tdl_items.where("snapshot_date").equals(snapshot_date).toArray();
  const targets = rows.filter(isResettable);
  if (targets.length === 0) return 0;
  const ts = nowIso();
  await db.transaction("rw", db.tdl_items, async () => {
    for (const r of targets) {
      await db.tdl_items.put({ ...r, status: "open", updated_at: ts, sync_status: "pending" });
    }
  });
  pokeOutbox();
  return targets.length;
}

export function isValidSection(s: string): s is TdlSection {
  return s.trim().length > 0;
}
