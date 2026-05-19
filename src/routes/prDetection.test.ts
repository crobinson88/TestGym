import { describe, expect, it } from "vitest";
import { detectPr } from "./prDetection";

describe("detectPr", () => {
  it("never reports a PR when there is no prior history", () => {
    expect(detectPr(null, 500, 50).kind).toBe("saved");
    expect(detectPr(undefined, 500, 50).kind).toBe("saved");
    expect(detectPr({ totalSets: 0, prWeight: 0, prReps: 0 }, 500, 50).kind).toBe(
      "saved",
    );
  });

  it("flags a new weight PR when newWeight is strictly greater", () => {
    const snap = { totalSets: 10, prWeight: 225, prReps: 12 };
    expect(detectPr(snap, 230, 5)).toEqual({ kind: "pr-weight", weight: 230 });
    expect(detectPr(snap, 225, 5).kind).toBe("saved");
    expect(detectPr(snap, 220, 5).kind).toBe("saved");
  });

  it("flags a new reps PR when newReps is strictly greater", () => {
    const snap = { totalSets: 10, prWeight: 225, prReps: 12 };
    expect(detectPr(snap, 100, 13)).toEqual({ kind: "pr-reps", reps: 13 });
    expect(detectPr(snap, 100, 12).kind).toBe("saved");
  });

  it("flags both when the new set beats both PRs", () => {
    const snap = { totalSets: 10, prWeight: 225, prReps: 12 };
    expect(detectPr(snap, 250, 15)).toEqual({
      kind: "pr-both",
      weight: 250,
      reps: 15,
    });
  });
});
