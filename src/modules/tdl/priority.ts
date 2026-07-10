// Pure priority-rank helpers. Kept free of the sync/db layer so they stay
// import-safe in tests and cheap to reuse in components.

// Priority is a 1–10 rank (1 = most important); null clears it. Ranks are
// unique within a day — see setPriorityRank in repo.ts.
export const MAX_PRIORITY_RANK = 10;

export function clampRank(rank: number | null): number | null {
  if (rank == null) return null;
  const r = Math.round(rank);
  if (!Number.isFinite(r) || r < 1) return null;
  return Math.min(r, MAX_PRIORITY_RANK);
}

// Ranks currently in use among a set of items (for disabling already-taken
// options in the rank picker).
export function usedRanks(items: ReadonlyArray<{ priority_rank: number | null }>): Set<number> {
  const out = new Set<number>();
  for (const i of items) if (i.priority_rank != null) out.add(i.priority_rank);
  return out;
}

// The ranked items for the Priorities board column: every item carrying a rank,
// ordered 1 (most important) → 10. Ranks are unique within a day, so this is a
// stable order.
export function selectPriorityItems<T extends { priority_rank: number | null }>(
  items: readonly T[],
): T[] {
  return items
    .filter((i) => i.priority_rank != null)
    .sort((a, b) => (a.priority_rank as number) - (b.priority_rank as number));
}

// Dragging inside the Priorities column reorders the ranked items without
// inventing new ranks: it keeps the existing set of rank values and reassigns
// them smallest-first down the new order. Uniqueness is preserved because the
// pool is just a permutation of the ranks already in use. Returns only the
// items whose rank actually changes.
export function reorderedRankAssignments<T extends { id: string; priority_rank: number | null }>(
  itemsInNewOrder: readonly T[],
): { id: string; rank: number }[] {
  const pool = itemsInNewOrder
    .map((i) => i.priority_rank)
    .filter((r): r is number => r != null)
    .sort((a, b) => a - b);
  const out: { id: string; rank: number }[] = [];
  for (let i = 0; i < itemsInNewOrder.length; i++) {
    const rank = pool[i];
    if (rank == null) continue;
    if (itemsInNewOrder[i].priority_rank !== rank) {
      out.push({ id: itemsInNewOrder[i].id, rank });
    }
  }
  return out;
}
