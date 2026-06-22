import type { FrenchTestKind } from "@/lib/database.types";
import type { VocabWord } from "./data/vocab";
import type { RuleQuestion } from "./data/rules";
import type { Person, VerbConjugation } from "./data/conjugations";
import { ALLER, PERSONS, PRONOUN_LABEL } from "./data/conjugations";

export const TEST_SIZE = 10;

// Human label per test kind, for headings and the recent-tests list.
export const KIND_LABELS: Record<FrenchTestKind, string> = {
  vocab: "Vocab",
  rules: "Rules",
  conjug: "Conjugation",
};

export type Rng = () => number;

// A single rendered test question. Both vocab and rules questions reduce to this
// shape so the runner UI stays kind-agnostic.
export interface Question {
  id: string;
  prompt: string;
  sub: string;
  choices: string[];
  answer: number;
  explanation: string | null;
}

// fr2en = show the French word, pick the English. en2fr = the reverse.
// mixed = randomise per question.
export type VocabDirection = "fr2en" | "en2fr" | "mixed";

// choice = tap one of four options (the default). type = write the answer in,
// graded leniently (accents/case/punctuation ignored). Chosen before the test.
export type VocabAnswerMode = "choice" | "type";

// Normalise a string for typed-answer grading: strip accents, lowercase, drop
// parenthetical qualifiers ("(m)", "(negation)"), and collapse punctuation so
// only words and "/" alternative separators remain.
export function normalizeAnswer(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Accept a typed answer if it matches any "/"-separated alternative of the
// expected gloss. A leading "to " on verb glosses is optional ("take" ≡ "to take").
export function checkTypedAnswer(input: string, expected: string): boolean {
  const stripTo = (s: string) => s.replace(/^to /, "");
  const typed = normalizeAnswer(input);
  if (!typed) return false;
  return normalizeAnswer(expected)
    .split("/")
    .map((v) => v.trim())
    .filter(Boolean)
    .some((v) => v === typed || stripTo(v) === stripTo(typed));
}

export interface GenerateOptions {
  count?: number;
  rng?: Rng;
  direction?: VocabDirection;
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

// Build a choice set: the correct value plus up to `n-1` unique distractors.
function buildChoices(
  correct: string,
  distractorPool: readonly string[],
  n: number,
  rng: Rng,
): { choices: string[]; answer: number } {
  const seen = new Set([correct.toLowerCase()]);
  const distractors: string[] = [];
  for (const d of shuffle(distractorPool, rng)) {
    const key = d.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    distractors.push(d);
    if (distractors.length >= n - 1) break;
  }
  const choices = shuffle([correct, ...distractors], rng);
  return { choices, answer: choices.indexOf(correct) };
}

type Direction = "fr2en" | "en2fr";

export function makeVocabQuestion(
  word: VocabWord,
  pool: readonly VocabWord[],
  rng: Rng,
  direction: Direction = rng() < 0.5 ? "fr2en" : "en2fr",
): Question {
  const others = pool.filter((w) => w.fr !== word.fr);
  if (direction === "fr2en") {
    const { choices, answer } = buildChoices(
      word.en,
      others.map((w) => w.en),
      4,
      rng,
    );
    return {
      id: `vocab:${word.fr}:fr2en`,
      prompt: word.fr,
      sub: "What does this mean?",
      choices,
      answer,
      explanation: `${word.fr} = ${word.en}`,
    };
  }
  const { choices, answer } = buildChoices(
    word.fr,
    others.map((w) => w.fr),
    4,
    rng,
  );
  return {
    id: `vocab:${word.fr}:en2fr`,
    prompt: word.en,
    sub: "Which is the French?",
    choices,
    answer,
    explanation: `${word.en} = ${word.fr}`,
  };
}

export function generateVocabTest(
  pool: readonly VocabWord[],
  { count = TEST_SIZE, rng = Math.random, direction = "mixed" }: GenerateOptions = {},
): Question[] {
  return sample(pool, count, rng).map((w) => {
    const dir: Direction = direction === "mixed" ? (rng() < 0.5 ? "fr2en" : "en2fr") : direction;
    return makeVocabQuestion(w, pool, rng, dir);
  });
}

export function makeRuleQuestion(rule: RuleQuestion, rng: Rng): Question {
  const correct = rule.choices[rule.answer];
  const shuffled = shuffle(rule.choices, rng);
  return {
    id: rule.id,
    prompt: rule.prompt,
    sub: rule.topic,
    choices: shuffled,
    answer: shuffled.indexOf(correct),
    explanation: rule.explanation,
  };
}

export function generateRulesTest(
  pool: readonly RuleQuestion[],
  { count = TEST_SIZE, rng = Math.random }: GenerateOptions = {},
): Question[] {
  return sample(pool, count, rng).map((r) => makeRuleQuestion(r, rng));
}

// present = je suis, nous sommes …; futurProche = the near future "going to …",
// built as aller (present) + infinitive (je vais être, nous allons être …).
export type ConjTense = "present" | "futurProche";

export interface ConjGenerateOptions {
  count?: number;
  rng?: Rng;
  tenses?: ConjTense[];
}

// Render a conjugated form with its subject pronoun, eliding je → j' before a
// vowel/silent-h (j'ai). Used in explanations only; the choices stay bare forms.
function withPronoun(person: Person, form: string): string {
  if (person === "je" && /^[aeiouâäéèêëïîôûh]/i.test(form)) return `j'${form}`;
  return `${PRONOUN_LABEL[person]} ${form}`;
}

// The near-future phrase for a verb at a person: aller (present) + infinitive.
function futurProcheForm(verb: VerbConjugation, person: Person): string {
  return `${ALLER.present[person]} ${verb.infinitive}`;
}

export function makeConjugationQuestion(
  verb: VerbConjugation,
  tense: ConjTense,
  person: Person,
  rng: Rng,
): Question {
  if (tense === "present") {
    const correct = verb.present[person];
    const pool = PERSONS.filter((p) => p !== person).map((p) => verb.present[p]);
    const { choices, answer } = buildChoices(correct, pool, 4, rng);
    return {
      id: `conjug:${verb.infinitive}:present:${person}`,
      prompt: `${verb.infinitive} — ${PRONOUN_LABEL[person]}`,
      sub: "Present tense",
      choices,
      answer,
      explanation: `${withPronoun(person, correct)} — ${verb.infinitive} (${verb.en}), present tense.`,
    };
  }
  const correct = futurProcheForm(verb, person);
  const pool = PERSONS.filter((p) => p !== person).map((p) => futurProcheForm(verb, p));
  const { choices, answer } = buildChoices(correct, pool, 4, rng);
  return {
    id: `conjug:${verb.infinitive}:futurProche:${person}`,
    prompt: `${verb.infinitive} — ${PRONOUN_LABEL[person]} (near future)`,
    sub: "Near future · going to",
    choices,
    answer,
    explanation: `${withPronoun(person, correct)} — aller (present) + infinitive = "going to ${verb.en.replace(/^to /, "")}".`,
  };
}

export function generateConjugationTest(
  verbs: readonly VerbConjugation[],
  { count = TEST_SIZE, rng = Math.random, tenses = ["present", "futurProche"] }: ConjGenerateOptions = {},
): Question[] {
  const combos: { verb: VerbConjugation; tense: ConjTense; person: Person }[] = [];
  for (const verb of verbs) {
    for (const tense of tenses) {
      for (const person of PERSONS) combos.push({ verb, tense, person });
    }
  }
  return sample(combos, count, rng).map((c) =>
    makeConjugationQuestion(c.verb, c.tense, c.person, rng),
  );
}

export function generateTest(
  kind: FrenchTestKind,
  vocab: readonly VocabWord[],
  rules: readonly RuleQuestion[],
  conjugations: readonly VerbConjugation[],
  opts: GenerateOptions = {},
): Question[] {
  if (kind === "vocab") return generateVocabTest(vocab, opts);
  if (kind === "rules") return generateRulesTest(rules, opts);
  return generateConjugationTest(conjugations, { count: opts.count, rng: opts.rng });
}
