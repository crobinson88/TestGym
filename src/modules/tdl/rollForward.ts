import { v4 as uuid } from "uuid";
import type { GymDB, LocalTdlItem, LocalTdlDay } from "@/lib/db";
import { db as defaultDb } from "@/lib/db";
import type { TdlItemRow, TdlStatus } from "./types";

export interface RollForwardResult {
  created: number;
  carried: number;
  // Proposed rows held back because they looked like duplicates of something
  // already on the target day.
  skipped: number;
  daySeeded: boolean;
}

export interface RollForwardDeps {
  db?: GymDB;
  now?: () => string;
  onChange?: () => void;
}

// Why a proposed row looks like it is already on the target day.
//  - "chain": the same task, reached by a different path (it was carried day by
//    day while the user rolls from further back). Certain.
//  - "title": a different chain with the same title in the same category. A
//    hand-retyped task, or two genuinely separate jobs that share a name.
export type DuplicateReason = "chain" | "title";

export interface RollForwardDuplicate {
  row: LocalTdlItem;
  existing: LocalTdlItem;
  reason: DuplicateReason;
}

export interface RollForwardPlan {
  fromDate: string;
  toDate: string;
  // Rows with no match on the target day — safe to add without asking.
  carry: LocalTdlItem[];
  // Rows that need a human call before they are added.
  duplicates: RollForwardDuplicate[];
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

export function normaliseTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ChainLink {
  id: string;
  origin_item_id: string | null;
}

// Every row mapped to the first row of its roll-forward chain, so two rows of
// the same task recognise each other whichever day they were reached from.
// Walks `origin_item_id` up through the rows we hold, stopping at the oldest
// one still present (a purged chain start still resolves consistently) and
// guarding against a cycle. Roots resolved along the way are memoised, so a
// year-long chain is walked once, not once per day on it.
export function buildRootMap(rows: readonly ChainLink[]): Map<string, string> {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const roots = new Map<string, string>();
  for (const row of rows) {
    if (roots.has(row.id)) continue;
    const path: string[] = [];
    const seen = new Set<string>();
    let current: ChainLink = row;
    let root: string;
    for (;;) {
      const memo = roots.get(current.id);
      if (memo) {
        root = memo;
        break;
      }
      seen.add(current.id);
      path.push(current.id);
      const parentId = current.origin_item_id;
      const parent = parentId ? byId.get(parentId) : undefined;
      if (!parent || seen.has(parent.id)) {
        root = current.id;
        break;
      }
      current = parent;
    }
    for (const id of path) roots.set(id, root);
  }
  return roots;
}

// Sort proposed rows into the ones that are new to the target day and the ones
// that look like something already sitting there. Pure — the modal shows the
// second list and the user decides what to do with it.
export function splitDuplicates(
  proposed: readonly LocalTdlItem[],
  existing: readonly LocalTdlItem[],
  roots: Map<string, string>,
): { carry: LocalTdlItem[]; duplicates: RollForwardDuplicate[] } {
  const byRoot = new Map<string, LocalTdlItem>();
  const byTitle = new Map<string, LocalTdlItem>();
  for (const e of existing) {
    const root = roots.get(e.id) ?? e.id;
    if (!byRoot.has(root)) byRoot.set(root, e);
    const key = `${e.section}|${normaliseTitle(e.title)}`;
    if (!byTitle.has(key)) byTitle.set(key, e);
  }

  const carry: LocalTdlItem[] = [];
  const duplicates: RollForwardDuplicate[] = [];
  for (const row of proposed) {
    // A proposed row is brand new, so its chain is its source's chain.
    const parentId = row.origin_item_id;
    const root = parentId ? roots.get(parentId) ?? parentId : row.id;
    const chainMatch = byRoot.get(root);
    if (chainMatch) {
      duplicates.push({ row, existing: chainMatch, reason: "chain" });
      continue;
    }
    const titleMatch = byTitle.get(`${row.section}|${normaliseTitle(row.title)}`);
    if (titleMatch) {
      duplicates.push({ row, existing: titleMatch, reason: "title" });
      continue;
    }
    carry.push(row);
  }
  return { carry, duplicates };
}

function carryRow(prev: LocalTdlItem, toDate: string, ts: string): LocalTdlItem {
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
    eisenhower_quadrant: prev.eisenhower_quadrant,
    is_archived: false,
    snoozed_until: prev.is_recurring ? null : prev.snoozed_until,
    is_reluctant: prev.is_reluctant,
    reluctance_reason: prev.reluctance_reason,
    last_worked_at: prev.last_worked_at ?? null,
    notes: prev.notes,
    images: [],
    board_list_id: prev.board_list_id ?? null,
    origin_item_id: prev.id,
    origin_snapshot_date: prev.origin_snapshot_date ?? prev.snapshot_date,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  };
  return { ...row, sync_status: "pending" };
}

// Work out what carrying `fromDate` into `toDate` would do, without writing
// anything. Rows already carried straight from this source are dropped outright
// (re-running a roll is a no-op); everything else that collides is surfaced as a
// duplicate for the user to confirm.
export async function planRollForward(
  fromDate: string,
  toDate: string,
  deps: RollForwardDeps = {},
): Promise<RollForwardPlan> {
  const db = deps.db ?? defaultDb;
  const now = deps.now ?? (() => new Date().toISOString());

  const allRows = await db.tdl_items.toArray();
  const live = allRows.filter((r) => !r.deleted_at);
  const fromRows = live.filter((r) => r.snapshot_date === fromDate);
  const toRows = live.filter((r) => r.snapshot_date === toDate);

  const alreadyCarried = new Set(
    toRows.filter((r) => r.origin_item_id).map((r) => r.origin_item_id as string),
  );

  const ts = now();
  const proposed = fromRows
    .filter((r) => shouldCarry(r))
    .filter((r) => !alreadyCarried.has(r.id))
    .map((prev) => carryRow(prev, toDate, ts));

  const roots = buildRootMap(live);
  const { carry, duplicates } = splitDuplicates(proposed, toRows, roots);
  return { fromDate, toDate, carry, duplicates };
}

// Write a set of planned rows onto the target day. Re-reads the day so the
// positions stay right even if it changed while the confirmation modal was up.
export async function applyRollForward(
  toDate: string,
  rows: readonly LocalTdlItem[],
  deps: RollForwardDeps = {},
): Promise<RollForwardResult> {
  const db = deps.db ?? defaultDb;
  const now = deps.now ?? (() => new Date().toISOString());
  const ts = now();

  const [toRows, toDayRow] = await Promise.all([
    db.tdl_items.where("snapshot_date").equals(toDate).toArray(),
    db.tdl_days.get(toDate),
  ]);

  const newRows = rows.map((r) => ({
    ...r,
    snapshot_date: toDate,
    created_at: ts,
    updated_at: ts,
    sync_status: "pending" as const,
  }));

  const renumbered = renumber([...toRows, ...newRows]);
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

  return { created: newRows.length, carried: newRows.length, skipped: 0, daySeeded };
}

// Carry a whole day forward, holding back anything that looks like a duplicate.
// The UI plans and applies separately so the user can rule on the duplicates;
// this is the unattended path.
export async function rollForward(
  fromDate: string,
  toDate: string,
  deps: RollForwardDeps = {},
): Promise<RollForwardResult> {
  const plan = await planRollForward(fromDate, toDate, deps);
  const result = await applyRollForward(toDate, plan.carry, deps);
  return { ...result, skipped: plan.duplicates.length };
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
