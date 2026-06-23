import { describe, expect, it } from "vitest";
import type { FrenchAttemptRow } from "@/lib/database.types";
import {
  computeStats,
  computeVocabHistory,
  vocabKeyFromQuestionId,
  vocabMastery,
  vocabMasteryProgress,
  weeklyAccuracy,
} from "./stats";

const mk = (id: string, correct: boolean) => ({ questionId: id, prompt: id, correct });

function attempt(over: Partial<FrenchAttemptRow>): FrenchAttemptRow {
  return {
    id: Math.random().toString(36).slice(2),
    kind: "vocab",
    total: 10,
    correct: 8,
    duration_ms: 1000,
    details: [],
    started_at: "2026-06-01T10:00:00.000Z",
    client_id: null,
    user_id: null,
    created_at: "2026-06-01T10:00:00.000Z",
    updated_at: "2026-06-01T10:00:00.000Z",
    deleted_at: null,
    ...over,
  };
}

describe("computeStats", () => {
  it("aggregates accuracy, best and counts per kind", () => {
    const stats = computeStats([
      attempt({ kind: "vocab", total: 10, correct: 8, started_at: "2026-06-01T10:00:00Z" }),
      attempt({ kind: "vocab", total: 10, correct: 10, started_at: "2026-06-02T10:00:00Z" }),
      attempt({ kind: "rules", total: 10, correct: 5, started_at: "2026-06-03T10:00:00Z" }),
    ]);

    expect(stats.totalTests).toBe(3);
    expect(stats.byKind.vocab.tests).toBe(2);
    expect(stats.byKind.vocab.correct).toBe(18);
    expect(stats.byKind.vocab.questions).toBe(20);
    expect(stats.byKind.vocab.accuracy).toBeCloseTo(0.9);
    expect(stats.byKind.vocab.bestAccuracy).toBeCloseTo(1);
    expect(stats.byKind.vocab.lastAt).toBe("2026-06-02T10:00:00Z");
    expect(stats.byKind.rules.accuracy).toBeCloseTo(0.5);
  });

  it("ignores soft-deleted attempts", () => {
    const stats = computeStats([
      attempt({ correct: 10, deleted_at: "2026-06-05T10:00:00Z" }),
      attempt({ correct: 4 }),
    ]);
    expect(stats.totalTests).toBe(1);
    expect(stats.byKind.vocab.correct).toBe(4);
  });

  it("ranks most-missed questions by wrong count", () => {
    const stats = computeStats([
      attempt({
        details: [
          { questionId: "q1", prompt: "le chien", correct: false },
          { questionId: "q2", prompt: "grand", correct: true },
        ],
      }),
      attempt({
        details: [
          { questionId: "q1", prompt: "le chien", correct: false },
          { questionId: "q2", prompt: "grand", correct: false },
        ],
      }),
    ]);
    expect(stats.missed[0].questionId).toBe("q1");
    expect(stats.missed[0].wrong).toBe(2);
    expect(stats.missed[0].seen).toBe(2);
    expect(stats.missed.find((m) => m.questionId === "q2")?.wrong).toBe(1);
  });

  it("returns zeroed kinds when there are no attempts", () => {
    const stats = computeStats([]);
    expect(stats.totalTests).toBe(0);
    expect(stats.byKind.vocab.accuracy).toBe(0);
    expect(stats.byKind.rules.tests).toBe(0);
  });
});

describe("vocabKeyFromQuestionId", () => {
  it("extracts the French word from a vocab id", () => {
    expect(vocabKeyFromQuestionId("vocab:être:fr2en")).toBe("être");
    expect(vocabKeyFromQuestionId("vocab:le chien:en2fr")).toBe("le chien");
  });

  it("returns null for non-vocab ids", () => {
    expect(vocabKeyFromQuestionId("r1")).toBeNull();
    expect(vocabKeyFromQuestionId("vocab:incomplete")).toBeNull();
  });
});

describe("computeVocabHistory", () => {
  it("aggregates a word across directions and tracks the latest showing", () => {
    const history = computeVocabHistory([
      attempt({
        started_at: "2026-06-01T10:00:00Z",
        details: [{ questionId: "vocab:être:fr2en", prompt: "être", correct: true }],
      }),
      attempt({
        started_at: "2026-06-05T10:00:00Z",
        details: [{ questionId: "vocab:être:en2fr", prompt: "to be", correct: false }],
      }),
    ]);
    const h = history.get("être")!;
    expect(h.seen).toBe(2);
    expect(h.correct).toBe(1);
    expect(h.lastShownAt).toBe("2026-06-05T10:00:00Z");
  });

  it("ignores rules attempts, soft-deleted attempts and non-vocab details", () => {
    const history = computeVocabHistory([
      attempt({
        kind: "rules",
        details: [{ questionId: "r1", prompt: "rule", correct: true }],
      }),
      attempt({
        deleted_at: "2026-06-10T00:00:00Z",
        details: [{ questionId: "vocab:avoir:fr2en", prompt: "avoir", correct: true }],
      }),
      attempt({
        details: [{ questionId: "vocab:faire:fr2en", prompt: "faire", correct: true }],
      }),
    ]);
    expect(history.has("avoir")).toBe(false);
    expect(history.has("faire")).toBe(true);
    expect(history.size).toBe(1);
  });
});

