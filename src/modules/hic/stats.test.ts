import { describe, expect, it } from "vitest";
import type { HicAttemptRow } from "@/lib/database.types";
import { computeStats, sectionFromQuestionId, topicFromQuestionId } from "./stats";

function attempt(over: Partial<HicAttemptRow>): HicAttemptRow {
  return {
    id: over.id ?? "a1",
    section: over.section ?? "all",
    total: over.total ?? 10,
    correct: over.correct ?? 7,
    duration_ms: over.duration_ms ?? null,
    details: over.details ?? [],
    started_at: over.started_at ?? "2026-10-01T10:00:00.000Z",
    client_id: null,
    user_id: null,
    created_at: "2026-10-01T10:00:00.000Z",
    updated_at: "2026-10-01T10:00:00.000Z",
    deleted_at: over.deleted_at ?? null,
  };
}

describe("sectionFromQuestionId", () => {
  it("parses the section prefix", () => {
    expect(sectionFromQuestionId("licensing:scope-1")).toBe("licensing");
    expect(sectionFromQuestionId("contracts:cancellation-3")).toBe("contracts");
  });
  it("returns null for unknown prefixes", () => {
    expect(sectionFromQuestionId("bogus:x")).toBeNull();
    expect(sectionFromQuestionId("nocolon")).toBeNull();
  });
});

describe("topicFromQuestionId", () => {
  it("strips the trailing index", () => {
    expect(topicFromQuestionId("licensing:scope-1")).toBe("scope");
    expect(topicFromQuestionId("contracts:contract-contents-12")).toBe("contract-contents");
    expect(topicFromQuestionId("operations:prime-duties-2")).toBe("prime-duties");
  });
  it("returns null when there is no topic", () => {
    expect(topicFromQuestionId("nocolon")).toBeNull();
    expect(topicFromQuestionId("licensing:")).toBeNull();
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
    expect(s.weakTopics).toEqual([]);
  });

  it("ignores soft-deleted attempts", () => {
    const s = computeStats([
      attempt({ id: "a", correct: 10, total: 10 }),
      attempt({ id: "b", correct: 0, total: 10, deleted_at: "2026-10-02T00:00:00.000Z" }),
    ]);
    expect(s.totalTests).toBe(1);
    expect(s.accuracy).toBe(1);
  });

  it("aggregates accuracy, best, and passes across the 70% pass mark", () => {
    const s = computeStats([
      attempt({ id: "a", correct: 21, total: 30 }), // pass (exactly 70%)
      attempt({ id: "b", correct: 20, total: 30 }), // fail
      attempt({ id: "c", correct: 30, total: 30 }), // pass, perfect
    ]);
    expect(s.totalTests).toBe(3);
    expect(s.questions).toBe(90);
    expect(s.correct).toBe(71);
    expect(s.passes).toBe(2);
    expect(s.bestAccuracy).toBe(1);
    expect(Math.round(s.accuracy * 100)).toBe(79);
  });

  it("buckets per-question details by section", () => {
    const s = computeStats([
      attempt({
        id: "a",
        section: "all",
        total: 3,
        correct: 2,
        details: [
          { questionId: "licensing:scope-1", prompt: "p1", correct: true },
          { questionId: "licensing:scope-2", prompt: "p2", correct: false },
          { questionId: "advertising:guarantees-1", prompt: "p3", correct: true },
        ],
      }),
    ]);
    expect(s.bySection.licensing.questions).toBe(2);
    expect(s.bySection.licensing.correct).toBe(1);
    expect(s.bySection.licensing.accuracy).toBe(0.5);
    expect(s.bySection.advertising.questions).toBe(1);
    expect(s.bySection.advertising.accuracy).toBe(1);
    expect(s.bySection.operations.questions).toBe(0);
  });

  it("ranks weak topics worst-first and leaves out the perfect ones", () => {
    const s = computeStats([
      attempt({
        id: "a",
        total: 4,
        correct: 2,
        details: [
          { questionId: "contracts:cancellation-1", prompt: "p", correct: false },
          { questionId: "contracts:cancellation-2", prompt: "p", correct: false },
          { questionId: "licensing:penalties-1", prompt: "p", correct: true },
          { questionId: "licensing:penalties-2", prompt: "p", correct: false },
        ],
      }),
    ]);
    expect(s.weakTopics.map((t) => t.topic)).toEqual(["cancellation", "penalties"]);
    expect(s.weakTopics[0].accuracy).toBe(0);
    expect(s.weakTopics[1].accuracy).toBe(0.5);
  });

  it("ranks most-missed questions", () => {
    const mk = (correct: boolean) => ({
      questionId: "contracts:cancellation-5",
      prompt: "hard one",
      correct,
    });
    const s = computeStats([
      attempt({ id: "a", total: 1, correct: 0, details: [mk(false)] }),
      attempt({ id: "b", total: 1, correct: 0, details: [mk(false)] }),
      attempt({ id: "c", total: 1, correct: 1, details: [mk(true)] }),
    ]);
    expect(s.missed).toHaveLength(1);
    expect(s.missed[0]).toMatchObject({
      questionId: "contracts:cancellation-5",
      seen: 3,
      wrong: 2,
    });
  });

  it("sorts recent newest-first", () => {
    const s = computeStats([
      attempt({ id: "old", started_at: "2026-09-01T10:00:00.000Z" }),
      attempt({ id: "new", started_at: "2026-10-10T10:00:00.000Z" }),
    ]);
    expect(s.recent[0].id).toBe("new");
    expect(s.lastAt).toBe("2026-10-10T10:00:00.000Z");
  });
});
