import { describe, expect, it } from "vitest";
import type { DrivingAttemptRow } from "@/lib/database.types";
import { computeStats, sectionFromQuestionId } from "./stats";

function attempt(over: Partial<DrivingAttemptRow>): DrivingAttemptRow {
  return {
    id: over.id ?? "a1",
    section: over.section ?? "all",
    total: over.total ?? 10,
    correct: over.correct ?? 7,
    duration_ms: over.duration_ms ?? null,
    details: over.details ?? [],
    started_at: over.started_at ?? "2026-07-01T10:00:00.000Z",
    client_id: null,
    user_id: null,
    created_at: "2026-07-01T10:00:00.000Z",
    updated_at: "2026-07-01T10:00:00.000Z",
    deleted_at: over.deleted_at ?? null,
  };
}

describe("sectionFromQuestionId", () => {
  it("parses the section prefix", () => {
    expect(sectionFromQuestionId("signs:stop-shape")).toBe("signs");
    expect(sectionFromQuestionId("alcohol:bac-limit")).toBe("alcohol");
  });
  it("returns null for unknown prefixes", () => {
    expect(sectionFromQuestionId("bogus:x")).toBeNull();
    expect(sectionFromQuestionId("nocolon")).toBeNull();
  });
});

describe("computeStats", () => {
  it("returns empty stats for no attempts", () => {
    const s = computeStats([]);
    expect(s.totalTests).toBe(0);
    expect(s.accuracy).toBe(0);
    expect(s.passes).toBe(0);
    expect(s.recent).toEqual([]);
    expect(s.missed).toEqual([]);
  });

  it("ignores soft-deleted attempts", () => {
    const s = computeStats([
      attempt({ id: "a", correct: 10, total: 10 }),
      attempt({ id: "b", correct: 0, total: 10, deleted_at: "2026-07-02T00:00:00.000Z" }),
    ]);
    expect(s.totalTests).toBe(1);
    expect(s.accuracy).toBe(1);
  });

  it("aggregates accuracy, best, and passes across the pass mark", () => {
    const s = computeStats([
      attempt({ id: "a", correct: 14, total: 20 }), // pass (70%)
      attempt({ id: "b", correct: 13, total: 20 }), // fail
      attempt({ id: "c", correct: 20, total: 20 }), // pass, perfect
    ]);
    expect(s.totalTests).toBe(3);
    expect(s.questions).toBe(60);
    expect(s.correct).toBe(47);
    expect(s.passes).toBe(2);
    expect(s.bestAccuracy).toBe(1);
    expect(Math.round(s.accuracy * 100)).toBe(78);
  });

  it("buckets per-question details by section", () => {
    const s = computeStats([
      attempt({
        id: "a",
        section: "all",
        total: 3,
        correct: 2,
        details: [
          { questionId: "signs:a", prompt: "p1", correct: true },
          { questionId: "signs:b", prompt: "p2", correct: false },
          { questionId: "alcohol:a", prompt: "p3", correct: true },
        ],
      }),
    ]);
    expect(s.bySection.signs.questions).toBe(2);
    expect(s.bySection.signs.correct).toBe(1);
    expect(s.bySection.signs.accuracy).toBe(0.5);
    expect(s.bySection.alcohol.questions).toBe(1);
    expect(s.bySection.alcohol.accuracy).toBe(1);
    expect(s.bySection.speed.questions).toBe(0);
  });

  it("ranks most-missed questions", () => {
    const mk = (correct: boolean) => ({ questionId: "signs:x", prompt: "hard one", correct });
    const s = computeStats([
      attempt({ id: "a", total: 1, correct: 0, details: [mk(false)] }),
      attempt({ id: "b", total: 1, correct: 0, details: [mk(false)] }),
      attempt({ id: "c", total: 1, correct: 1, details: [mk(true)] }),
    ]);
    expect(s.missed).toHaveLength(1);
    expect(s.missed[0]).toMatchObject({ questionId: "signs:x", seen: 3, wrong: 2 });
  });

  it("sorts recent newest-first", () => {
    const s = computeStats([
      attempt({ id: "old", started_at: "2026-06-01T10:00:00.000Z" }),
      attempt({ id: "new", started_at: "2026-07-10T10:00:00.000Z" }),
    ]);
    expect(s.recent[0].id).toBe("new");
    expect(s.lastAt).toBe("2026-07-10T10:00:00.000Z");
  });
});
