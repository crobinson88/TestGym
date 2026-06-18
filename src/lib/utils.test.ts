import { describe, expect, it } from "vitest";
import {
  addDays,
  cn,
  formatFull,
  formatVolume,
  formatWeight,
  relativeDay,
  roundToHalf,
  todayIsoDate,
  weekStart,
} from "./utils";

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
    expect(cn("text-sm", false && "text-lg", "font-bold")).toBe("text-sm font-bold");
  });
});

describe("todayIsoDate", () => {
  it("formats yyyy-mm-dd in local time", () => {
    const d = new Date(2026, 4, 19);
    expect(todayIsoDate(d)).toBe("2026-05-19");
  });

  it("zero-pads month and day", () => {
    expect(todayIsoDate(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

describe("formatWeight", () => {
  it("strips trailing zeros and decimal", () => {
    expect(formatWeight(225)).toBe("225");
    expect(formatWeight(227.5)).toBe("227.5");
    expect(formatWeight(0)).toBe("0");
    expect(formatWeight(100.25)).toBe("100.25");
  });
});

describe("roundToHalf", () => {
  it("rounds to nearest 0.5", () => {
    expect(roundToHalf(225.3)).toBe(225.5);
    expect(roundToHalf(225.1)).toBe(225);
    expect(roundToHalf(0)).toBe(0);
  });
});

describe("formatVolume", () => {
  it("formats by magnitude", () => {
    expect(formatVolume(450)).toBe("450");
    expect(formatVolume(1_250)).toBe("1.3K");
    expect(formatVolume(12_500)).toBe("13K");
    expect(formatVolume(1_247_882)).toBe("1.25M");
  });
});

describe("formatFull", () => {
  it("shows the full value with separators, no abbreviation or rounding", () => {
    expect(formatFull(450)).toBe("450");
    expect(formatFull(1_247_882)).toBe("1,247,882");
    expect(formatFull(12_500)).toBe("12,500");
    expect(formatFull(1234.5)).toBe("1,234.5");
  });
});

describe("relativeDay", () => {
  it("labels today/yesterday/days/weeks", () => {
    expect(relativeDay("2026-05-19", "2026-05-19")).toBe("today");
    expect(relativeDay("2026-05-18", "2026-05-19")).toBe("yesterday");
    expect(relativeDay("2026-05-17", "2026-05-19")).toBe("2d ago");
    expect(relativeDay("2026-05-12", "2026-05-19")).toBe("1w ago");
  });
});

describe("addDays / weekStart", () => {
  it("addDays moves the day forward and backward", () => {
    expect(addDays("2026-05-19", 1)).toBe("2026-05-20");
    expect(addDays("2026-05-19", -1)).toBe("2026-05-18");
    expect(addDays("2026-05-31", 1)).toBe("2026-06-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("weekStart returns the Monday of the week containing the date", () => {
    expect(weekStart("2026-05-19")).toBe("2026-05-18");
    expect(weekStart("2026-05-18")).toBe("2026-05-18");
    expect(weekStart("2026-05-24")).toBe("2026-05-18");
    expect(weekStart("2026-05-25")).toBe("2026-05-25");
  });
});
