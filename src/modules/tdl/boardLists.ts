import { v4 as uuid } from "uuid";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LocalTdlBoardList, LocalTdlItem } from "@/lib/db";
import { syncEngine } from "@/lib/sync";

const nowIso = () => new Date().toISOString();

function pokeOutbox() {
  if (typeof navigator === "undefined" || navigator.onLine) {
    void syncEngine.drain();
  }
}

// The lists a brand-new category's board starts with. Matches what the
// migration seeded for the categories that already existed.
export const DEFAULT_LIST_LABELS = ["Backlog", "In progress", "Done"] as const;

function sortLists(rows: LocalTdlBoardList[]): LocalTdlBoardList[] {
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

// Every category's lists, keyed by category key. One live query for the whole
// table keeps the board from re-subscribing when the category changes.
export function useBoardListsByCategory(): Map<string, LocalTdlBoardList[]> | undefined {
  return useLiveQuery(async () => {
    const rows = sortLists(await db.tdl_board_lists.toArray());
    const byCategory = new Map<string, LocalTdlBoardList[]>();
    for (const row of rows) {
      const arr = byCategory.get(row.category_key) ?? [];
      arr.push(row);
      byCategory.set(row.category_key, arr);
    }
    return byCategory;
  }, []);
}

export function useBoardLists(categoryKey: string | null): LocalTdlBoardList[] | undefined {
  return useLiveQuery(async () => {
    if (!categoryKey) return [];
    const rows = await db.tdl_board_lists.where("category_key").equals(categoryKey).toArray();
    return sortLists(rows);
  }, [categoryKey]);
}

export async function createBoardList(
  categoryKey: string,
  label: string,
): Promise<LocalTdlBoardList> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("createBoardList: label required");
  const live = sortLists(
    await db.tdl_board_lists.where("category_key").equals(categoryKey).toArray(),
  );
  const sort_order = live.length === 0 ? 0 : Math.max(...live.map((r) => r.sort_order)) + 1;
  const ts = nowIso();
  const row: LocalTdlBoardList = {
    id: uuid(),
    category_key: categoryKey,
    label: trimmed,
    sort_order,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    sync_status: "pending",
  };
  await db.tdl_board_lists.put(row);
  pokeOutbox();
  return row;
}

// Give a category the three standard lists in one go — the empty-board offer.
export async function seedDefaultLists(categoryKey: string): Promise<LocalTdlBoardList[]> {
  const out: LocalTdlBoardList[] = [];
  for (const label of DEFAULT_LIST_LABELS) out.push(await createBoardList(categoryKey, label));
  return out;
}

export async function renameBoardList(
  id: string,
  label: string,
): Promise<LocalTdlBoardList | null> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("renameBoardList: label required");
  const existing = await db.tdl_board_lists.get(id);
  if (!existing) return null;
  await db.tdl_board_lists.put({
    ...existing,
    label: trimmed,
    updated_at: nowIso(),
    sync_status: "pending",
  });
  pokeOutbox();
  return db.tdl_board_lists.get(id) as Promise<LocalTdlBoardList>;
}

export async function reorderBoardLists(orderedIds: string[]): Promise<void> {
  const ts = nowIso();
  await db.transaction("rw", db.tdl_board_lists, async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      const existing = await db.tdl_board_lists.get(orderedIds[i]);
      if (!existing || existing.deleted_at) continue;
      if (existing.sort_order === i) continue;
      await db.tdl_board_lists.put({
        ...existing,
        sort_order: i,
        updated_at: ts,
        sync_status: "pending",
      });
    }
  });
  pokeOutbox();
}

// Soft-delete a list. Its cards aren't touched or lost — they fall back to the
// category's first list (see resolveListId), so the count is a warning, not a
// block; the caller confirms before calling.
export async function deleteBoardList(id: string): Promise<void> {
  const existing = await db.tdl_board_lists.get(id);
  if (!existing || existing.deleted_at) return;
  const ts = nowIso();
  const cards = await db.tdl_items.where("board_list_id").equals(id).toArray();
  await db.transaction("rw", db.tdl_board_lists, db.tdl_items, async () => {
    await db.tdl_board_lists.put({
      ...existing,
      deleted_at: ts,
      updated_at: ts,
      sync_status: "pending",
    });
    for (const card of cards) {
      if (card.deleted_at) continue;
      await db.tdl_items.put({
        ...card,
        board_list_id: null,
        updated_at: ts,
        sync_status: "pending",
      });
    }
  });
  pokeOutbox();
}

// How many live cards a list is holding on one day, for the delete confirm.
export function countCardsInList(items: readonly LocalTdlItem[], listId: string): number {
  return items.filter((i) => i.board_list_id === listId).length;
}
