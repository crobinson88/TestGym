import { v4 as uuid } from "uuid";
import { db } from "@/lib/db";
import type { LocalTdlDay, LocalTdlItem } from "@/lib/db";
import { syncEngine } from "@/lib/sync";
import { SECTION_BY_KEY } from "./sections";
import type { TdlItemRow, TdlSection, TdlStatus } from "./types";

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
  is_priority?: boolean;
  notes?: string | null;
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
    is_priority: input.is_priority ?? false,
    notes: input.notes ?? null,
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
  const updated: LocalTdlItem = {
    ...existing,
    ...patch,
    section: nextSection,
    status: nextStatus,
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

export const STATUS_CYCLE: Record<TdlSection, TdlStatus[]> = {
  weekly_goals: ["open", "worked_today", "done"],
  follow_ups: ["open", "worked_today", "done"],
  product: ["open", "worked_today", "ready_for_testing", "done"],
  tgm_tasks: ["open", "worked_today", "done"],
  meeting_action_items: ["open", "worked_today", "done"],
  personal_other: ["open", "worked_today", "done"],
  new: ["open", "worked_today", "done"],
};

export function nextStatus(section: TdlSection, current: TdlStatus): TdlStatus {
  const cycle = STATUS_CYCLE[section];
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

export async function togglePriority(id: string): Promise<LocalTdlItem | null> {
  const existing = await db.tdl_items.get(id);
  if (!existing) return null;
  return updateItem(id, { is_priority: !existing.is_priority });
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

export function isValidSection(s: string): s is TdlSection {
  return s in SECTION_BY_KEY;
}
