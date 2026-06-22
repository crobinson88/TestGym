import { describe, expect, it } from "vitest";
import type { FrenchAttemptRow } from "@/lib/database.types";
import { computeStats } from "./stats";

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
