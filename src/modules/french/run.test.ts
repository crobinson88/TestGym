import { describe, it, expect } from "vitest";
import { addTest, parseRun } from "./run";

describe("french run tally", () => {
  it("accumulates tests taken back to back", () => {
    let run = addTest(null, "vocab", 10, 7);
    run = addTest(run, "vocab", 10, 9);
    run = addTest(run, "vocab", 5, 5);
    expect(run).toEqual({ kind: "vocab", tests: 3, total: 25, correct: 21 });
  });

  it("starts over when the kind changes", () => {
    const vocab = addTest(null, "vocab", 10, 7);
    expect(addTest(vocab, "rules", 10, 3)).toEqual({
      kind: "rules",
      tests: 1,
      total: 10,
      correct: 3,
    });
  });

  it("only reads a stored run back for the same kind", () => {
    const raw = JSON.stringify({ kind: "vocab", tests: 2, total: 20, correct: 15 });
    expect(parseRun(raw, "vocab")).toEqual({ kind: "vocab", tests: 2, total: 20, correct: 15 });
    expect(parseRun(raw, "listening")).toBeNull();
    expect(parseRun(null, "vocab")).toBeNull();
    expect(parseRun("not json", "vocab")).toBeNull();
    expect(parseRun(JSON.stringify({ kind: "vocab", tests: 2 }), "vocab")).toBeNull();
  });
});
