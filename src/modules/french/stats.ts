import type { FrenchAttemptRow, FrenchTestKind } from "@/lib/database.types";
import { addDays, weekStart } from "@/lib/utils";
import type { VocabWord } from "./data/vocab";

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

const KINDS: FrenchTestKind[] = ["vocab", "rules", "conjug", "listening"];

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
    conjug: emptyKind("conjug"),
    listening: emptyKind("listening"),
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

// Pull the French word out of a listening questionId (`listen:{fr}`). Returns null
// for any other id.
export function listenKeyFromQuestionId(questionId: string): string | null {
  const parts = questionId.split(":");
  if (parts[0] !== "listen" || parts.length < 2) return null;
  return parts.slice(1).join(":");
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

// A word counts as "mastered" once it's been answered correctly more than 90% of
// the times it's been shown — but only after enough showings that the rate means
// something (a single lucky hit shouldn't count).
export const VOCAB_MASTERY_THRESHOLD = 0.9;
export const VOCAB_MASTERY_MIN_SEEN = 3;

export function isMastered(h: VocabWordHistory): boolean {
  return h.seen >= VOCAB_MASTERY_MIN_SEEN && h.correct / h.seen > VOCAB_MASTERY_THRESHOLD;
}

// The subset of the study list the learner has mastered in the written vocab tests,
// as full VocabWord records. This is the pool the listening test draws from, so you
// only ever hear words you can already read. Preserves the pool's (rank) order.
export function masteredVocab(
  attempts: readonly FrenchAttemptRow[],
  pool: readonly VocabWord[],
): VocabWord[] {
  const hist = computeVocabHistory(attempts);
  return pool.filter((w) => {
    const h = hist.get(w.fr);
    return h ? isMastered(h) : false;
  });
}

// Days until a word in each Leitner box is due for review again. A just-missed word
// (box 0) resurfaces the same day; each subsequent correct answer climbs a box and
// widens the gap, so a firmly-known word reappears rarely while a forgotten one
// comes straight back. The last entry caps the interval.
export const REVIEW_INTERVALS_DAYS = [0, 1, 3, 7, 16, 35] as const;
const MAX_BOX = REVIEW_INTERVALS_DAYS.length - 1;

export function reviewIntervalDays(box: number): number {
  return REVIEW_INTERVALS_DAYS[Math.max(0, Math.min(box, MAX_BOX))];
}

// A word's spaced-repetition state, reconstructed by replaying its showings in
// order. `box` is the current recall streak (correct answers since the last miss):
// it climbs one per correct answer and resets to 0 on any miss, so it reflects how
// firmly the word is held *right now*, not its lifetime rate. `dueOn` is when the
// word next wants reviewing; `mastered` is the lifetime bar the Dashboard tracks.
export interface VocabSchedule {
  fr: string;
  seen: number;
  correct: number;
  box: number;
  lastShownAt: string; // date (YYYY-MM-DD) of the most recent showing
  dueOn: string; // date the word next becomes due for review
  mastered: boolean;
}

// Build a per-word review schedule by replaying every matching attempt's question
// detail oldest-first, so each Leitner box reflects the latest streak. Parameterised
// on the kind + questionId parser so vocab and listening keep independent histories.
function computeSchedules(
  attempts: readonly FrenchAttemptRow[],
  kind: FrenchTestKind,
  keyOf: (questionId: string) => string | null,
): Map<string, VocabSchedule> {
  const ordered = attempts
    .filter((a) => !a.deleted_at && a.kind === kind)
    .slice()
    .sort((a, b) => (a.started_at < b.started_at ? -1 : a.started_at > b.started_at ? 1 : 0));

  const map = new Map<string, VocabSchedule>();
  for (const a of ordered) {
    const day = a.started_at.slice(0, 10);
    for (const d of a.details ?? []) {
      const key = keyOf(d.questionId);
      if (!key) continue;
      const s =
        map.get(key) ??
        { fr: key, seen: 0, correct: 0, box: 0, lastShownAt: day, dueOn: day, mastered: false };
      s.seen += 1;
      if (d.correct) {
        s.correct += 1;
        s.box = Math.min(s.box + 1, MAX_BOX);
      } else {
        s.box = 0;
      }
      s.lastShownAt = day;
      s.dueOn = addDays(day, reviewIntervalDays(s.box));
      s.mastered = isMastered({ seen: s.seen, correct: s.correct, lastShownAt: day });
      map.set(key, s);
    }
  }
  return map;
}

// Spaced-repetition schedule from the written vocab tests.
export function computeVocabSchedules(
  attempts: readonly FrenchAttemptRow[],
): Map<string, VocabSchedule> {
  return computeSchedules(attempts, "vocab", vocabKeyFromQuestionId);
}

// Spaced-repetition schedule from the listening tests — kept separate from vocab so
// hearing a word and reading it build independent review queues.
export function computeListeningSchedules(
  attempts: readonly FrenchAttemptRow[],
): Map<string, VocabSchedule> {
  return computeSchedules(attempts, "listening", listenKeyFromQuestionId);
}

// How many seen words are due for review on or before `now` — the backlog a vocab
// test clears before introducing new words. A mastered word that has slipped (box
// reset to 0, due today) counts: a wrong answer always pulls a word back in.
export function dueForReview(schedules: Map<string, VocabSchedule>, now: string): number {
  let n = 0;
  for (const s of schedules.values()) if (s.dueOn <= now) n += 1;
  return n;
}

export interface VocabMastery {
  total: number; // size of the study list (top N)
  attempted: number; // distinct words shown at least once
  mastered: number; // distinct words clearing the mastery bar
  pct: number; // mastered / total, 0..100
}

// Mastery snapshot across the whole study list.
export function vocabMastery(
  attempts: readonly FrenchAttemptRow[],
  total: number,
): VocabMastery {
  const hist = computeVocabHistory(attempts);
  let attempted = 0;
  let mastered = 0;
  for (const h of hist.values()) {
    if (h.seen > 0) attempted += 1;
    if (isMastered(h)) mastered += 1;
  }
  return {
    total,
    attempted,
    mastered,
    pct: total > 0 ? Math.round((mastered / total) * 100) : 0,
  };
}

export interface MasteryPoint {
  week_start: string;
  mastered: number;
  pct: number; // mastered words as a 0..100 % of the whole study list
}

// Cumulative mastery as of the end of each (Mon–Sun) week, so the chart shows
// progress toward mastering the whole list. Recomputed from scratch per week, so
// a word slipping back below the bar correctly lowers the line.
export function vocabMasteryProgress(
  attempts: readonly FrenchAttemptRow[],
  weekStarts: readonly string[],
  total: number,
): MasteryPoint[] {
  return weekStarts.map((ws) => {
    const cutoff = addDays(ws, 6); // inclusive Sunday of this week
    const upto = attempts.filter((a) => a.started_at.slice(0, 10) <= cutoff);
    const m = vocabMastery(upto, total);
    return { week_start: ws, mastered: m.mastered, pct: m.pct };
  });
}

// One week's accuracy per kind, as a 0..100 percentage. `null` means no test of
// that kind was taken that week, so the chart can leave a gap instead of a zero.
export interface WeekAccuracyPoint {
  week_start: string;
  vocab: number | null;
  rules: number | null;
  conjug: number | null;
  listening: number | null;
}

// Bucket attempts into the supplied (chronological) week starts and compute
// per-kind accuracy weighted across every question answered that week.
export function weeklyAccuracy(
  attempts: readonly FrenchAttemptRow[],
  weekStarts: readonly string[],
): WeekAccuracyPoint[] {
  const buckets = new Map<string, Record<FrenchTestKind, { correct: number; total: number }>>();
  for (const ws of weekStarts) {
    buckets.set(ws, {
      vocab: { correct: 0, total: 0 },
      rules: { correct: 0, total: 0 },
      conjug: { correct: 0, total: 0 },
      listening: { correct: 0, total: 0 },
    });
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
    return {
      week_start: ws,
      vocab: rate(b.vocab),
      rules: rate(b.rules),
      conjug: rate(b.conjug),
      listening: rate(b.listening),
    };
  });
}
