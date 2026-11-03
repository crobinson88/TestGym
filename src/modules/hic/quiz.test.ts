import { describe, expect, it } from "vitest";
import {
  clampCount,
  generateTest,
  makeQuestion,
  passed,
  PASS_RATE,
  sample,
  shuffle,
  TEST_SIZE,
} from "./quiz";
import { HIC_QUESTIONS } from "./data/questions";
import { sectionLabel, SECTIONS } from "./data/sections";
import type { HicQuestion } from "./data/questions";

// Deterministic LCG so tests are reproducible.
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const SAMPLE: HicQuestion = {
  id: "licensing:scope-99",
  section: "licensing",
  topic: "scope",
  difficulty: 3,
  guideRef: "Guide §I p.1",
  prompt: "Is painting one room alone a home improvement?",
  choices: ["Yes", "No", "Only over $200", "Only for co-ops"],
  answer: 1,
  explanation: "Painting or decorating alone is excluded.",
};

describe("clampCount", () => {
  it("defaults to TEST_SIZE for junk", () => {
    expect(clampCount(null)).toBe(TEST_SIZE);
    expect(clampCount(undefined)).toBe(TEST_SIZE);
    expect(clampCount(NaN)).toBe(TEST_SIZE);
    expect(clampCount(0)).toBe(TEST_SIZE);
  });
  it("clamps to the 1..60 range", () => {
    expect(clampCount(-5)).toBe(1);
    expect(clampCount(1000)).toBe(60);
    expect(clampCount(15)).toBe(15);
  });
});

describe("passed", () => {
  it("uses the DCWP 70% pass mark (21 of 30)", () => {
    expect(PASS_RATE).toBe(0.7);
    expect(TEST_SIZE).toBe(30);
    expect(passed(21, 30)).toBe(true);
    expect(passed(20, 30)).toBe(false);
    expect(passed(0, 0)).toBe(false);
    expect(passed(7, 10)).toBe(true);
  });
});

describe("shuffle / sample", () => {
  it("shuffle keeps every element", () => {
    const items = [1, 2, 3, 4, 5];
    const out = shuffle(items, lcg(1));
    expect(out.slice().sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5]); // input untouched
  });
  it("sample never returns more than the pool", () => {
    expect(sample([1, 2, 3], 10, lcg(2))).toHaveLength(3);
    expect(sample([1, 2, 3, 4], 2, lcg(2))).toHaveLength(2);
  });
});

describe("makeQuestion", () => {
  it("shuffles options but tracks the correct answer", () => {
    for (let seed = 0; seed < 20; seed++) {
      const q = makeQuestion(SAMPLE, sectionLabel("licensing"), lcg(seed));
      expect(q.choices.slice().sort()).toEqual(SAMPLE.choices.slice().sort());
      expect(q.choices[q.answer]).toBe("No");
      expect(q.sub).toBe("Licensing & the law");
      expect(q.id).toBe("licensing:scope-99");
      expect(q.topic).toBe("scope");
      expect(q.hard).toBe(true);
    }
  });
  it("flags difficulty below 3 as not hard", () => {
    const q = makeQuestion({ ...SAMPLE, difficulty: 2 }, "x", lcg(1));
    expect(q.hard).toBe(false);
  });
});

describe("generateTest", () => {
  it("returns the requested count, capped at the pool", () => {
    const t = generateTest(HIC_QUESTIONS, sectionLabel, { count: 5, rng: lcg(3) });
    expect(t).toHaveLength(5);
  });
  it("filters to a single section", () => {
    const t = generateTest(HIC_QUESTIONS, sectionLabel, {
      count: 50,
      rng: lcg(4),
      section: "advertising",
    });
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((q) => q.id.startsWith("advertising:"))).toBe(true);
  });
  it("mixes every section for 'all'", () => {
    const t = generateTest(HIC_QUESTIONS, sectionLabel, {
      count: HIC_QUESTIONS.length,
      rng: lcg(5),
      section: "all",
    });
    expect(t).toHaveLength(HIC_QUESTIONS.length);
  });
  it("can fill a full-length 30-question exam", () => {
    const t = generateTest(HIC_QUESTIONS, sectionLabel, { count: TEST_SIZE, rng: lcg(7) });
    expect(t).toHaveLength(TEST_SIZE);
    expect(new Set(t.map((q) => q.id)).size).toBe(TEST_SIZE); // no repeats
  });
  it("each generated question has a valid answer index", () => {
    const t = generateTest(HIC_QUESTIONS, sectionLabel, { count: 30, rng: lcg(6) });
    for (const q of t) {
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
    }
  });
});

describe("question pool integrity", () => {
  it("every question has a section-prefixed id, unique, with a valid answer", () => {
    const ids = new Set<string>();
    for (const q of HIC_QUESTIONS) {
      expect(q.id.startsWith(`${q.section}:`)).toBe(true);
      expect(ids.has(q.id)).toBe(false);
      ids.add(q.id);
      expect(q.choices.length).toBeGreaterThanOrEqual(3);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.choices.length);
      expect(q.explanation.length).toBeGreaterThan(0);
      expect(q.guideRef.length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(q.difficulty);
    }
    expect(ids.size).toBe(60);
  });

  it("every section in the picker has questions behind it", () => {
    for (const s of SECTIONS) {
      expect(HIC_QUESTIONS.some((q) => q.section === s.key)).toBe(true);
    }
  });
});
