import { describe, expect, it } from "vitest";
import { addSetReducer, initialAddSetState, type AddSetState } from "./addSetReducer";

describe("addSetReducer", () => {
  it("pickCategory advances to exercise stage and clears exercise", () => {
    const s = addSetReducer(initialAddSetState, { type: "pickCategory", id: "cat-1" });
    expect(s.stage).toBe("exercise");
    expect(s.categoryId).toBe("cat-1");
    expect(s.exerciseId).toBeUndefined();
  });

  it("pickExercise advances to amount and resets touched", () => {
    let s = addSetReducer(initialAddSetState, { type: "pickCategory", id: "c" });
    s = addSetReducer(s, { type: "pickExercise", id: "e" });
    expect(s.stage).toBe("amount");
    expect(s.exerciseId).toBe("e");
    expect(s.touched).toBe(false);
  });

  it("setDefaults seeds weight/reps when not touched", () => {
    let s: AddSetState = { ...initialAddSetState, stage: "amount", exerciseId: "e" };
    s = addSetReducer(s, { type: "setDefaults", weight: 225, reps: 8 });
    expect(s.weight).toBe(225);
    expect(s.reps).toBe(8);
  });

  it("setDefaults is a no-op once the user has touched the values", () => {
    let s: AddSetState = { ...initialAddSetState, stage: "amount", exerciseId: "e", touched: true };
    s = addSetReducer(s, { type: "setDefaults", weight: 225, reps: 8 });
    expect(s.weight).toBe(0);
    expect(s.reps).toBe(0);
  });

  it("adjustWeight rounds to 0.5 and clamps at 0", () => {
    let s: AddSetState = { ...initialAddSetState, stage: "amount", weight: 100 };
    s = addSetReducer(s, { type: "adjustWeight", delta: 2.5 });
    expect(s.weight).toBe(102.5);
    expect(s.touched).toBe(true);
    s = addSetReducer(s, { type: "adjustWeight", delta: -1000 });
    expect(s.weight).toBe(0);
  });

  it("adjustReps clamps at 0 and is integer", () => {
    let s: AddSetState = { ...initialAddSetState, stage: "amount", reps: 5 };
    s = addSetReducer(s, { type: "adjustReps", delta: 1 });
    expect(s.reps).toBe(6);
    s = addSetReducer(s, { type: "adjustReps", delta: -100 });
    expect(s.reps).toBe(0);
  });

  it("back goes amount → exercise → category", () => {
    let s: AddSetState = { ...initialAddSetState, stage: "amount", categoryId: "c", exerciseId: "e" };
    s = addSetReducer(s, { type: "back" });
    expect(s.stage).toBe("exercise");
    s = addSetReducer(s, { type: "back" });
    expect(s.stage).toBe("category");
    expect(s.categoryId).toBeUndefined();
  });

  it("savedKeepExercise clears touched so next exercise switch reseeds", () => {
    const s = addSetReducer(
      { ...initialAddSetState, stage: "amount", touched: true },
      { type: "savedKeepExercise" },
    );
    expect(s.touched).toBe(false);
  });
});
