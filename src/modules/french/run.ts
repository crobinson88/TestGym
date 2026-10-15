import type { FrenchTestKind } from "@/lib/database.types";

// A back-to-back run of tests of one kind, counted across the "Another … test"
// button. Held in sessionStorage because that button reloads the route (which is
// what re-draws the questions), so component state wouldn't survive it. Cleared
// when the French home screen is reached — leaving the runner ends the run.
export const RUN_STORAGE_KEY = "french:run";

export type TestRun = {
  kind: FrenchTestKind;
  tests: number;
  total: number;
  correct: number;
};

export function addTest(
  run: TestRun | null,
  kind: FrenchTestKind,
  total: number,
  correct: number,
): TestRun {
  const base = run && run.kind === kind ? run : { kind, tests: 0, total: 0, correct: 0 };
  return {
    kind,
    tests: base.tests + 1,
    total: base.total + total,
    correct: base.correct + correct,
  };
}

// A stored run only counts for the kind being taken now — switching kinds starts
// a fresh run rather than pooling vocab answers with listening ones.
export function parseRun(raw: string | null, kind: string | undefined): TestRun | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<TestRun>;
    if (!v.kind || v.kind !== kind) return null;
    if (
      typeof v.tests !== "number" ||
      typeof v.total !== "number" ||
      typeof v.correct !== "number"
    ) {
      return null;
    }
    return { kind: v.kind, tests: v.tests, total: v.total, correct: v.correct };
  } catch {
    return null;
  }
}

export function loadRun(kind: string | undefined): TestRun | null {
  try {
    return parseRun(sessionStorage.getItem(RUN_STORAGE_KEY), kind);
  } catch {
    return null;
  }
}

export function saveRun(run: TestRun): void {
  try {
    sessionStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(run));
  } catch {
    // Private-mode storage failures just cost the running total.
  }
}

export function clearRun(): void {
  try {
    sessionStorage.removeItem(RUN_STORAGE_KEY);
  } catch {
    // ignore
  }
}
