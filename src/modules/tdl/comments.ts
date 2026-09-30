import { v4 as uuid } from "uuid";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { LocalTdlComment } from "@/lib/db";
import { syncEngine } from "@/lib/sync";
import type { LocalTdlItem } from "./types";
import { chainIndexOf, rootItemId, type ChainLink } from "./chain";

const nowIso = () => new Date().toISOString();

function pokeOutbox() {
  if (typeof navigator === "undefined" || navigator.onLine) {
    void syncEngine.drain();
  }
}

// The thread id for one card, resolved against every item in the local store.
export function useThreadId(item: LocalTdlItem | null): string | undefined {
  return useLiveQuery(async () => {
    if (!item) return undefined;
    const byId = chainIndexOf(await db.tdl_items.toArray());
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
