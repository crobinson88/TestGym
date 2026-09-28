import { v4 as uuid } from "uuid";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LocalTdlWorkstream } from "@/lib/db";
import { syncEngine } from "@/lib/sync";
import { reorderIds, sortWorkstreams } from "./workstreamGroups";

// Workstreams sub-group a category's items (e.g. "Billing revamp" and
// "Onboarding" under Product). Each category owns its own set; an item points
// at one via `workstream_id`, null = ungrouped.

const nowIso = () => new Date().toISOString();

function pokeOutbox() {
  if (typeof navigator === "undefined" || navigator.onLine) {
    void syncEngine.drain();
  }
}

// Every category's workstreams, keyed by category key — one live query for the
// whole day view rather than one per column.
export function useWorkstreamsByCategory(): Map<string, LocalTdlWorkstream[]> | undefined {
  return useLiveQuery(async () => {
    const rows = sortWorkstreams(await db.tdl_workstreams.toArray());
    const byCategory = new Map<string, LocalTdlWorkstream[]>();
    for (const row of rows) {
      const arr = byCategory.get(row.category_key) ?? [];
      arr.push(row);
      byCategory.set(row.category_key, arr);
    }
    return byCategory;
  }, []);
}

export function useWorkstreams(categoryKey: string | null): LocalTdlWorkstream[] | undefined {
  return useLiveQuery(async () => {
    if (!categoryKey) return [];
    const rows = await db.tdl_workstreams.where("category_key").equals(categoryKey).toArray();
    return sortWorkstreams(rows);
  }, [categoryKey]);
}

export async function createWorkstream(
  categoryKey: string,
  label: string,
): Promise<LocalTdlWorkstream> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("createWorkstream: label required");
  const live = sortWorkstreams(
    await db.tdl_workstreams.where("category_key").equals(categoryKey).toArray(),
  );
  const sort_order = live.length === 0 ? 0 : Math.max(...live.map((r) => r.sort_order)) + 1;
  const ts = nowIso();
  const row: LocalTdlWorkstream = {
    id: uuid(),
    category_key: categoryKey,
    label: trimmed,
    sort_order,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    sync_status: "pending",
  };
  await db.tdl_workstreams.put(row);
  pokeOutbox();
  return row;
}

export async function renameWorkstream(id: string, label: string): Promise<void> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("renameWorkstream: label required");
  const existing = await db.tdl_workstreams.get(id);
  if (!existing || existing.deleted_at || existing.label === trimmed) return;
  await db.tdl_workstreams.put({
    ...existing,
    label: trimmed,
    updated_at: nowIso(),
    sync_status: "pending",
  });
  pokeOutbox();
}

// Nudge a workstream one slot up (-1) or down (+1) within its category.
export async function moveWorkstream(id: string, step: -1 | 1): Promise<void> {
  const existing = await db.tdl_workstreams.get(id);
  if (!existing || existing.deleted_at) return;
  const siblings = sortWorkstreams(
    await db.tdl_workstreams.where("category_key").equals(existing.category_key).toArray(),
  );
  const ids = siblings.map((w) => w.id);
  const next = reorderIds(ids, id, step);
  if (next === ids) return;
  const ts = nowIso();
  await db.transaction("rw", db.tdl_workstreams, async () => {
    for (let i = 0; i < next.length; i++) {
      const row = siblings.find((w) => w.id === next[i])!;
      if (row.sort_order === i) continue;
      await db.tdl_workstreams.put({ ...row, sort_order: i, updated_at: ts, sync_status: "pending" });
    }
  });
  pokeOutbox();
}

// Soft-delete a workstream. Its items aren't lost — they fall back to ungrouped
// on every day they sit on.
export async function deleteWorkstream(id: string): Promise<void> {
  const existing = await db.tdl_workstreams.get(id);
  if (!existing || existing.deleted_at) return;
  const ts = nowIso();
  const items = await db.tdl_items.where("workstream_id").equals(id).toArray();
  await db.transaction("rw", db.tdl_workstreams, db.tdl_items, async () => {
    await db.tdl_workstreams.put({
      ...existing,
      deleted_at: ts,
      updated_at: ts,
      sync_status: "pending",
    });
    for (const item of items) {
      if (item.deleted_at) continue;
      await db.tdl_items.put({
        ...item,
        workstream_id: null,
        updated_at: ts,
        sync_status: "pending",
      });
    }
  });
  pokeOutbox();
}

// Put items into a workstream (or ungroup them with null). A workstream only
// holds items from its own category, so items from any other category in the
// selection are skipped. Returns how many changed.
export async function setItemsWorkstream(
  ids: readonly string[],
  workstreamId: string | null,
  categoryKey: string,
): Promise<number> {
  if (ids.length === 0) return 0;
  const ts = nowIso();
  let changed = 0;
  await db.transaction("rw", db.tdl_items, async () => {
    for (const id of ids) {
      const item = await db.tdl_items.get(id);
      if (!item || item.deleted_at || item.section !== categoryKey) continue;
      if ((item.workstream_id ?? null) === workstreamId) continue;
      await db.tdl_items.put({
        ...item,
        workstream_id: workstreamId,
        updated_at: ts,
        sync_status: "pending",
      });
      changed++;
    }
  });
  pokeOutbox();
  return changed;
}
