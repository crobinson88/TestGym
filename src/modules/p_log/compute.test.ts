import { describe, expect, it } from "vitest";
import { formatPMinutes, groupPLogs, monthSummary, parseMinutesInput, type PLogInput } from "./compute";

const row = (
  id: string,
  log_date: string,
  minutes: number | null,
  created_at = `${log_date}T10:00:00Z`,
  deleted_at: string | null = null,
): PLogInput => ({ id, log_date, minutes, created_at, deleted_at });

describe("groupPLogs", () => {
  it("counts instances and sums minutes per day, skipping deleted rows", () => {
    const days = groupPLogs([
      row("a", "2026-11-01", 10),
      row("b", "2026-11-01", null),
      row("c", "2026-11-01", 5, "2026-11-01T09:00:00Z"),
      row("d", "2026-11-02", 20, undefined, "2026-11-02T12:00:00Z"),
    ]);
    const nov1 = days.get("2026-11-01")!;
    expect(nov1.count).toBe(3);
    expect(nov1.minutes).toBe(15);
    expect(nov1.instances.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(days.has("2026-11-02")).toBe(false);
  });
});

describe("monthSummary", () => {
  it("totals only the requested month", () => {
    const days = groupPLogs([
      row("a", "2026-11-01", 10),
      row("b", "2026-11-01", 15),
      row("c", "2026-11-20", null),
      row("d", "2026-10-31", 60),
    ]);
    expect(monthSummary(days, 2026, 11)).toEqual({ activeDays: 2, count: 3, minutes: 25 });
    expect(monthSummary(days, 2026, 10)).toEqual({ activeDays: 1, count: 1, minutes: 60 });
    expect(monthSummary(days, 2026, 9)).toEqual({ activeDays: 0, count: 0, minutes: 0 });
  });
});

describe("formatPMinutes", () => {
  it("formats hours and minutes", () => {
    expect(formatPMinutes(0)).toBe("0m");
    expect(formatPMinutes(45)).toBe("45m");
    expect(formatPMinutes(60)).toBe("1h");
    expect(formatPMinutes(65)).toBe("1h 5m");
  });
});

describe("parseMinutesInput", () => {
  it("reads blank as untimed and clamps to whole non-negative minutes", () => {
    expect(parseMinutesInput("")).toBeNull();
    expect(parseMinutesInput("  ")).toBeNull();
    expect(parseMinutesInput("abc")).toBeNull();
    expect(parseMinutesInput("12")).toBe(12);
    expect(parseMinutesInput("7.6")).toBe(8);
    expect(parseMinutesInput("-3")).toBe(0);
  });
});
