import { describe, expect, it } from "vitest";
import type { VocabWord } from "./data/vocab";
import type { RuleQuestion } from "./data/rules";
import {
  checkTypedAnswer,
  clampCount,
  generateConjugationTest,
  generateListeningTest,
  generateRulesTest,
  generateTest,
  generateVocabTest,
  makeConjugationQuestion,
  makeListeningQuestion,
  makeRuleQuestion,
  makeVocabQuestion,
  normalizeAnswer,
  selectVocab,
  shuffle,
  speedRate,
} from "./quiz";
import { CONJ_VERBS } from "./data/conjugations";
import type { VocabSchedule } from "./stats";

// Deterministic LCG so tests are reproducible.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const VOCAB: VocabWord[] = [
  { rank: 1, fr: "être", en: "to be", pos: "verb" },
  { rank: 2, fr: "avoir", en: "to have", pos: "verb" },
  { rank: 3, fr: "le chien", en: "dog", pos: "noun", gender: "m" },
  { rank: 4, fr: "la maison", en: "house", pos: "noun", gender: "f" },
  { rank: 5, fr: "grand", en: "big", pos: "adjective" },
  { rank: 6, fr: "vite", en: "fast", pos: "adverb" },
];

const RULES: RuleQuestion[] = [
  {
    id: "r1",
    topic: "Negation",
    prompt: "Make negative: Je mange.",
    choices: ["Je ne mange pas.", "Je mange ne pas.", "Je pas mange."],
    answer: 0,
    explanation: "ne + verb + pas.",
  },
  {
    id: "r2",
    topic: "Avoir",
    prompt: "I am 25:",
    choices: ["Je suis 25 ans.", "J'ai 25 ans.", "Je 25 ans."],
    answer: 1,
    explanation: "Age uses avoir.",
  },
];

describe("shuffle", () => {
  it("is a permutation (same multiset)", () => {
    const rng = lcg(42);
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, rng);
    expect(out.slice().sort()).toEqual(input.slice().sort());
    expect(out).not.toBe(input);
  });
});

describe("makeVocabQuestion", () => {
  it("fr2en puts the correct gloss at the answer index", () => {
    const rng = lcg(1);
    const q = makeVocabQuestion(VOCAB[2], VOCAB, rng, "fr2en");
    expect(q.prompt).toBe("le chien");
    expect(q.choices[q.answer]).toBe("dog");
    expect(q.choices).toHaveLength(4);
    expect(new Set(q.choices).size).toBe(4); // no duplicate choices
  });

  it("en2fr puts the correct French at the answer index", () => {
    const rng = lcg(2);
    const q = makeVocabQuestion(VOCAB[0], VOCAB, rng, "en2fr");
    expect(q.prompt).toBe("to be");
    expect(q.choices[q.answer]).toBe("être");
  });

  it("never offers the prompted word as its own distractor", () => {
    const rng = lcg(3);
    const q = makeVocabQuestion(VOCAB[3], VOCAB, rng, "fr2en");
    expect(q.choices.filter((c) => c === "house")).toHaveLength(1);
  });
});

describe("generateVocabTest", () => {
  it("returns the requested count with valid answer indices", () => {
    const test = generateVocabTest(VOCAB, { count: 5, rng: lcg(7) });
    expect(test).toHaveLength(5);
    for (const q of test) {
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
    }
  });

  it("caps at the pool size", () => {
    const test = generateVocabTest(VOCAB, { count: 100, rng: lcg(8) });
    expect(test).toHaveLength(VOCAB.length);
  });

  it("direction fr2en asks for the English of every question", () => {
    const test = generateVocabTest(VOCAB, { count: 6, rng: lcg(11), direction: "fr2en" });
    expect(test.every((q) => q.sub === "What does this mean?")).toBe(true);
    expect(test.every((q) => VOCAB.some((w) => w.fr === q.prompt))).toBe(true);
  });

  it("direction en2fr asks for the French of every question", () => {
    const test = generateVocabTest(VOCAB, { count: 6, rng: lcg(12), direction: "en2fr" });
    expect(test.every((q) => q.sub === "Which is the French?")).toBe(true);
    expect(test.every((q) => VOCAB.some((w) => w.en === q.prompt))).toBe(true);
  });
});

const NOW = "2026-06-10";
const sched = (over: Partial<VocabSchedule> & { fr: string }): VocabSchedule => ({
  seen: 1,
  correct: 0,
  box: 0,
  lastShownAt: "2026-06-01",
  dueOn: "2026-06-01",
  mastered: false,
  ...over,
});

