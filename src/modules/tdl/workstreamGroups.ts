// Pure workstream helpers — grouping, ordering and drop semantics. Kept free
// of the sync/db layer so they stay import-safe in tests; the store-backed
// hooks and mutations live in workstreams.ts.

import type { TdlQuadrant } from "@/lib/database.types";

export const NO_WORKSTREAM_LABEL = "No workstream";

export interface WorkstreamLike {
  id: string;
  label: string;
  sort_order: number;
  deleted_at?: string | null;
}

export function sortWorkstreams<T extends WorkstreamLike>(rows: readonly T[]): T[] {
  return rows
    .filter((r) => !r.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

export interface WorkstreamGroup<I, W> {
  // null = the ungrouped bucket.
  workstream: W | null;
  items: I[];
}

// Split a category's items into its workstreams, in workstream order, with the
// ungrouped bucket last. An item whose workstream was deleted (or belongs to
// another category) reads as ungrouped. Empty workstreams are kept when
// `includeEmpty` so they stay visible as somewhere to add to; the ungrouped
// bucket only appears when it holds something. Item order within a group is
// preserved.
export function groupByWorkstream<I extends { workstream_id: string | null }, W extends WorkstreamLike>(
  items: readonly I[],
  workstreams: readonly W[],
  { includeEmpty = true }: { includeEmpty?: boolean } = {},
): WorkstreamGroup<I, W>[] {
  const live = sortWorkstreams(workstreams);
  const buckets = new Map<string, I[]>(live.map((w) => [w.id, []]));
  const ungrouped: I[] = [];
  for (const item of items) {
    const bucket = item.workstream_id ? buckets.get(item.workstream_id) : undefined;
    if (bucket) bucket.push(item);
    else ungrouped.push(item);
  }
  const groups: WorkstreamGroup<I, W>[] = [];
  for (const w of live) {
    const arr = buckets.get(w.id)!;
    if (arr.length > 0 || includeEmpty) groups.push({ workstream: w, items: arr });
  }
  if (ungrouped.length > 0) groups.push({ workstream: null, items: ungrouped });
  return groups;
}

// Swap `id` with its neighbour in `step` direction. Returns the input array
// unchanged (same reference) when the move would fall off either end.
export function reorderIds(ids: readonly string[], id: string, step: -1 | 1): readonly string[] {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

// What a dated item picks up when dropped onto another dated item: the
// target's Eisenhower quadrant and workstream. On a cross-category drop the
// move itself clears the workstream, so only a non-null target workstream is
// worth patching. Only changed fields are returned, so an in-group reorder is
// an empty patch.
export function dropClassifyPatch(
  active: {
    section: string;
    eisenhower_quadrant: TdlQuadrant | null;
    workstream_id: string | null;
  },
  over: {
    section: string;
    eisenhower_quadrant: TdlQuadrant | null;
    workstream_id: string | null;
  },
): { eisenhower_quadrant?: TdlQuadrant | null; workstream_id?: string | null } {
  const patch: { eisenhower_quadrant?: TdlQuadrant | null; workstream_id?: string | null } = {};
  const q = over.eisenhower_quadrant ?? null;
  if ((active.eisenhower_quadrant ?? null) !== q) patch.eisenhower_quadrant = q;
  const ws = over.workstream_id ?? null;
  const sameSection = active.section === over.section;
  if (sameSection ? (active.workstream_id ?? null) !== ws : ws !== null) {
    patch.workstream_id = ws;
  }
  return patch;
}
