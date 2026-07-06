import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { addDays, todayIsoDate, weekStart } from "@/lib/utils";
import {
  computeListeningSchedules,
  computeStats,
  computeVocabHistory,
  computeVocabSchedules,
  dueForReview,
  masteredVocab,
  vocabMastery,
  vocabMasteryProgress,
  weeklyAccuracy,
} from "./stats";
import { VOCAB } from "./data/vocab";

export function useFrenchAttempts() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return all
      .filter((a) => !a.deleted_at)
      .sort((a, b) =>
        a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0,
      );
  }, []);
}

export function useFrenchStats() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return computeStats(all);
  }, []);
}

export function useVocabHistory() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return computeVocabHistory(all);
  }, []);
}

// Spaced-repetition schedule per word, driving which words a vocab test resurfaces.
export function useVocabSchedules() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return computeVocabSchedules(all);
  }, []);
}

// Count of words due for review today, for the "due for review" hint on the home
// screen. Undefined until the attempts load.
export function useVocabDueCount() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return dueForReview(computeVocabSchedules(all), todayIsoDate());
  }, []);
}

// The mastered-word pool the listening test draws from — only words already
// mastered in the written vocab tests. Undefined until the attempts load.
export function useMasteredVocab() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return masteredVocab(all, VOCAB);
  }, []);
}

// Listening test's own spaced-repetition schedule (independent of vocab).
export function useListeningSchedules() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return computeListeningSchedules(all);
  }, []);
}

// Words due for review in the listening queue today.
export function useListeningDueCount() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return dueForReview(computeListeningSchedules(all), todayIsoDate());
  }, []);
}

function lastWeekStarts(weeks: number): string[] {
  const thisWeekStart = weekStart(todayIsoDate());
  const starts: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) starts.push(addDays(thisWeekStart, -i * 7));
  return starts;
}

export function useFrenchWeeklyAccuracy(weeks = 8) {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return weeklyAccuracy(all, lastWeekStarts(weeks));
  }, [weeks]);
}

export function useVocabMastery() {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return vocabMastery(all, VOCAB.length);
  }, []);
}

export function useVocabMasteryProgress(weeks = 8) {
  return useLiveQuery(async () => {
    const all = await db.french_attempts.toArray();
    return vocabMasteryProgress(all, lastWeekStarts(weeks), VOCAB.length);
  }, [weeks]);
}
