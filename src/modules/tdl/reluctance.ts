// Pure helpers for the "Don't want to do" board column. Kept free of the
// sync/db layer so they stay import-safe in tests and cheap to reuse.

// The reluctant items for the virtual "Don't want to do" column: every item
// flagged is_reluctant, ranked ones first (rank 1 → 10) then the rest by board
// position — the same order the Do First mirror uses. Membership is the flag
// set from the row's More menu, so there's nothing to add or reorder here.
export function selectReluctantItems<
  T extends { is_reluctant: boolean; priority_rank: number | null; position: number },
>(items: readonly T[]): T[] {
  return items
    .filter((i) => i.is_reluctant)
    .sort((a, b) => {
      const ra = a.priority_rank ?? Infinity;
      const rb = b.priority_rank ?? Infinity;
      if (ra !== rb) return ra - rb;
      return a.position - b.position;
    });
}
