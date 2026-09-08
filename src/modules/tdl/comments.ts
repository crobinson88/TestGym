import { v4 as uuid } from "uuid";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LocalTdlComment } from "@/lib/db";
import { syncEngine } from "@/lib/sync";
import type { LocalTdlItem } from "./types";

const nowIso = () => new Date().toISOString();

function pokeOutbox() {
  if (typeof navigator === "undefined" || navigator.onLine) {
    void syncEngine.drain();
  }
}

export interface ChainLink {
  id: string;
  origin_item_id: string | null;
}

// The id a card's comment thread hangs off: the first row of its roll-forward
// chain. A task gets a fresh row every day it carries over, so anchoring on the
// row id would lose the thread overnight; anchoring on the chain root keeps it.
// Walks `origin_item_id` up through the rows we hold, stopping at the last one
// we can see (a chain whose start has been purged still resolves consistently)
// and guarding against a cycle.
export function rootItemId(item: ChainLink, byId: Map<string, ChainLink>): string {
  const seen = new Set<string>([item.id]);
  let current = item;
  while (current.origin_item_id) {
    const parent = byId.get(current.origin_item_id);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current.id;
}

// The thread id for one card, resolved against every item in the local store.
export function useThreadId(item: LocalTdlItem | null): string | undefined {
  return useLiveQuery(async () => {
    if (!item) return undefined;
    const rows = await db.tdl_items.toArray();
    const byId = new Map<string, ChainLink>(
      rows.map((r) => [r.id, { id: r.id, origin_item_id: r.origin_item_id }]),
    );
    return rootItemId({ id: item.id, origin_item_id: item.origin_item_id }, byId);
  }, [item?.id, item?.origin_item_id]);
}

export function sortComments(rows: LocalTdlComment[]): LocalTdlComment[] {
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

// A card's comments, oldest first. Undefined until the query has run.
export function useComments(threadId: string | undefined): LocalTdlComment[] | undefined {
  return useLiveQuery(async () => {
    if (!threadId) return [];
    return sortComments(await db.tdl_comments.where("thread_id").equals(threadId).toArray());
  }, [threadId]);
}

// Comment count per thread, from the comment rows alone.
export function countByThread(
  rows: readonly { thread_id: string; deleted_at: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.deleted_at) continue;
    counts.set(r.thread_id, (counts.get(r.thread_id) ?? 0) + 1);
  }
  return counts;
}

// Comment count per *item*, which is what a card badge needs: every row in a
// roll-forward chain shows the thread's count, so a comment left last week is
// still visible on today's card.
export function countByItem(
  items: readonly ChainLink[],
  comments: readonly { thread_id: string; deleted_at: string | null }[],
): Map<string, number> {
  const byThread = countByThread(comments);
  if (byThread.size === 0) return new Map();
  const byId = new Map(items.map((i) => [i.id, i]));
  const out = new Map<string, number>();
  for (const item of items) {
    const n = byThread.get(rootItemId(item, byId));
    if (n) out.set(item.id, n);
  }
  return out;
}

export function useCommentCounts(): Map<string, number> | undefined {
  return useLiveQuery(async () => {
    const [items, comments] = await Promise.all([
      db.tdl_items.toArray(),
      db.tdl_comments.toArray(),
    ]);
    return countByItem(
      items.map((i) => ({ id: i.id, origin_item_id: i.origin_item_id })),
      comments,
    );
  }, []);
}

export async function addComment(
  threadId: string,
  itemId: string,
  body: string,
): Promise<LocalTdlComment | null> {
  const trimmed = body.trim();
  if (!trimmed) return null;
  const ts = nowIso();
  const row: LocalTdlComment = {
    id: uuid(),
    thread_id: threadId,
    item_id: itemId,
    body: trimmed,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
    sync_status: "pending",
  };
  await db.tdl_comments.put(row);
  pokeOutbox();
  return row;
}

export async function updateComment(id: string, body: string): Promise<void> {
  const trimmed = body.trim();
  const existing = await db.tdl_comments.get(id);
  if (!existing || !trimmed || trimmed === existing.body) return;
  await db.tdl_comments.put({
    ...existing,
    body: trimmed,
    updated_at: nowIso(),
    sync_status: "pending",
  });
  pokeOutbox();
}

export async function deleteComment(id: string): Promise<void> {
  const existing = await db.tdl_comments.get(id);
  if (!existing || existing.deleted_at) return;
  const ts = nowIso();
  await db.tdl_comments.put({
    ...existing,
    deleted_at: ts,
    updated_at: ts,
    sync_status: "pending",
  });
  pokeOutbox();
}
