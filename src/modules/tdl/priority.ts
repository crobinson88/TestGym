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
