import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";

// Newest first; read items sink below unread so the queue reads top-down.
export function useReadingItems() {
  return useLiveQuery(async () => {
    const all = await db.reading_items.toArray();
    return all
      .filter((r) => !r.deleted_at)
      .sort((a, b) => {
        if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
        return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
      });
  }, []);
}

export function useReadingItem(id?: string) {
  return useLiveQuery(async () => {
    if (!id) return undefined;
    return db.reading_items.get(id);
  }, [id]);
}
