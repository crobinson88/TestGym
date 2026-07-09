import { v4 as uuid } from "uuid";
import type { GymDB, LocalTdlItem, LocalTdlDay } from "@/lib/db";
import { db as defaultDb } from "@/lib/db";
import type { TdlItemRow, TdlStatus } from "./types";

export interface RollForwardResult {
  created: number;
  carried: number;
  daySeeded: boolean;
}

export interface RollForwardDeps {
  db?: GymDB;
  now?: () => string;
  onChange?: () => void;
}

function carryStatusFor(prev: LocalTdlItem): TdlStatus {
  // Recurring items reset each day; everything else keeps its status so that
  // done/cancelled work stays visible until it is explicitly archived.
  if (prev.is_recurring) return "open";
  return prev.status;
}

function shouldCarry(prev: LocalTdlItem): boolean {
  // Carry every live item of any status. Archiving is the only opt-out.
  if (prev.deleted_at) return false;
  if (prev.is_archived) return false;
  return true;
}

export async function rollForward(
  fromDate: string,
  toDate: string,
  deps: RollForwardDeps = {},
): Promise<RollForwardResult> {
  const db = deps.db ?? defaultDb;
  const now = deps.now ?? (() => new Date().toISOString());

  const [fromRows, toRows, toDayRow] = await Promise.all([
    db.tdl_items.where("snapshot_date").equals(fromDate).toArray(),
    db.tdl_items.where("snapshot_date").equals(toDate).toArray(),
    db.tdl_days.get(toDate),
  ]);

  const alreadyCarried = new Set(
    toRows.filter((r) => r.origin_item_id).map((r) => r.origin_item_id as string),
  );

  const candidates = fromRows
    .filter((r) => shouldCarry(r))
    .filter((r) => !alreadyCarried.has(r.id));

  const ts = now();

  const newRows: LocalTdlItem[] = candidates.map((prev) => {
    const row: TdlItemRow = {
      id: uuid(),
      snapshot_date: toDate,
      section: prev.section,
      is_recurring: prev.is_recurring,
      position: prev.position,
      title: prev.title,
      due_date: prev.is_recurring ? null : prev.due_date,
      time_estimate_min: prev.is_recurring ? null : prev.time_estimate_min,
      status: carryStatusFor(prev),
      priority_rank: prev.priority_rank,
      is_archived: false,
      snoozed_until: prev.is_recurring ? null : prev.snoozed_until,
      is_reluctant: prev.is_reluctant,
      reluctance_reason: prev.reluctance_reason,
      notes: prev.notes,
      images: [],
      origin_item_id: prev.id,
      origin_snapshot_date: prev.origin_snapshot_date ?? prev.snapshot_date,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    };
    return { ...row, sync_status: "pending" };
  });

  const allForTarget = [...toRows, ...newRows];
  const renumbered = renumber(allForTarget);
  const renumberedById = new Map(renumbered.map((r) => [r.id, r]));

  const toWrite: LocalTdlItem[] = [];
  for (const r of newRows) {
    const fresh = renumberedById.get(r.id);
    if (fresh) toWrite.push(fresh);
  }
  for (const existing of toRows) {
    const fresh = renumberedById.get(existing.id);
    if (!fresh) continue;
    if (fresh.position !== existing.position) {
      toWrite.push({ ...fresh, updated_at: ts, sync_status: "pending" });
    }
  }

  let daySeeded = false;
  await db.transaction("rw", db.tdl_items, db.tdl_days, async () => {
    if (toWrite.length > 0) await db.tdl_items.bulkPut(toWrite);
    if (!toDayRow) {
      const seed: LocalTdlDay = {
        snapshot_date: toDate,
        note: null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
        sync_status: "pending",
      };
      await db.tdl_days.put(seed);
      daySeeded = true;
    }
  });

  deps.onChange?.();

  return { created: newRows.length, carried: newRows.length, daySeeded };
}

function renumber(rows: ReadonlyArray<LocalTdlItem>): LocalTdlItem[] {
  // Positions are scoped to each (section, recurring) bucket, so the order in
  // which buckets are visited does not affect correctness — only the order
  // within a bucket does. Iterate over every bucket present so items in any
  // category (including user-created ones) are renumbered.
  const live = rows.filter((r) => !r.deleted_at);
  const buckets = new Map<string, LocalTdlItem[]>();
  for (const r of live) {
    const k = `${r.section}|${r.is_recurring ? "r" : "d"}`;
    const arr = buckets.get(k) ?? [];
    arr.push(r);
    buckets.set(k, arr);
  }
  const out: LocalTdlItem[] = [];
  for (const arr of buckets.values()) {
    arr.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    arr.forEach((row, idx) => {
      out.push({ ...row, position: idx });
    });
  }
  return out;
}

