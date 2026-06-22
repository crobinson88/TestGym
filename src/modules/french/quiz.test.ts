import { describe, expect, it } from "vitest";
import type { VocabWord } from "./data/vocab";
import type { RuleQuestion } from "./data/rules";
import {
  generateRulesTest,
  generateVocabTest,
  makeRuleQuestion,
  makeVocabQuestion,
  shuffle,
} from "./quiz";

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
