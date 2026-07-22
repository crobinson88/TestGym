// Pure Eisenhower-matrix helpers. Kept free of the sync/db layer so they stay
// import-safe in tests and cheap to reuse in components.

import type { TdlQuadrant } from "@/lib/database.types";
import type { LocalTdlItem } from "./types";

export interface QuadrantConfig {
  key: TdlQuadrant;
  // Full name for the sub-group header.
  label: string;
  // The urgent/important framing, shown under the header.
  hint: string;
  // Two-letter code for the compact row selector.
  short: string;
  urgent: boolean;
  important: boolean;
}

// Fixed display order: most actionable first.
export const QUADRANTS: readonly QuadrantConfig[] = [
  { key: "do_first", label: "Do First", hint: "Urgent & Important", short: "DF", urgent: true, important: true },
  { key: "schedule", label: "Schedule", hint: "Important, Not Urgent", short: "SC", urgent: false, important: true },
  { key: "delegate", label: "Delegate", hint: "Urgent, Not Important", short: "DL", urgent: true, important: false },
  { key: "eliminate", label: "Eliminate", hint: "Not Urgent or Important", short: "EL", urgent: false, important: false },
];

export const QUADRANT_BY_KEY: Record<TdlQuadrant, QuadrantConfig> = Object.fromEntries(
  QUADRANTS.map((q) => [q.key, q]),
) as Record<TdlQuadrant, QuadrantConfig>;

export const UNCLASSIFIED_LABEL = "Unclassified";

const ORDER = new Map<TdlQuadrant, number>(QUADRANTS.map((q, i) => [q.key, i]));

// Sort key for a quadrant; null (unclassified) always sorts last.
export function quadrantOrder(q: TdlQuadrant | null): number {
  return q == null ? QUADRANTS.length : ORDER.get(q) ?? QUADRANTS.length;
}

export interface QuadrantGroup {
  // null = the unclassified bucket.
  key: TdlQuadrant | null;
  label: string;
  hint: string | null;
  items: LocalTdlItem[];
}

// The "Do First" (urgent & important) items for the virtual board column: every
// item tagged do_first, ranked ones first (rank 1 → 10) then the rest by board
// position. An at-a-glance list of what has to happen today, auto-populated from
// the quadrant tag — no manual list to maintain.
export function selectDoFirstItems<T extends { eisenhower_quadrant: TdlQuadrant | null; priority_rank: number | null; position: number }>(
  items: readonly T[],
): T[] {
  return items
    .filter((i) => i.eisenhower_quadrant === "do_first")
    .sort((a, b) => {
      const ra = a.priority_rank ?? Infinity;
      const rb = b.priority_rank ?? Infinity;
      if (ra !== rb) return ra - rb;
      return a.position - b.position;
    });
}

// Group a category's items into Eisenhower quadrants, in fixed order with the
// unclassified bucket last. Only non-empty groups are returned; item order
// within a group is preserved (callers hand items in position order).
export function groupByQuadrant(items: readonly LocalTdlItem[]): QuadrantGroup[] {
  const buckets = new Map<TdlQuadrant | null, LocalTdlItem[]>();
  for (const item of items) {
    const key = item.eisenhower_quadrant ?? null;
    const arr = buckets.get(key) ?? [];
    arr.push(item);
    buckets.set(key, arr);
  }
  const groups: QuadrantGroup[] = [];
  for (const q of QUADRANTS) {
    const arr = buckets.get(q.key);
    if (arr && arr.length > 0) {
      groups.push({ key: q.key, label: q.label, hint: q.hint, items: arr });
    }
  }
  const unclassified = buckets.get(null);
  if (unclassified && unclassified.length > 0) {
    groups.push({ key: null, label: UNCLASSIFIED_LABEL, hint: null, items: unclassified });
  }
  return groups;
}
