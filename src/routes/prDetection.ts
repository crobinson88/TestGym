export type FlashKind =
  | { kind: "saved" }
  | { kind: "pr-weight"; weight: number }
  | { kind: "pr-reps"; reps: number }
  | { kind: "pr-both"; weight: number; reps: number };

export interface PrSnapshot {
  totalSets: number;
  prWeight: number;
  prReps: number;
}

export function detectPr(
  snapshot: PrSnapshot | null | undefined,
  newWeight: number,
  newReps: number,
): FlashKind {
  const hadHistory = !!snapshot && snapshot.totalSets > 0;
  if (!hadHistory) return { kind: "saved" };
  const beatWeight = newWeight > snapshot.prWeight;
  const beatReps = newReps > snapshot.prReps;
  if (beatWeight && beatReps) return { kind: "pr-both", weight: newWeight, reps: newReps };
  if (beatWeight) return { kind: "pr-weight", weight: newWeight };
  if (beatReps) return { kind: "pr-reps", reps: newReps };
  return { kind: "saved" };
}
