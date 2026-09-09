import { describe, expect, it } from "vitest";
import {
  dailyHours,
  formatHours,
  formatMdy,
  hoursOnDate,
  hoursPerDay,
  nextTaskColor,
  rollingHours,
  slotEndLabel,
  SLOTS_PER_DAY,
  TASK_PALETTE,
  taskHoursOnDate,
  weeklyHours,
  workHoursInRange,
  workHoursOnDate,
} from "./time";

describe("slotEndLabel", () => {
  it("labels with the END time of each 15-min slot", () => {
    expect(slotEndLabel(0)).toBe("00:15");
    expect(slotEndLabel(1)).toBe("00:30");
    expect(slotEndLabel(3)).toBe("01:00");
    expect(slotEndLabel(47)).toBe("12:00");
    expect(slotEndLabel(95)).toBe("24:00");
  });

  it("covers 96 slots across the day", () => {
    expect(SLOTS_PER_DAY).toBe(96);
  });
});

describe("formatMdy", () => {
  it("renders M/D/YYYY without zero padding", () => {
    expect(formatMdy("2026-05-26")).toBe("5/26/2026");
    expect(formatMdy("2026-01-03")).toBe("1/3/2026");
  });
});

describe("formatHours", () => {
  it("strips trailing zeros", () => {
    expect(formatHours(0)).toBe("0");
    expect(formatHours(2)).toBe("2");
    expect(formatHours(0.25)).toBe("0.25");
    expect(formatHours(1.5)).toBe("1.5");
  });
});

describe("nextTaskColor", () => {
  it("returns the first unused palette color", () => {
    expect(nextTaskColor([])).toBe(TASK_PALETTE[0]);
    expect(nextTaskColor([TASK_PALETTE[0]])).toBe(TASK_PALETTE[1]);
    expect(nextTaskColor([TASK_PALETTE[1], TASK_PALETTE[0]])).toBe(TASK_PALETTE[2]);
  });

  it("wraps around when the palette is exhausted", () => {
    const all = [...TASK_PALETTE];
    expect(nextTaskColor(all)).toBe(TASK_PALETTE[all.length % TASK_PALETTE.length]);
  });
});

describe("totals", () => {
  const tasks = new Map([
    ["w", { id: "w", is_work: true }],
    ["p", { id: "p", is_work: false }],
  ]);
  const allocs = [
    { date: "2026-05-26", task_id: "w" },
    { date: "2026-05-26", task_id: "w" },
    { date: "2026-05-26", task_id: "p" },
    { date: "2026-05-25", task_id: "w" },
    { date: "2026-05-25", task_id: "w" },
    { date: "2026-05-25", task_id: "w" },
    { date: "2026-05-25", task_id: "w" },
    { date: "2026-05-20", task_id: "w" },
  ];

  it("hoursOnDate sums all slots * 0.25", () => {
    expect(hoursOnDate(allocs, "2026-05-26")).toBeCloseTo(0.75);
    expect(hoursOnDate(allocs, "2026-05-25")).toBeCloseTo(1.0);
    expect(hoursOnDate(allocs, "2026-04-01")).toBe(0);
  });

  it("workHoursOnDate filters by isWork", () => {
    expect(workHoursOnDate(allocs, tasks, "2026-05-26")).toBeCloseTo(0.5);
    expect(workHoursOnDate(allocs, tasks, "2026-05-25")).toBeCloseTo(1.0);
  });

  it("taskHoursOnDate sums by single task", () => {
    expect(taskHoursOnDate(allocs, "p", "2026-05-26")).toBeCloseTo(0.25);
    expect(taskHoursOnDate(allocs, "w", "2026-05-26")).toBeCloseTo(0.5);
    expect(taskHoursOnDate(allocs, null, "2026-05-26")).toBe(0);
  });

  it("workHoursInRange spans inclusive date range", () => {
    expect(workHoursInRange(allocs, tasks, "2026-05-20", "2026-05-26")).toBeCloseTo(1.75);
    expect(workHoursInRange(allocs, tasks, "2026-05-25", "2026-05-26")).toBeCloseTo(1.5);
  });
});