describe("selectVocab", () => {
  it("puts due words ahead of brand-new ones", () => {
    const schedules = new Map([["être", sched({ fr: "être", dueOn: "2026-06-09" })]]);
    const out = selectVocab(VOCAB, 3, lcg(1), schedules, NOW);
    expect(out).toHaveLength(3);
    expect(out[0].fr).toBe("être"); // due word resurfaces first
  });

  it("orders the most-lapsed (lowest box) due word first", () => {
    const schedules = new Map([
      ["être", sched({ fr: "être", box: 0, dueOn: "2026-06-08" })],
      ["avoir", sched({ fr: "avoir", box: 2, dueOn: "2026-06-01" })], // more overdue but better known
    ]);
    const out = selectVocab(VOCAB, 6, lcg(2), schedules, NOW);
    expect(out[0].fr).toBe("être"); // box 0 beats box 2
    expect(out[1].fr).toBe("avoir");
  });

  it("puts a just-missed word at the top of the queue, ahead of older misses", () => {
    const schedules = new Map([
      // both reset to box 0 by a wrong answer, but être was missed today
      ["avoir", sched({ fr: "avoir", box: 0, dueOn: "2026-06-05", lastShownAt: "2026-06-04" })],
      ["être", sched({ fr: "être", box: 0, dueOn: NOW, lastShownAt: NOW })],
    ]);
    const out = selectVocab(VOCAB, 6, lcg(9), schedules, NOW);
    expect(out[0].fr).toBe("être"); // freshest miss leads, despite being least overdue
    expect(out[1].fr).toBe("avoir");
  });

  it("sinks mastered (not-due) words to the back of the queue", () => {
    const schedules = new Map([
      ["avoir", sched({ fr: "avoir", dueOn: "2026-06-09" })],
      ["être", sched({ fr: "être", box: 5, dueOn: "2026-07-01", mastered: true })],
    ]);
    const out = selectVocab(VOCAB, 6, lcg(3), schedules, NOW);
    expect(out[0].fr).toBe("avoir"); // the due word leads
    expect(out[out.length - 1].fr).toBe("être"); // mastered word last
  });

  it("falls back to a plain sample and respects count + pool cap with no history", () => {
    const empty = new Map<string, VocabSchedule>();
    expect(selectVocab(VOCAB, 100, lcg(4), empty, NOW)).toHaveLength(VOCAB.length);
    expect(selectVocab(VOCAB, 3, lcg(4), empty, NOW)).toHaveLength(3);
  });

  it("mixes new words in even when the review backlog could fill the test", () => {
    // Every word but one is due — the whole test could be reviews. The remaining
    // word (whichever is left unscheduled) must still get a slot.
    const due = VOCAB.slice(0, VOCAB.length - 1);
    const schedules = new Map(
      due.map((w) => [w.fr, sched({ fr: w.fr, dueOn: "2026-06-09" })] as const),
    );
    const out = selectVocab(VOCAB, 4, lcg(7), schedules, NOW);
    expect(out).toHaveLength(4);
    const newWords = out.filter((w) => !schedules.has(w.fr));
    expect(newWords.length).toBeGreaterThan(0); // a brand-new word made the cut
    expect(out.some((w) => schedules.has(w.fr))).toBe(true); // reviews still lead
  });

  it("uses every due review when there's no new word to reserve a slot for", () => {
    // All six words are due and scheduled, so nothing is "new" — the reservation
    // collapses and the test is pure review.
    const schedules = new Map(
      VOCAB.map((w) => [w.fr, sched({ fr: w.fr, dueOn: "2026-06-09" })] as const),
    );
    const out = selectVocab(VOCAB, 4, lcg(8), schedules, NOW);
    expect(out).toHaveLength(4);
    expect(out.every((w) => schedules.has(w.fr))).toBe(true);
  });
});

describe("generateVocabTest with a schedule", () => {
  it("resurfaces a due word for testing", () => {
    const schedules = new Map([["le chien", sched({ fr: "le chien", dueOn: "2026-06-09" })]]);
    const test = generateVocabTest(VOCAB, { count: 1, rng: lcg(5), schedules, now: NOW });
    expect(test).toHaveLength(1);
    expect(test[0].id.startsWith("vocab:le chien:")).toBe(true);
  });
});

describe("normalizeAnswer", () => {
  it("strips accents and lowercases", () => {
    expect(normalizeAnswer("Être")).toBe("etre");
    expect(normalizeAnswer("garçon")).toBe("garcon");
    expect(normalizeAnswer("À")).toBe("a");
  });

  it("drops parenthetical qualifiers and punctuation", () => {
    expect(normalizeAnswer("the (m)")).toBe("the");
    expect(normalizeAnswer("not (negation)")).toBe("not");
  });
});

describe("checkTypedAnswer", () => {
  it("ignores accents and case", () => {
    expect(checkTypedAnswer("etre", "être")).toBe(true);
    expect(checkTypedAnswer("ÊTRE", "être")).toBe(true);
    expect(checkTypedAnswer("garcon", "garçon")).toBe(true);
  });

  it("accepts any slash-separated alternative", () => {
    expect(checkTypedAnswer("make", "to make/do")).toBe(true);
    expect(checkTypedAnswer("do", "to make/do")).toBe(true);
    expect(checkTypedAnswer("of", "of/from")).toBe(true);
  });

  it("treats a leading 'to ' on verbs as optional", () => {
    expect(checkTypedAnswer("take", "to take")).toBe(true);
    expect(checkTypedAnswer("to take", "to take")).toBe(true);
  });

  it("ignores parenthetical qualifiers in the expected gloss", () => {
    expect(checkTypedAnswer("the", "the (m)")).toBe(true);
  });

  it("rejects wrong answers and blank input", () => {
    expect(checkTypedAnswer("house", "dog")).toBe(false);
    expect(checkTypedAnswer("", "dog")).toBe(false);
    expect(checkTypedAnswer("   ", "dog")).toBe(false);
  });
});