describe("vocabMastery", () => {
  it("masters a word at >90% over at least 3 showings, aggregating directions", () => {
    const attempts = [
      attempt({ details: [mk("vocab:être:fr2en", true)] }),
      attempt({ details: [mk("vocab:être:en2fr", true)] }),
      attempt({ details: [mk("vocab:être:fr2en", true)] }),
      // avoir: 2/3 = 67% → not mastered
      attempt({ details: [mk("vocab:avoir:fr2en", true), mk("vocab:avoir:en2fr", false)] }),
      attempt({ details: [mk("vocab:avoir:fr2en", true)] }),
    ];
    const m = vocabMastery(attempts, 1000);
    expect(m.mastered).toBe(1); // only être
    expect(m.attempted).toBe(2);
    expect(m.total).toBe(1000);
  });

  it("needs at least 3 showings even at 100% correct", () => {
    const attempts = [
      attempt({ details: [mk("vocab:faire:fr2en", true)] }),
      attempt({ details: [mk("vocab:faire:fr2en", true)] }),
    ];
    expect(vocabMastery(attempts, 100).mastered).toBe(0);
  });

  it("pct is mastered words over the whole list", () => {
    const attempts = ["un", "deux", "trois"].flatMap((w) =>
      [0, 1, 2, 3].map(() => attempt({ details: [mk(`vocab:${w}:fr2en`, true)] })),
    );
    const m = vocabMastery(attempts, 12);
    expect(m.mastered).toBe(3);
    expect(m.pct).toBe(25);
  });
});

describe("vocabMasteryProgress", () => {
  const weeks = ["2026-06-08", "2026-06-15"];

  it("accumulates: a word crosses the bar only once enough showings land", () => {
    const attempts = [
      attempt({ started_at: "2026-06-09T09:00:00Z", details: [mk("vocab:être:fr2en", true)] }),
      attempt({ started_at: "2026-06-10T09:00:00Z", details: [mk("vocab:être:en2fr", true)] }),
      attempt({ started_at: "2026-06-16T09:00:00Z", details: [mk("vocab:être:fr2en", true)] }),
    ];
    const pts = vocabMasteryProgress(attempts, weeks, 100);
    expect(pts.find((p) => p.week_start === "2026-06-08")!.mastered).toBe(0);
    expect(pts.find((p) => p.week_start === "2026-06-15")!.mastered).toBe(1);
  });
});

describe("weeklyAccuracy", () => {
  // 2026-06-08 and 2026-06-15 are Mondays.
  const weeks = ["2026-06-08", "2026-06-15"];

  it("computes per-kind percentage weighted across questions in a week", () => {
    const points = weeklyAccuracy(
      [
        attempt({ kind: "vocab", total: 10, correct: 7, started_at: "2026-06-16T09:00:00Z" }),
        attempt({ kind: "vocab", total: 10, correct: 9, started_at: "2026-06-18T09:00:00Z" }),
        attempt({ kind: "rules", total: 10, correct: 5, started_at: "2026-06-17T09:00:00Z" }),
      ],
      weeks,
    );
    const wk = points.find((p) => p.week_start === "2026-06-15")!;
    expect(wk.vocab).toBe(80); // (7+9)/20
    expect(wk.rules).toBe(50);
  });

  it("uses null for a kind with no tests that week (chart gap, not zero)", () => {
    const points = weeklyAccuracy(
      [attempt({ kind: "vocab", total: 10, correct: 8, started_at: "2026-06-09T09:00:00Z" })],
      weeks,
    );
    const wk = points.find((p) => p.week_start === "2026-06-08")!;
    expect(wk.vocab).toBe(80);
    expect(wk.rules).toBeNull();
    const empty = points.find((p) => p.week_start === "2026-06-15")!;
    expect(empty.vocab).toBeNull();
    expect(empty.rules).toBeNull();
  });

  it("ignores attempts outside the requested weeks and soft-deleted ones", () => {
    const points = weeklyAccuracy(
      [
        attempt({ kind: "vocab", total: 10, correct: 10, started_at: "2026-01-01T09:00:00Z" }),
        attempt({
          kind: "vocab",
          total: 10,
          correct: 10,
          started_at: "2026-06-16T09:00:00Z",
          deleted_at: "2026-06-20T00:00:00Z",
        }),
      ],
      weeks,
    );
    expect(points.every((p) => p.vocab === null && p.rules === null)).toBe(true);
  });
});
