import type { DrivingSection } from "@/lib/database.types";
import type { DrivingQuestion } from "./data/questions";

// The real NYS permit test is 20 questions with a 70% pass mark (14 correct). The
// default here matches that; other lengths are offered for quicker or longer drills.
export const TEST_SIZE = 20;
export const TEST_SIZES = [10, 20, 30] as const;

// Fraction of questions you must get right to pass (NY DMV = 70%).
export const PASS_RATE = 0.7;

export function passed(correct: number, total: number): boolean {
  return total > 0 && correct / total >= PASS_RATE;
}

// Coerce a (possibly user-supplied) count into a sane test length. `generateTest`
// caps at the pool size, so the upper bound here is just a guard rail.
export function clampCount(n: number | null | undefined): number {
  if (!n || !Number.isFinite(n)) return TEST_SIZE;
  return Math.min(60, Math.max(1, Math.floor(n)));
}

export type Rng = () => number;

// A single rendered test question. Every driving question reduces to this shape so
// the runner UI stays section-agnostic (same idea as the French `Question`).
export interface Question {
  id: string;
  prompt: string;
  sub: string; // the section label, shown above the prompt
  choices: string[];
  answer: number; // 0-based index into (shuffled) choices
  explanation: string;
}

// Fisher-Yates, parameterised on the rng so tests are deterministic.
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sample<T>(items: readonly T[], n: number, rng: Rng): T[] {
  return shuffle(items, rng).slice(0, Math.min(n, items.length));
}

// Shuffle a question's answer options so the correct choice is not always in the
// same position, tracking where the correct answer lands.
export function makeQuestion(
  q: DrivingQuestion,
  sub: string,
  rng: Rng,
): Question {
  const correct = q.choices[q.answer];
  const choices = shuffle(q.choices, rng);
  return {
    id: q.id,
    prompt: q.prompt,
    sub,
    choices,
    answer: choices.indexOf(correct),
    explanation: q.explanation,
  };
}

export interface GenerateOptions {
  count?: number;
  rng?: Rng;
  // Restrict the pool to a single section. "all" (or omitted) mixes every section.
  section?: DrivingSection;
}

// Build a test: sample `count` questions from the pool (optionally filtered to one
// section) and shuffle each question's options. `labelOf` maps a question's section
// to the human label shown above the prompt.
export function generateTest(
  pool: readonly DrivingQuestion[],
  labelOf: (section: DrivingQuestion["section"]) => string,
  { count = TEST_SIZE, rng = Math.random, section = "all" }: GenerateOptions = {},
): Question[] {
  const filtered = section === "all" ? pool : pool.filter((q) => q.section === section);
  return sample(filtered, count, rng).map((q) => makeQuestion(q, labelOf(q.section), rng));
}
