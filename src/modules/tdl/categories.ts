import { v4 as uuid } from "uuid";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LocalTdlCategory } from "@/lib/db";
import { syncEngine } from "@/lib/sync";
import { todayIsoDate } from "@/lib/utils";
import { SECTIONS, type SectionConfig, toSectionConfig } from "./sections";
import { isSnoozed } from "./snooze";
import type { TdlStatus } from "./types";

const nowIso = () => new Date().toISOString();

function pokeOutbox() {
  if (typeof navigator === "undefined" || navigator.onLine) {
    void syncEngine.drain();
  }
}

function sortRows(rows: LocalTdlCategory[]): LocalTdlCategory[] {
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

// Live category rows, for management UI. Includes deleted? No — only live.
export function useCategoryRows(): LocalTdlCategory[] | undefined {
  return useLiveQuery(async () => {
    const rows = await db.tdl_categories.toArray();
    return sortRows(rows);
  }, []);
}

// Stable fallback reference so consumers depending on the category list don't
// see a new array identity every render before the first sync.
const DEFAULT_CONFIGS: SectionConfig[] = [...SECTIONS];

// Board-facing category configs. Falls back to the seeded defaults until the
// first sync populates the table (offline-first first run).
export function useCategories(): SectionConfig[] {
  const live = useLiveQuery(async () => {
    const rows = await db.tdl_categories.toArray();
    return sortRows(rows).map(toSectionConfig);
  }, []);
  if (live === undefined) return DEFAULT_CONFIGS;
  return live.length > 0 ? live : DEFAULT_CONFIGS;
}

const ACTIVE_STATUSES: ReadonlySet<TdlStatus> = new Set([
  "open",
  "worked_today",
  "ready_for_testing",
]);

// A category can only be deleted when nothing active or snoozed still points at
// it. Done/cancelled/archived history is fine — those rows fall into the
// Uncategorised group once the category is gone.
function isBlocking(item: { deleted_at: string | null; is_archived: boolean; status: TdlStatus; snoozed_until: string | null; snapshot_date: string }, today: string): boolean {
  if (item.deleted_at || item.is_archived) return false;
  if (isSnoozed(item, today)) return true;
  return ACTIVE_STATUSES.has(item.status);
}

export async function blockingItemCount(key: string, today = todayIsoDate()): Promise<number> {
  const rows = await db.tdl_items.toArray();
  return rows.filter((r) => r.section === key && isBlocking(r, today)).length;
}

// Active-or-snoozed item count per category key, for the manage UI to gate the
// delete button.
export function useBlockingCounts(): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const today = todayIsoDate();
    const rows = await db.tdl_items.toArray();
    const counts = new Map<string, number>();
    for (const r of rows) {
      if (!isBlocking(r, today)) continue;
      counts.set(r.section, (counts.get(r.section) ?? 0) + 1);
    }
    return counts;
  }, []);
}

export async function createCategory(label: string): Promise<LocalTdlCategory> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("createCategory: label required");
  const rows = await db.tdl_categories.toArray();
  const live = rows.filter((r) => !r.deleted_at);
  const sort_order = live.length === 0 ? 0 : Math.max(...live.map((r) => r.sort_order)) + 1;
  const ts = nowIso();
  const row: LocalTdlCategory = {
    id: uuid(),
    key: uuid(),
    label: trimmed,
    sort_order,
    has_due_date: true,
    has_time_estimate: true,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    sync_status: "pending",
  };
  await db.tdl_categories.put(row);
  pokeOutbox();
  return row;
}

export async function renameCategory(id: string, label: string): Promise<LocalTdlCategory | null> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("renameCategory: label required");
  const existing = await db.tdl_categories.get(id);
  if (!existing) return null;
  const updated: LocalTdlCategory = {
    ...existing,
    label: trimmed,
    updated_at: nowIso(),
    sync_status: "pending",
  };
  await db.tdl_categories.put(updated);
  pokeOutbox();
  return updated;
}

// Rewrite sort_order to match the given id order. Ids not present in the table
// (or already deleted) are skipped; live categories missing from the list keep
// their relative order after the listed ones.
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const ts = nowIso();
  await db.transaction("rw", db.tdl_categories, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const existing = await db.tdl_categories.get(orderedIds[i]);
      if (!existing || existing.deleted_at) continue;
      if (existing.sort_order === i) continue;
      await db.tdl_categories.put({
        ...existing,
        sort_order: i,
        updated_at: ts,
        sync_status: "pending",
      });
    }
  });
  pokeOutbox();
}

export async function deleteCategory(id: string): Promise<LocalTdlCategory | null> {
  const existing = await db.tdl_categories.get(id);
  if (!existing || existing.deleted_at) return existing ?? null;
  const blocking = await blockingItemCount(existing.key);
  if (blocking > 0) {
    throw new Error(
      `Cannot delete "${existing.label}": ${blocking} active or snoozed item${blocking === 1 ? "" : "s"} still in this category.`,
    );
  }
  const ts = nowIso();
  const updated: LocalTdlCategory = {
    ...existing,
    deleted_at: ts,
    updated_at: ts,
    sync_status: "pending",
  };
  await db.tdl_categories.put(updated);
  pokeOutbox();
  return updated;
}
