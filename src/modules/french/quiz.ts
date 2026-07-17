import type { FrenchTestKind } from "@/lib/database.types";
import { todayIsoDate } from "@/lib/utils";
import type { VocabWord } from "./data/vocab";
import type { RuleQuestion } from "./data/rules";
import type { PronQuestion } from "./data/pronunciation";
import type { Person, VerbConjugation } from "./data/conjugations";
import { ALLER, PERSONS, PRONOUN_LABEL } from "./data/conjugations";
import type { VocabSchedule } from "./stats";

export const TEST_SIZE = 10;

// Selectable question counts offered on the French home screen.
export const TEST_SIZES = [5, 10, 15, 20] as const;

// Coerce a (possibly user-supplied) count into a sane test length. Generators
// cap at their pool size, so the upper bound here is just a guard rail.
export function clampCount(n: number | null | undefined): number {
  if (!n || !Number.isFinite(n)) return TEST_SIZE;
  return Math.min(50, Math.max(1, Math.floor(n)));
}

// Human label per test kind, for headings and the recent-tests list.
export const KIND_LABELS: Record<FrenchTestKind, string> = {
  vocab: "Vocab",
  rules: "Rules",
  conjug: "Conjugation",
  listening: "Listening",
  pronun: "Pronunciation",
  speak: "Speaking",
};

// Playback speeds offered for the listening test. `rate` is the SpeechSynthesis
// utterance rate (1 = normal); lower is slower for picking words out of speech.
export type ListeningSpeed = "normal" | "slow" | "very-slow";
export const LISTENING_SPEEDS: { value: ListeningSpeed; label: string; rate: number }[] = [
  { value: "normal", label: "Normal", rate: 1 },
  { value: "slow", label: "Slow", rate: 0.7 },
  { value: "very-slow", label: "Very slow", rate: 0.5 },
];

// Word counts offered for the listening test — includes a single-word option for
// a quick ear check, up to a longer run.
export const LISTENING_SIZES = [1, 5, 10, 20] as const;

// How many words each listening round speaks. 1 = the classic single-word drill
// (feeds the per-word spaced-repetition schedule); >1 strings that many words into
// a spoken phrase to practise picking words out of connected speech.
export const LISTENING_WORDS_PER_ROUND = [1, 2, 3, 4] as const;

// Coerce a (possibly user-supplied) words-per-round into the offered range,
// defaulting to a single word.
export function clampWordsPerRound(n: number | null | undefined): number {
  if (!n || !Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, Math.floor(n)));
}

// Map a (possibly missing) speed key to its utterance rate, defaulting to normal.
export function speedRate(speed: string | null | undefined): number {
  return LISTENING_SPEEDS.find((s) => s.value === speed)?.rate ?? 1;
}

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
  // When set, the prompt is spoken (French TTS) rather than shown as text — the
  // learner identifies the word by ear. The runner hides `prompt` until answered.
  audioText?: string;
  // When set, this is a word-assembly question: `choices` is a shuffled word bank
  // (the spoken words plus distractors) and the learner taps words to reproduce
  // `sequence` — the spoken words, in the order they were said. Correct only if the
  // built list matches `sequence` exactly. `answer` is unused for these.
  sequence?: string[];
  // An on-demand French word/phrase the learner can play (fr-FR TTS) while the
  // prompt stays visible: the example word on a pronunciation-rules question, or
  // the model pronunciation of a speaking-drill form. Unlike `audioText`, it does
  // NOT hide the prompt — it's a "hear it" aid, not an identify-by-ear cue.
  example?: string;
}

// fr2en = show the French word, pick the English. en2fr = the reverse.
// mixed = randomise per question.
export type VocabDirection = "fr2en" | "en2fr" | "mixed";

// choice = tap one of four options (the default). type = write the answer in,
// graded leniently (accents/case/punctuation ignored). Chosen before the test.
export type VocabAnswerMode = "choice" | "type";

// Which slice of the pool a spaced-repetition test draws from.
//   mixed  = the default blend of due reviews topped up with new words;
//   review = only words already due for review (no new words);
//   new    = only words never seen before (no reviews).
// Surfaced on the listening test so the learner can drill just their backlog or
// just fresh material.
export type StudyMode = "mixed" | "review" | "new";

export const STUDY_MODES: { value: StudyMode; label: string }[] = [
  { value: "mixed", label: "Mixed" },
  { value: "review", label: "Review" },
  { value: "new", label: "New" },
];

// Coerce a (possibly user-supplied) mode string to a StudyMode, defaulting to mixed.
export function clampStudyMode(s: string | null | undefined): StudyMode {
  return s === "review" || s === "new" ? s : "mixed";
}

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