describe("hours aggregation (all logged hours)", () => {
  const allocs = [
    { date: "2026-05-26", task_id: "w" },
    { date: "2026-05-26", task_id: "p" },
    { date: "2026-05-25", task_id: "w" },
    { date: "2026-05-25", task_id: "w" },
    { date: "2026-05-20", task_id: "w" },
    { date: "2026-05-18", task_id: "p" },
  ];

  it("hoursPerDay counts every allocation regardless of work flag", () => {
    const perDay = hoursPerDay(allocs);
    expect(perDay.get("2026-05-26")).toBeCloseTo(0.5);
    expect(perDay.get("2026-05-25")).toBeCloseTo(0.5);
    expect(perDay.get("2026-05-20")).toBeCloseTo(0.25);
    expect(perDay.get("2026-04-01")).toBeUndefined();
  });

  it("weeklyHours sums each Mon-Sun week from its start", () => {
    const perDay = hoursPerDay(allocs);
    // Week of 2026-05-25 (Mon) covers 25..31 -> 0.5 + 0.5 = 1.0
    // Week of 2026-05-18 (Mon) covers 18..24 -> 0.25 (the 18th) + 0.25 (the 20th) = 0.5
    const weeks = weeklyHours(perDay, ["2026-05-18", "2026-05-25"]);
    // Memorial Day (the 25th) has hours logged against it, so it counts like
    // any other day and the week isn't flagged as holiday-shortened.
    expect(weeks).toEqual([
      { week_start: "2026-05-18", hours: 0.5, holidays: 0 },
      { week_start: "2026-05-25", hours: 1.0, holidays: 0 },
    ]);
  });

  it("dailyHours maps each date to its own hours, zero-filling gaps", () => {
    const perDay = hoursPerDay(allocs);
    const points = dailyHours(perDay, ["2026-05-24", "2026-05-25", "2026-05-26"]);
    expect(points).toEqual([
      { date: "2026-05-24", hours: 0, holiday: null },
      { date: "2026-05-25", hours: 0.5, holiday: null },
      { date: "2026-05-26", hours: 0.5, holiday: null },
    ]);
  });

  it("rollingHours sums the trailing window ending on each date", () => {
    const perDay = hoursPerDay(allocs);
    const points = rollingHours(perDay, ["2026-05-25", "2026-05-26"], 7);
    // Memorial Day (the 25th) is stepped over even with hours logged on it.
    // 25th: window 18..24 -> 0.25 (18th) + 0.25 (20th) = 0.5
    // 26th: window 19..26 minus the 25th -> 0.25 (20th) + 0.5 (26th) = 0.75
    expect(points).toEqual([
      { date: "2026-05-25", hours: 0.5, holiday: "Memorial Day" },
      { date: "2026-05-26", hours: 0.75, holiday: null },
    ]);
  });
});

describe("US public holidays in the hours stats", () => {
  // Thanksgiving 2026 is Thursday the 26th.
  const THANKSGIVING = "2026-11-26";

  it("extends the rolling window past an empty holiday", () => {
    const perDay = new Map<string, number>();
    for (let d = 20; d <= 25; d++) perDay.set(`2026-11-${d}`, 10);
    const [point] = rollingHours(perDay, [THANKSGIVING], 6);
    // Without the skip the window would be 21..26 and miss the 20th.
    expect(point).toEqual({ date: THANKSGIVING, hours: 60, holiday: "Thanksgiving Day" });
  });

  it("steps over a holiday even when hours were logged on it", () => {
    // A few hours on Labor Day shouldn't take one of the window's seven slots:
    // the window ending on the holiday still covers the seven days before it.
    const perDay = new Map<string, number>([[THANKSGIVING, 4]]);
    for (let d = 19; d <= 25; d++) perDay.set(`2026-11-${d}`, 10);
    const [point] = rollingHours(perDay, [THANKSGIVING], 7);
    expect(point).toEqual({ date: THANKSGIVING, hours: 70, holiday: "Thanksgiving Day" });
    const [next] = rollingHours(perDay, ["2026-11-27"], 7);
    // The next day's window drops the 19th, not the holiday's hours.
    expect(next).toEqual({ date: "2026-11-27", hours: 60, holiday: null });
  });

  it("flags an empty holiday on the daily series", () => {
    const points = dailyHours(new Map(), [THANKSGIVING, "2026-11-27"]);
    expect(points.map((p) => p.holiday)).toEqual(["Thanksgiving Day", null]);
  });

  it("counts the empty holidays in a week", () => {
    const [week] = weeklyHours(new Map([["2026-11-27", 8]]), ["2026-11-23"]);
    expect(week).toEqual({ week_start: "2026-11-23", hours: 8, holidays: 1 });
  });
});
