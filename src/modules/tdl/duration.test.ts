import { describe, expect, it } from "vitest";
import {
  describeDurationRange,
  durationRangePreset,
  isDurationRangeActive,
  matchesDurationRange,
  matchesItemDuration,
  matchingDurationPreset,
  normaliseDurationRange,
  prettyDuration,
} from "./duration";
import type { LocalTdlItem } from "./types";

function item(time_estimate_min: number | null): Pick<LocalTdlItem, "time_estimate_min"> {
  return { time_estimate_min };
}

describe("prettyDuration", () => {
  it("renders durations", () => {
    expect(prettyDuration(45)).toBe("45m");
    expect(prettyDuration(60)).toBe("1h");
    expect(prettyDuration(90)).toBe("1h 30m");
  });
});

describe("duration range", () => {
  it("treats an empty window as no filter", () => {
    const empty = { minMin: null, maxMin: null };
    expect(isDurationRangeActive(empty)).toBe(false);
    expect(matchesDurationRange(5, empty)).toBe(true);
    expect(matchesDurationRange(600, empty)).toBe(true);
    expect(describeDurationRange(empty)).toBe("Any length");
  });

  it("matches inclusively on both ends", () => {
    const range = { minMin: 30, maxMin: 60 };
    expect(matchesDurationRange(29, range)).toBe(false);
    expect(matchesDurationRange(30, range)).toBe(true);
    expect(matchesDurationRange(45, range)).toBe(true);
    expect(matchesDurationRange(60, range)).toBe(true);
    expect(matchesDurationRange(61, range)).toBe(false);
  });

  it("leaves an open end unbounded", () => {
    expect(matchesDurationRange(5, { minMin: null, maxMin: 15 })).toBe(true);
    expect(matchesDurationRange(16, { minMin: null, maxMin: 15 })).toBe(false);
    expect(matchesDurationRange(720, { minMin: 60, maxMin: null })).toBe(true);
    expect(matchesDurationRange(59, { minMin: 60, maxMin: null })).toBe(false);
  });

  it("swaps ends given the wrong way round", () => {
    expect(normaliseDurationRange({ minMin: 90, maxMin: 15 })).toEqual({ minMin: 15, maxMin: 90 });
    expect(matchesDurationRange(30, { minMin: 90, maxMin: 15 })).toBe(true);
  });

  it("reads a blank or non-positive end as open", () => {
    expect(normaliseDurationRange({ minMin: 0, maxMin: 45 })).toEqual({ minMin: null, maxMin: 45 });
    expect(isDurationRangeActive({ minMin: 0, maxMin: null })).toBe(false);
  });

  it("recognises its own presets", () => {
    expect(matchingDurationPreset(durationRangePreset("q15"))).toBe("q15");
    expect(matchingDurationPreset(durationRangePreset("half"))).toBe("half");
    expect(matchingDurationPreset({ minMin: 20, maxMin: 40 })).toBeNull();
    expect(describeDurationRange(durationRangePreset("hour"))).toBe("1h or more");
  });

  it("offers a 5 – 15m window", () => {
    const preset = durationRangePreset("q5_15");
    expect(preset).toEqual({ minMin: 5, maxMin: 15 });
    expect(matchesDurationRange(4, preset)).toBe(false);
    expect(matchesDurationRange(5, preset)).toBe(true);
    expect(matchesDurationRange(15, preset)).toBe(true);
    expect(matchesDurationRange(16, preset)).toBe(false);
    expect(describeDurationRange(preset)).toBe("5 – 15m");
  });

  it("describes a hand-typed window", () => {
    expect(describeDurationRange({ minMin: 20, maxMin: 90 })).toBe("20m – 1h 30m");
    expect(describeDurationRange({ minMin: 45, maxMin: 45 })).toBe("45m");
    expect(describeDurationRange({ minMin: null, maxMin: 120 })).toBe("2h or less");
    expect(describeDurationRange({ minMin: 90, maxMin: null })).toBe("1h 30m or more");
  });
});

describe("matchesItemDuration", () => {
  it("passes everything through when the window is empty", () => {
    const empty = { minMin: null, maxMin: null };
    expect(matchesItemDuration(item(15), empty)).toBe(true);
    expect(matchesItemDuration(item(null), empty)).toBe(true);
  });

  it("filters on the task's own estimate", () => {
    const range = { minMin: 5, maxMin: 15 };
    expect(matchesItemDuration(item(5), range)).toBe(true);
    expect(matchesItemDuration(item(15), range)).toBe(true);
    expect(matchesItemDuration(item(30), range)).toBe(false);
  });

  it("hides a task with no time requirement while the window is on", () => {
    expect(matchesItemDuration(item(null), { minMin: null, maxMin: 30 })).toBe(false);
    expect(matchesItemDuration(item(null), { minMin: 60, maxMin: null })).toBe(false);
  });
});