describe("listening test", () => {
  it("makes an audio-prompted question with four French choices", () => {
    const word = VOCAB[0]; // être
    const q = makeListeningQuestion(word, VOCAB, lcg(1));
    expect(q.id).toBe("listen:être");
    expect(q.audioText).toBe("être"); // the word is spoken, not shown
    expect(q.choices).toHaveLength(4);
    expect(q.choices[q.answer]).toBe("être");
    expect(q.choices.every((c) => VOCAB.some((w) => w.fr === c))).toBe(true); // French choices
    expect(q.sub).toBe("Which word did you hear?");
  });

  it("generateTest('listening') produces audio questions of the requested count", () => {
    const test = generateTest("listening", VOCAB, RULES, CONJ_VERBS, { count: 4, rng: lcg(3) });
    expect(test).toHaveLength(4);
    expect(test.every((q) => q.audioText && q.id.startsWith("listen:"))).toBe(true);
  });

  it("uses the spaced-repetition schedule when one is supplied", () => {
    const schedules = new Map([["avoir", sched({ fr: "avoir", dueOn: "2026-06-09" })]]);
    const test = generateListeningTest(VOCAB, { count: 1, rng: lcg(5), schedules, now: NOW });
    expect(test).toHaveLength(1);
    expect(test[0].id).toBe("listen:avoir"); // the due word resurfaces
  });
});

describe("speedRate", () => {
  it("maps speed keys to utterance rates and defaults to normal", () => {
    expect(speedRate("normal")).toBe(1);
    expect(speedRate("slow")).toBe(0.7);
    expect(speedRate("very-slow")).toBe(0.5);
    expect(speedRate(null)).toBe(1);
    expect(speedRate("bogus")).toBe(1);
  });
});

describe("makeConjugationQuestion", () => {
  const etre = CONJ_VERBS.find((v) => v.infinitive === "être")!;
  const faire = CONJ_VERBS.find((v) => v.infinitive === "faire")!;

  it("present puts the bare conjugated form at the answer index", () => {
    const q = makeConjugationQuestion(etre, "present", "nous", lcg(1));
    expect(q.id).toBe("conjug:être:present:nous");
    expect(q.choices[q.answer]).toBe("sommes");
    expect(q.sub).toBe("Present tense");
    expect(q.choices).toHaveLength(4);
    expect(new Set(q.choices).size).toBe(4); // no duplicate choices
  });

  it("futur proche answers with aller (present) + infinitive", () => {
    const q = makeConjugationQuestion(faire, "futurProche", "je", lcg(2));
    expect(q.id).toBe("conjug:faire:futurProche:je");
    expect(q.choices[q.answer]).toBe("vais faire");
    expect(q.choices.every((c) => c.endsWith(" faire"))).toBe(true);
  });
});

describe("clampCount", () => {
  it("defaults a missing/invalid count to the standard size", () => {
    expect(clampCount(null)).toBe(10);
    expect(clampCount(NaN)).toBe(10);
    expect(clampCount(0)).toBe(10);
  });

  it("keeps valid counts and floors fractions", () => {
    expect(clampCount(5)).toBe(5);
    expect(clampCount(20)).toBe(20);
    expect(clampCount(12.9)).toBe(12);
  });

  it("clamps to the guard-rail bounds", () => {
    expect(clampCount(-3)).toBe(1);
    expect(clampCount(999)).toBe(50);
  });
});

describe("generateConjugationTest", () => {
  it("respects a custom count", () => {
    const test = generateConjugationTest(CONJ_VERBS, { count: 15, rng: lcg(4) });
    expect(test).toHaveLength(15);
  });

  it("returns the requested count with valid answer indices and conjug ids", () => {
    const test = generateConjugationTest(CONJ_VERBS, { count: 10, rng: lcg(5) });
    expect(test).toHaveLength(10);
    for (const q of test) {
      expect(q.id.startsWith("conjug:")).toBe(true);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
    }
  });

  it("limits to a single tense when asked", () => {
    const test = generateConjugationTest(CONJ_VERBS, { count: 8, rng: lcg(6), tenses: ["present"] });
    expect(test.every((q) => q.sub === "Present tense")).toBe(true);
  });
});

describe("rules", () => {
  it("keeps the correct answer correct after shuffling choices", () => {
    const rng = lcg(9);
    const q = makeRuleQuestion(RULES[1], rng);
    expect(q.choices[q.answer]).toBe("J'ai 25 ans.");
    expect(q.explanation).toBe("Age uses avoir.");
  });

  it("generateRulesTest preserves correctness across the test", () => {
    const test = generateRulesTest(RULES, { count: 2, rng: lcg(10) });
    expect(test).toHaveLength(2);
    const byId = new Map(RULES.map((r) => [r.id, r.choices[r.answer]]));
    for (const q of test) {
      expect(q.choices[q.answer]).toBe(byId.get(q.id));
    }
  });
});
