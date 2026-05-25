import { describe, expect, it } from "vitest";
import { LIFTING_MET, MINUTES_PER_SET, liftingMetMinutes } from "./met";

describe("liftingMetMinutes", () => {
  it("multiplies sets by MINUTES_PER_SET and LIFTING_MET", () => {
    expect(liftingMetMinutes(10)).toBe(10 * MINUTES_PER_SET * LIFTING_MET);
    expect(liftingMetMinutes(20)).toBe(20 * MINUTES_PER_SET * LIFTING_MET);
  });

  it("returns 0 for zero or negative", () => {
    expect(liftingMetMinutes(0)).toBe(0);
    expect(liftingMetMinutes(-5)).toBe(0);
  });

  it("matches the documented defaults", () => {
    expect(LIFTING_MET).toBe(6.0);
    expect(MINUTES_PER_SET).toBe(1);
  });
});