// A word-assembly answer is correct only if the built word list reproduces the
// spoken sequence exactly — same words, same order.
export function checkOrder(built: readonly string[], sequence: readonly string[]): boolean {
  return built.length === sequence.length && built.every((w, i) => w === sequence[i]);
}

export interface GenerateOptions {
  count?: number;
  rng?: Rng;
  direction?: VocabDirection;
  // When supplied, vocab questions are drawn by spaced repetition (due/lapsed words
  // first) instead of uniformly at random. `now` (today's date) drives due-ness.
  schedules?: Map<string, VocabSchedule>;
  now?: string;
  // Listening only: words spoken per round. >1 builds multi-word phrase questions.
  wordsPerRound?: number;
  // Restrict spaced-repetition selection to due reviews only, or new words only.
  // Requires `schedules`; ignored by the plain-sample fallback. Defaults to mixed.
  mode?: StudyMode;
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

// Share of every test held open for brand-new words, so vocabulary keeps
// advancing even when the spaced-repetition backlog could fill the whole test on
// its own. The rest of the test goes to due reviews first; new words top up the
// remainder, so a test always mixes retesting with new material.
export const NEW_WORD_RATIO = 0.3;

// Pick which words a vocab test should cover using the review schedule, so wrong
// answers resurface at the optimal frequency until they stick, while new words
// keep coming. Each test reserves up to NEW_WORD_RATIO of its slots for brand-new
// words (when any remain) and gives the rest to reviews. Order of priority:
//   1. due/overdue words — soonest the most-lapsed (lowest box) first, so words
//      you keep missing come back every session until you get them right — but
//      capped so the new-word reservation survives a large backlog;
//   2. brand-new words — mixed in every session, not just once the backlog clears;
//   3. any due words beyond the cap — the rest of the review backlog;
//   4. words seen but not yet due — soonest-due first, as light extra practice;
//   5. mastered words — least-recently-seen, only to pad a tiny pool.
// Equal-priority words are shuffled (stable sort preserves the shuffle) so repeat
// sessions don't replay the same order. `now` is today's date for due-ness.
//
// `mode` narrows the selection: "review" keeps only words already due (backlog
// drill), "new" keeps only never-seen words, and "mixed" (the default) blends the
// two as described above.
export function selectVocab(
  pool: readonly VocabWord[],
  count: number,
  rng: Rng,
  schedules: Map<string, VocabSchedule>,
  now: string,
  mode: StudyMode = "mixed",
): VocabWord[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const due: { w: VocabWord; s: VocabSchedule }[] = [];
  const upcoming: { w: VocabWord; s: VocabSchedule }[] = [];
  const mastered: { w: VocabWord; s: VocabSchedule }[] = [];
  const fresh: VocabWord[] = [];

  for (const w of shuffle(pool, rng)) {
    const s = schedules.get(w.fr);
    if (!s) fresh.push(w);
    else if (s.dueOn <= now) due.push({ w, s });
    else if (s.mastered) mastered.push({ w, s });
    else upcoming.push({ w, s });
  }

  // Most-lapsed (lowest box) first; within a box, the most-recently-missed word
  // leads (lastShownAt desc) so a word you just got wrong jumps to the top of the
  // queue and gets retested in the very next test, then most-overdue as a final
  // tiebreaker.
  due.sort(
    (a, b) =>
      a.s.box - b.s.box || cmp(b.s.lastShownAt, a.s.lastShownAt) || cmp(a.s.dueOn, b.s.dueOn),
  );
  upcoming.sort((a, b) => cmp(a.s.dueOn, b.s.dueOn));
  mastered.sort((a, b) => cmp(a.s.lastShownAt, b.s.lastShownAt));

  const target = Math.min(count, pool.length);

  // Single-slice modes: hand back just the due backlog, or just fresh words.
  if (mode === "review") return due.map((x) => x.w).slice(0, target);
  if (mode === "new") return fresh.slice(0, target);

  // Reserve new-word slots only when there are new words to learn; cap the review
  // block so those slots survive a backlog that would otherwise fill the test.
  const newReserve = Math.min(fresh.length, Math.round(target * NEW_WORD_RATIO));
  // How many due reviews lead the test before new words; the rest of the backlog
  // (if any) trails the new words to fill out the remaining slots.
  const reviewLed = Math.min(due.length, target - newReserve);

  const dueWords = due.map((x) => x.w);
  const ordered = [
    ...dueWords.slice(0, reviewLed),
    ...fresh,
    ...dueWords.slice(reviewLed),
    ...upcoming.map((x) => x.w),
    ...mastered.map((x) => x.w),
  ];
  return ordered.slice(0, target);
}

export function generateVocabTest(
  pool: readonly VocabWord[],
  {
    count = TEST_SIZE,
    rng = Math.random,
    direction = "mixed",
    schedules,
    now,
    mode = "mixed",
  }: GenerateOptions = {},
): Question[] {
  const words = schedules
    ? selectVocab(pool, count, rng, schedules, now ?? todayIsoDate(), mode)
    : sample(pool, count, rng);
  return words.map((w) => {
    const dir: Direction = direction === "mixed" ? (rng() < 0.5 ? "fr2en" : "en2fr") : direction;
    return makeVocabQuestion(w, pool, rng, dir);
  });
}

// How many extra (wrong) words pad the word bank of a listening round, on top of
// the words actually spoken. A bigger bank makes picking the right words harder.
export const LISTENING_ORDER_DISTRACTORS = 4;

// A listening round: `words` are spoken in sequence (one word, or a short phrase)
// and the learner reproduces them by tapping from a shuffled word bank — the
// spoken words mixed with `LISTENING_ORDER_DISTRACTORS` decoys. They must pick the
// right words AND place them in the order heard (`sequence`), so identity is by
// ear and the prompt text stays hidden until answered.
//
// A single-word round keeps the `listen:` id prefix so it feeds the per-word
// spaced-repetition schedule; a multi-word round uses a `phrase:` prefix, kept out
// of that schedule (connected-speech practice, not the per-word drill).
export function makeListeningOrderingQuestion(
  words: readonly VocabWord[],
  pool: readonly VocabWord[],
  rng: Rng,
): Question {
  const n = words.length;
  const sequence = words.map((w) => w.fr);
  const phrase = sequence.join(" ");
  const gloss = words.map((w) => w.en).join(" · ");

  // Decoy words: distinct French words from the pool that aren't in the sequence.
  const used = new Set(sequence.map((s) => s.toLowerCase()));
  const distractors: string[] = [];
  for (const w of shuffle(pool, rng)) {
    const key = w.fr.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    distractors.push(w.fr);
    if (distractors.length >= LISTENING_ORDER_DISTRACTORS) break;
  }

  const single = n === 1;
  return {
    id: single ? `listen:${sequence[0]}` : `phrase:${phrase}`,
    prompt: phrase,
    sub: single ? "Tap the word you heard" : `Build the phrase you heard (${n} words)`,
    choices: shuffle([...sequence, ...distractors], rng),
    answer: 0, // unused — ordering questions grade against `sequence`
    sequence,
    explanation: single ? `${phrase} = ${gloss}` : `${phrase} — ${gloss}`,
    audioText: phrase,
  };
}

// An AI-generated French sentence for a multi-word listening round: the spoken
// text, its English gloss, and its words in spoken order (the sequence the learner
// rebuilds). Sentences are built server-side from the learner's mastered words.
export interface GeneratedSentence {
  fr: string;
  en: string;
  words: string[];
}

// Build a listening word-ordering question from a generated sentence. The learner
// rebuilds `sentence.words` in order from a bank of those words plus decoys drawn
// from `distractorPool` (their mastered vocabulary). Carries the `phrase:` id prefix
// so it stays out of the per-word spaced-repetition schedule, like any multi-word
// round.
export function makeSentenceQuestion(
  sentence: GeneratedSentence,
  distractorPool: readonly string[],
  rng: Rng,
): Question {
  const sequence = sentence.words;
  const used = new Set(sequence.map((s) => s.toLowerCase()));
  const distractors: string[] = [];
  for (const d of shuffle(distractorPool, rng)) {
    const key = d.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    distractors.push(d);
    if (distractors.length >= LISTENING_ORDER_DISTRACTORS) break;
  }
  return {
    id: `phrase:${sentence.fr}`,
    prompt: sentence.fr,
    sub: `Build the sentence you heard (${sequence.length} words)`,
    choices: shuffle([...sequence, ...distractors], rng),
    answer: 0, // unused — ordering questions grade against `sequence`
    sequence,
    explanation: `${sentence.fr} — ${sentence.en}`,
    audioText: sentence.fr,
  };
}

export function generateListeningTest(
  pool: readonly VocabWord[],
  {
    count = TEST_SIZE,
    rng = Math.random,
    schedules,
    now,
    wordsPerRound,
    mode = "mixed",
  }: GenerateOptions = {},
): Question[] {
  const perRound = clampWordsPerRound(wordsPerRound);
  const pick = (n: number) =>
    schedules ? selectVocab(pool, n, rng, schedules, now ?? todayIsoDate(), mode) : sample(pool, n, rng);

  if (perRound <= 1) {
    return pick(count).map((w) => makeListeningOrderingQuestion([w], pool, rng));
  }

  // Gather count × perRound words, then chunk them into one phrase per round.
  // A trailing partial chunk (only when the pool is smaller than requested) is
  // dropped so every round speaks a full-length phrase.
  const words = pick(count * perRound);
  const rounds: Question[] = [];
  for (let i = 0; i + perRound <= words.length; i += perRound) {
    rounds.push(makeListeningOrderingQuestion(words.slice(i, i + perRound), pool, rng));
  }
  return rounds;
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

// Pronunciation-rules questions are multiple choice like grammar rules, plus an
// optional `example` word the learner can play to hear the rule. The prompt text
// stays visible (this isn't identify-by-ear), so no `audioText`.
export function makePronunciationQuestion(q: PronQuestion, rng: Rng): Question {
  const correct = q.choices[q.answer];
  const shuffled = shuffle(q.choices, rng);
  return {
    id: q.id,
    prompt: q.prompt,
    sub: q.topic,
    choices: shuffled,
    answer: shuffled.indexOf(correct),
    explanation: q.explanation,
    example: q.example,
  };
}

export function generatePronunciationTest(
  pool: readonly PronQuestion[],
  { count = TEST_SIZE, rng = Math.random }: GenerateOptions = {},
): Question[] {
  return sample(pool, count, rng).map((q) => makePronunciationQuestion(q, rng));
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

// A single clean subject pronoun for the speaking drill (the written conjugation
// test shows "il/elle" and "ils/elles", but you can only pronounce one), eliding
// je → j' before a vowel/silent-h so the spoken form is natural.
const SPEAK_PRONOUN: Record<Person, string> = {
  je: "je",
  tu: "tu",
  il: "il",
  nous: "nous",
  vous: "vous",
  ils: "ils",
};

function speakingPhrase(person: Person, form: string): string {
  if (person === "je" && /^[aeiouâäéèêëïîôûh]/i.test(form)) return `j'${form}`;
  return `${SPEAK_PRONOUN[person]} ${form}`;
}

// A speaking-drill question: the learner reads the conjugated form, says it aloud,
// hears the model pronunciation (`example`), then self-marks. There are no choices
// — it's self-assessed, so `answer` is unused. `example` (not `audioText`) keeps
// the prompt visible: you pronounce what you read, then compare.
export function makeSpeakingQuestion(
  verb: VerbConjugation,
  tense: ConjTense,
  person: Person,
  _rng: Rng,
): Question {
  const form = tense === "present" ? verb.present[person] : futurProcheForm(verb, person);
  const phrase = speakingPhrase(person, form);
  const label = tense === "present" ? "present tense" : `going to ${verb.en.replace(/^to /, "")}`;
  return {
    id: `speak:${verb.infinitive}:${tense}:${person}`,
    prompt: phrase,
    sub: tense === "present" ? `${verb.infinitive} · present` : `${verb.infinitive} · near future`,
    choices: [],
    answer: 0,
    explanation: `${phrase} — ${verb.infinitive} (${verb.en}), ${label}.`,
    example: phrase,
  };
}

export function generateSpeakingTest(
  verbs: readonly VerbConjugation[],
  { count = TEST_SIZE, rng = Math.random, tenses = ["present", "futurProche"] }: ConjGenerateOptions = {},
): Question[] {
  const combos: { verb: VerbConjugation; tense: ConjTense; person: Person }[] = [];
  for (const verb of verbs) {
    for (const tense of tenses) {
      for (const person of PERSONS) combos.push({ verb, tense, person });
    }
  }
  return sample(combos, count, rng).map((c) => makeSpeakingQuestion(c.verb, c.tense, c.person, rng));
}

export function generateTest(
  kind: FrenchTestKind,
  vocab: readonly VocabWord[],
  rules: readonly RuleQuestion[],
  conjugations: readonly VerbConjugation[],
  pronunciation: readonly PronQuestion[],
  opts: GenerateOptions = {},
): Question[] {
  if (kind === "vocab") return generateVocabTest(vocab, opts);
  if (kind === "listening") return generateListeningTest(vocab, opts);
  if (kind === "rules") return generateRulesTest(rules, opts);
  if (kind === "pronun") return generatePronunciationTest(pronunciation, opts);
  if (kind === "speak") return generateSpeakingTest(conjugations, { count: opts.count, rng: opts.rng });
  return generateConjugationTest(conjugations, { count: opts.count, rng: opts.rng });
}
