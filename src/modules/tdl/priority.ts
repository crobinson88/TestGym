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
