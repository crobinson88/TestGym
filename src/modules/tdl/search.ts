import type { LocalTdlItem } from "./types";

// Free-text match shared by the board search and the archived/snoozed lists:
// case-insensitive substring over title + notes. An empty query matches all.
export function matchesQuery(item: LocalTdlItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    item.title.toLowerCase().includes(q) ||
    (item.notes ?? "").toLowerCase().includes(q)
  );
}
