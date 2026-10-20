import { describe, it, expect } from "vitest";
import { mergeSentences, parseSentenceCache, selectCached } from "./sentenceCache";
import type { GeneratedSentence } from "./quiz";

const s = (fr: string, words: string[]): GeneratedSentence => ({ fr, en: fr, words });

const CACHE = [
  s("je mange une pomme", ["je", "mange", "une", "pomme"]),
  s("il fait froid", ["il", "fait", "froid"]),
  s("nous partons demain", ["nous", "partons", "demain"]),
  s("tu parles vite", ["tu", "parles", "vite"]),
];

const mastered = (words: string[]) => new Set(words.map((w) => w.toLowerCase()));

const ALL = mastered(CACHE.flatMap((c) => c.words));

describe("french sentence cache", () => {
  it("keeps only well-formed sentences when parsing", () => {
    const raw = JSON.stringify([
      s("ok", ["ok"]),
      { fr: "", en: "x", words: ["a"] },
      { fr: "no words", en: "x", words: [] },
      { fr: "bad word", en: "x", words: [7] },
      "nonsense",
    ]);
    expect(parseSentenceCache(raw)).toEqual([s("ok", ["ok"])]);
    expect(parseSentenceCache("not json")).toEqual([]);
    expect(parseSentenceCache(null)).toEqual([]);
  });

  it("puts new batches first, dedupes and caps", () => {
    const merged = mergeSentences(CACHE, [s("IL FAIT FROID", ["il", "fait", "froid"])], 3);
    expect(merged).toHaveLength(3);
    expect(merged[0].fr).toBe("IL FAIT FROID");
    expect(merged.filter((m) => m.fr.toLowerCase() === "il fait froid")).toHaveLength(1);
  });

  it("deals rounds of the asked length first", () => {
    const picked = selectCached(CACHE, 2, 3, ALL, () => 0);
    expect(picked.every((p) => p.words.length === 3)).toBe(true);
  });

  it("falls back to the nearest length rather than coming up short", () => {
    const picked = selectCached(CACHE, 4, 3, ALL, () => 0);
    expect(picked).toHaveLength(4);
    expect(picked.map((p) => p.words.length).slice(0, 3)).toEqual([3, 3, 3]);
  });

  it("skips sentences using words that are no longer mastered", () => {
    const picked = selectCached(CACHE, 4, 3, mastered(["il", "fait", "froid"]), () => 0);
    expect(picked).toEqual([s("il fait froid", ["il", "fait", "froid"])]);
  });

  it("comes up empty when nothing is mastered, so the caller can fall back", () => {
    expect(selectCached(CACHE, 4, 3, new Set(), () => 0)).toEqual([]);
  });
});
