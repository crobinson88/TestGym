import type { FrenchAttemptRow, FrenchTestKind } from "@/lib/database.types";
import { weekStart } from "@/lib/utils";

export interface KindStats {
  kind: FrenchTestKind;
  tests: number;
  questions: number;
  correct: number;
  accuracy: number; // 0..1 over all questions of this kind
  bestAccuracy: number; // best single completed test
  lastAt: string | null;
}

export interface MissedItem {
  questionId: string;
  prompt: string;
  seen: number;
  wrong: number;
}

export interface FrenchStats {
  byKind: Record<FrenchTestKind, KindStats>;
  totalTests: number;
  recent: FrenchAttemptRow[];
  missed: MissedItem[];
}

const KINDS: FrenchTestKind[] = ["vocab", "rules"];

function emptyKind(kind: FrenchTestKind): KindStats {
  return {
    kind,
    tests: 0,
    questions: 0,
    correct: 0,
    accuracy: 0,
    bestAccuracy: 0,
    lastAt: null,
  };
}

// Aggregate completed attempts into headline stats per kind plus the most-missed
// individual questions (across every attempt's per-question detail).
export function computeStats(attempts: readonly FrenchAttemptRow[]): FrenchStats {
  const live = attempts
    .filter((a) => !a.deleted_at)
    .slice()
    .sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0));

  const byKind: Record<FrenchTestKind, KindStats> = {
    vocab: emptyKind("vocab"),
    rules: emptyKind("rules"),
  };

  const missedMap = new Map<string, MissedItem>();

  for (const a of live) {
    const k = byKind[a.kind];
    if (!k) continue;
    k.tests += 1;
    k.questions += a.total;
    k.correct += a.correct;
    const acc = a.total > 0 ? a.correct / a.total : 0;
    if (acc > k.bestAccuracy) k.bestAccuracy = acc;
    if (!k.lastAt || a.started_at > k.lastAt) k.lastAt = a.started_at;

    for (const d of a.details ?? []) {
      const m = missedMap.get(d.questionId) ?? {
        questionId: d.questionId,
        prompt: d.prompt,
        seen: 0,
        wrong: 0,
      };
      m.seen += 1;
      if (!d.correct) m.wrong += 1;
      missedMap.set(d.questionId, m);
    }
  }

  for (const kind of KINDS) {
    const k = byKind[kind];
    k.accuracy = k.questions > 0 ? k.correct / k.questions : 0;
  }

  const missed = [...missedMap.values()]
    .filter((m) => m.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.seen - a.seen)
    .slice(0, 10);

  return {
    byKind,
    totalTests: live.length,
    recent: live.slice(0, 10),
    missed,
  };
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;

// Per-word recall history, keyed by the French word, aggregated across both test
// directions (a word is the same study item whether shown fr→en or en→fr).
export interface VocabWordHistory {
  seen: number;
  correct: number;
  lastShownAt: string | null; // attempt started_at of the most recent showing
}

// Pull the French word out of a vocab questionId (`vocab:{fr}:{direction}`). The
// word itself never contains a colon, but join the middle defensively. Returns
// null for non-vocab ids (e.g. rule questions).
export function vocabKeyFromQuestionId(questionId: string): string | null {
  const parts = questionId.split(":");
  if (parts[0] !== "vocab" || parts.length < 3) return null;
  return parts.slice(1, -1).join(":");
}

// Build a map of every vocab word the learner has been tested on, so a running
// test can flag each prompt as new or show its prior recall.
export function computeVocabHistory(
  attempts: readonly FrenchAttemptRow[],
): Map<string, VocabWordHistory> {
  const map = new Map<string, VocabWordHistory>();
  for (const a of attempts) {
    if (a.deleted_at || a.kind !== "vocab") continue;
    for (const d of a.details ?? []) {
      const key = vocabKeyFromQuestionId(d.questionId);
      if (!key) continue;
      const h = map.get(key) ?? { seen: 0, correct: 0, lastShownAt: null };
      h.seen += 1;
      if (d.correct) h.correct += 1;
      if (!h.lastShownAt || a.started_at > h.lastShownAt) h.lastShownAt = a.started_at;
      map.set(key, h);
    }
  }
  return map;
}

// One week's accuracy per kind, as a 0..100 percentage. `null` means no test of
// that kind was taken that week, so the chart can leave a gap instead of a zero.
export interface WeekAccuracyPoint {
  week_start: string;
  vocab: number | null;
  rules: number | null;
}

// Bucket attempts into the supplied (chronological) week starts and compute
// per-kind accuracy weighted across every question answered that week.
export function weeklyAccuracy(
  attempts: readonly FrenchAttemptRow[],
  weekStarts: readonly string[],
): WeekAccuracyPoint[] {
  const buckets = new Map<string, Record<FrenchTestKind, { correct: number; total: number }>>();
  for (const ws of weekStarts) {
    buckets.set(ws, { vocab: { correct: 0, total: 0 }, rules: { correct: 0, total: 0 } });
  }

  for (const a of attempts) {
    if (a.deleted_at) continue;
    const b = buckets.get(weekStart(a.started_at.slice(0, 10)));
    if (!b) continue;
    const acc = b[a.kind];
    if (!acc) continue;
    acc.correct += a.correct;
    acc.total += a.total;
  }

  const rate = (x: { correct: number; total: number }) =>
    x.total > 0 ? Math.round((x.correct / x.total) * 100) : null;

  return weekStarts.map((ws) => {
    const b = buckets.get(ws)!;
    return { week_start: ws, vocab: rate(b.vocab), rules: rate(b.rules) };
  });
}
