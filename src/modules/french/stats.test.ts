import { describe, expect, it } from "vitest";
import type { FrenchAttemptRow } from "@/lib/database.types";
import {
  computeListeningSchedules,
  computeStats,
  computeVocabHistory,
  computeVocabSchedules,
  dueForReview,
  listenKeyFromQuestionId,
  masteredVocab,
  reviewIntervalDays,
  REVIEW_INTERVALS_DAYS,
  vocabKeyFromQuestionId,
  vocabMastery,
  vocabMasteryProgress,
  weeklyAccuracy,
} from "./stats";
import type { VocabWord } from "./data/vocab";

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

describe("masteredVocab", () => {
  const POOL: VocabWord[] = [
    { rank: 1, fr: "être", en: "to be", pos: "verb" },
    { rank: 2, fr: "avoir", en: "to have", pos: "verb" },
    { rank: 3, fr: "le chien", en: "dog", pos: "noun", gender: "m" },
  ];

  it("returns only the pool words the learner has mastered, in pool order", () => {
    const attempts = [
      // être: 3/3 → mastered
      attempt({ details: [mk("vocab:être:fr2en", true)] }),
      attempt({ details: [mk("vocab:être:en2fr", true)] }),
      attempt({ details: [mk("vocab:être:fr2en", true)] }),
      // avoir: 2/3 → not mastered
      attempt({ details: [mk("vocab:avoir:fr2en", true), mk("vocab:avoir:en2fr", false)] }),
      attempt({ details: [mk("vocab:avoir:fr2en", true)] }),
      // le chien: never tested
    ];
    const out = masteredVocab(attempts, POOL);
    expect(out.map((w) => w.fr)).toEqual(["être"]);
  });

  it("is empty when nothing is mastered yet", () => {
    expect(masteredVocab([], POOL)).toEqual([]);
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

describe("reviewIntervalDays", () => {
  it("maps each box to its interval and clamps out-of-range boxes", () => {
    expect(reviewIntervalDays(0)).toBe(REVIEW_INTERVALS_DAYS[0]);
    expect(reviewIntervalDays(2)).toBe(REVIEW_INTERVALS_DAYS[2]);
    expect(reviewIntervalDays(-5)).toBe(REVIEW_INTERVALS_DAYS[0]);
    expect(reviewIntervalDays(999)).toBe(REVIEW_INTERVALS_DAYS[REVIEW_INTERVALS_DAYS.length - 1]);
  });
});

describe("computeVocabSchedules", () => {
  it("climbs a box per correct answer and pushes the due date further out", () => {
    const schedules = computeVocabSchedules([
      attempt({ started_at: "2026-06-01T10:00:00Z", details: [mk("vocab:être:fr2en", true)] }),
      attempt({ started_at: "2026-06-03T10:00:00Z", details: [mk("vocab:être:en2fr", true)] }),
      attempt({ started_at: "2026-06-06T10:00:00Z", details: [mk("vocab:être:fr2en", true)] }),
    ]);
    const s = schedules.get("être")!;
    expect(s.seen).toBe(3);
    expect(s.correct).toBe(3);
    expect(s.box).toBe(3);
    expect(s.lastShownAt).toBe("2026-06-06");
    expect(s.dueOn).toBe("2026-06-13"); // 2026-06-06 + interval(box 3) = 7 days
    expect(s.mastered).toBe(true);
  });

  it("resets the box to 0 on a miss so the word is due the same day", () => {
    const schedules = computeVocabSchedules([
      attempt({ started_at: "2026-06-01T10:00:00Z", details: [mk("vocab:avoir:fr2en", true)] }),
      attempt({ started_at: "2026-06-02T10:00:00Z", details: [mk("vocab:avoir:fr2en", true)] }),
      attempt({ started_at: "2026-06-03T10:00:00Z", details: [mk("vocab:avoir:en2fr", false)] }),
    ]);
    const s = schedules.get("avoir")!;
    expect(s.box).toBe(0);
    expect(s.dueOn).toBe("2026-06-03"); // due immediately after the miss
    expect(s.mastered).toBe(false);
  });

  it("ignores rules and soft-deleted attempts", () => {
    const schedules = computeVocabSchedules([
      attempt({ kind: "rules", details: [mk("r1", false)] }),
      attempt({ deleted_at: "2026-06-10T00:00:00Z", details: [mk("vocab:faire:fr2en", false)] }),
      attempt({ details: [mk("vocab:dire:fr2en", true)] }),
    ]);
    expect(schedules.has("faire")).toBe(false);
    expect(schedules.has("dire")).toBe(true);
  });
});

describe("listenKeyFromQuestionId", () => {
  it("extracts the French word from a listening id and ignores others", () => {
    expect(listenKeyFromQuestionId("listen:être")).toBe("être");
    expect(listenKeyFromQuestionId("listen:le chien")).toBe("le chien");
    expect(listenKeyFromQuestionId("vocab:être:fr2en")).toBeNull();
    expect(listenKeyFromQuestionId("listen")).toBeNull();
  });
});

describe("computeListeningSchedules", () => {
  it("builds a schedule from listening attempts, independent of vocab", () => {
    const schedules = computeListeningSchedules([
      attempt({
        kind: "listening",
        started_at: "2026-06-03T10:00:00Z",
        details: [mk("listen:avoir", false)],
      }),
      // a vocab attempt for the same word must not leak into the listening schedule
      attempt({
        kind: "vocab",
        started_at: "2026-06-04T10:00:00Z",
        details: [mk("vocab:avoir:fr2en", true)],
      }),
    ]);
    const s = schedules.get("avoir")!;
    expect(s.box).toBe(0); // only the listening miss counted
    expect(s.seen).toBe(1);
    expect(s.dueOn).toBe("2026-06-03");
  });
});

describe("dueForReview", () => {
  it("counts only words due on or before the given day", () => {
    const schedules = computeVocabSchedules([
      // être: mastered, due 2026-06-13 (not due as of 2026-06-10)
      attempt({ started_at: "2026-06-01T10:00:00Z", details: [mk("vocab:être:fr2en", true)] }),
      attempt({ started_at: "2026-06-03T10:00:00Z", details: [mk("vocab:être:en2fr", true)] }),
      attempt({ started_at: "2026-06-06T10:00:00Z", details: [mk("vocab:être:fr2en", true)] }),
      // avoir: missed on 2026-06-03, due that day
      attempt({ started_at: "2026-06-03T10:00:00Z", details: [mk("vocab:avoir:fr2en", false)] }),
    ]);
    expect(dueForReview(schedules, "2026-06-10")).toBe(1); // only avoir
    expect(dueForReview(schedules, "2026-06-13")).toBe(2); // être now due too
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
