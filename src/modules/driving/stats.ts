import type { DrivingAttemptRow } from "@/lib/database.types";
import type { QuestionSection } from "./data/sections";
import { passed } from "./quiz";

// Pull the section key out of a question id (`signs:stop-shape` → `signs`). Returns
// null if the prefix is not a recognised section.
const SECTION_KEYS: readonly QuestionSection[] = [
  "signs",
  "rules",
  "rightofway",
  "speed",
  "parking",
  "safety",
  "alcohol",
  "emergencies",
];

export function sectionFromQuestionId(questionId: string): QuestionSection | null {
  const prefix = questionId.split(":")[0];
  return (SECTION_KEYS as readonly string[]).includes(prefix)
    ? (prefix as QuestionSection)
    : null;
}

export interface SectionStat {
  section: QuestionSection;
  questions: number; // total questions of this section ever answered
  correct: number;
  accuracy: number; // 0..1
}

export interface MissedItem {
  questionId: string;
  prompt: string;
  seen: number;
  wrong: number;
}

export interface DrivingStats {
  totalTests: number;
  questions: number; // total questions answered across every test
  correct: number;
  accuracy: number; // 0..1 across every question
  bestAccuracy: number; // best single completed test
  passes: number; // completed tests that met the pass mark
  lastAt: string | null;
  recent: DrivingAttemptRow[];
  missed: MissedItem[];
  bySection: Record<QuestionSection, SectionStat>;
}

function emptySection(section: QuestionSection): SectionStat {
  return { section, questions: 0, correct: 0, accuracy: 0 };
}

// Aggregate completed attempts into headline stats, per-section accuracy, and the
// most-missed individual questions (across every attempt's per-question detail).
export function computeStats(attempts: readonly DrivingAttemptRow[]): DrivingStats {
  const live = attempts
    .filter((a) => !a.deleted_at)
    .slice()
    .sort((a, b) => (a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0));

  const bySection: Record<QuestionSection, SectionStat> = {
    signs: emptySection("signs"),
    rules: emptySection("rules"),
    rightofway: emptySection("rightofway"),
    speed: emptySection("speed"),
    parking: emptySection("parking"),
    safety: emptySection("safety"),
    alcohol: emptySection("alcohol"),
    emergencies: emptySection("emergencies"),
  };

  const missedMap = new Map<string, MissedItem>();
  let questions = 0;
  let correct = 0;
  let bestAccuracy = 0;
  let passes = 0;
  let lastAt: string | null = null;

  for (const a of live) {
    questions += a.total;
    correct += a.correct;
    const acc = a.total > 0 ? a.correct / a.total : 0;
    if (acc > bestAccuracy) bestAccuracy = acc;
    if (passed(a.correct, a.total)) passes += 1;
    if (!lastAt || a.started_at > lastAt) lastAt = a.started_at;

    for (const d of a.details ?? []) {
      const sec = sectionFromQuestionId(d.questionId);
      if (sec) {
        const s = bySection[sec];
        s.questions += 1;
        if (d.correct) s.correct += 1;
      }
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

  for (const key of SECTION_KEYS) {
    const s = bySection[key];
    s.accuracy = s.questions > 0 ? s.correct / s.questions : 0;
  }

  const missed = [...missedMap.values()]
    .filter((m) => m.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || b.seen - a.seen)
    .slice(0, 10);

  return {
    totalTests: live.length,
    questions,
    correct,
    accuracy: questions > 0 ? correct / questions : 0,
    bestAccuracy,
    passes,
    lastAt,
    recent: live.slice(0, 10),
    missed,
    bySection,
  };
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
