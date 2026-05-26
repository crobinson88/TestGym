import { describe, expect, it } from "vitest";
import {
  formatHours,
  formatMdy,
  hoursOnDate,
  nextTaskColor,
  slotEndLabel,
  SLOTS_PER_DAY,
  TASK_PALETTE,
  taskHoursOnDate,
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
