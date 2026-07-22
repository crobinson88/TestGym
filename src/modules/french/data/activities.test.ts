import { describe, expect, it } from "vitest";
import { VOCAB, ACTIVITIES } from "./vocab";
import { CONJ_VERBS } from "./conjugations";
import { PRON_QUESTIONS } from "./pronunciation";
import { RULE_QUESTIONS } from "./rules";

describe("activities lesson vocab", () => {
  it("adds the leisure-activity phrases and opinion expressions to VOCAB", () => {
    const fr = new Set(VOCAB.map((w) => w.fr));
    for (const w of ACTIVITIES) expect(fr.has(w.fr)).toBe(true);
    // The specific screenshot phrases the learner needs to see.
    for (const phrase of [
      "jouer au handball",
      "sauter à la corde",
      "faire du vélo",
      "se promener",
      "pêcher",
      "faire du patin à glace",
      "aller au cinéma",
      "je n'aime pas",
      "je préfère",
      "je préfère nager plutôt que dormir",
      "il aime se promener",
    ]) {
      expect(fr.has(phrase)).toBe(true);
    }
  });

  it("keeps French keys unique across the whole pool (SR keys on `fr`)", () => {
    const seen = new Set<string>();
    for (const w of VOCAB) {
      const key = w.fr.toLowerCase();
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe("opinion verbs are conjugatable", () => {
  it("adds aimer/adorer/détester/préférer to the conjugation pool", () => {
    const infinitives = new Set(CONJ_VERBS.map((v) => v.infinitive));
    for (const v of ["aimer", "adorer", "détester", "préférer"]) {
      expect(infinitives.has(v)).toBe(true);
    }
  });

  it("uses the forms shown in the lesson for aimer", () => {
    const aimer = CONJ_VERBS.find((v) => v.infinitive === "aimer")!;
    expect(aimer.present).toEqual({
      je: "aime",
      tu: "aimes",
      il: "aime",
      nous: "aimons",
      vous: "aimez",
      ils: "aiment",
    });
  });

  it("keeps préférer's é → è stem change in the singular and ils forms", () => {
    const preferer = CONJ_VERBS.find((v) => v.infinitive === "préférer")!;
    expect(preferer.present.je).toBe("préfère");
    expect(preferer.present.ils).toBe("préfèrent");
    expect(preferer.present.nous).toBe("préférons");
  });
});

describe("lesson pronunciation questions", () => {
  it("covers the new sounds from the activity words", () => {
    const ids = new Set(PRON_QUESTIONS.map((q) => q.id));
    for (const id of ["cons-j", "cons-ss", "silent-er-infinitive"]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("keeps pronunciation ids unique", () => {
    const ids = PRON_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("preference grammar rules", () => {
  it("covers aimer/préférer + infinitive and préférer's accent change", () => {
    const ids = new Set(RULE_QUESTIONS.map((q) => q.id));
    expect(ids.has("er-aimer-infinitive-1")).toBe(true);
    expect(ids.has("er-preferer-accent-1")).toBe(true);
  });

  it("keeps rule ids unique", () => {
    const ids = RULE_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
