import type { LocalTdlItem } from "./types";
import { UNCATEGORISED, UNCATEGORISED_KEY, type SectionConfig } from "./sections";
import { isActive } from "./snooze";

export interface SectionGroup {
  cfg: SectionConfig;
  items: LocalTdlItem[];
}

// The category an item belongs to for display purposes: its own section while
// that category is live on the board, else the virtual Uncategorised bucket
// (the category was archived or deleted out from under it).
export function displaySection(item: LocalTdlItem, liveKeys: Set<string>): string {
  return liveKeys.has(item.section) ? item.section : UNCATEGORISED_KEY;
}

// Bucket items by category in board order, Uncategorised last, dropping empty
// groups. Shared by the Archive and Snoozed views so both read the same way.
export function groupBySection(
  items: LocalTdlItem[],
  categories: SectionConfig[],
): SectionGroup[] {
  const liveKeys = new Set(categories.map((c) => c.key));
  const byKey = new Map<string, LocalTdlItem[]>();
  for (const item of items) {
    const key = displaySection(item, liveKeys);
    const arr = byKey.get(key) ?? [];
    arr.push(item);
    byKey.set(key, arr);
  }
  return [...categories, UNCATEGORISED]
    .filter((cfg) => (byKey.get(cfg.key)?.length ?? 0) > 0)
    .map((cfg) => ({ cfg, items: byKey.get(cfg.key)! }));
}

// Items a category-level bulk action targets: everything live on the board for
// that day in one of `sections` (the Uncategorised column stands in for several
// orphaned keys, hence a list). Archived, snoozed and deleted rows are already
// off the board and stay untouched.
export function selectCategoryTargets(
  rows: LocalTdlItem[],
  snapshot_date: string,
  sections: string[],
): LocalTdlItem[] {
  const keys = new Set(sections);
  return rows.filter(
    (r) => r.snapshot_date === snapshot_date && keys.has(r.section) && isActive(r),
  );
}
