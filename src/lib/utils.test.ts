import { describe, expect, it } from "vitest";
import { cn, todayIsoDate } from "./utils";

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
