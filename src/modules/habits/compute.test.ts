import { describe, expect, it } from "vitest";
import {
  buildHabitRows,
  currentStreak,
  gymGrowthCell,
  habitDates,
  isWeekend,
  nextMarkValue,
  tallyColumns,
  type HabitSources,
} from "./compute";

const empty: HabitSources = {
  marks: new Map(),
  hours: new Map(),
  tdl: new Map(),
  gymVolume: new Map(),
  today: "2026-09-01",
};

const src = (patch: Partial<HabitSources>): HabitSources => ({ ...empty, ...patch });

describe("habitDates", () => {
  it("returns the window oldest-first, ending on the anchor", () => {
    expect(habitDates("2026-09-01", 3)).toEqual(["2026-08-30", "2026-08-31", "2026-09-01"]);
  });
});

describe("isWeekend", () => {
  it("flags Saturday and Sunday", () => {
    expect(isWeekend("2026-08-29")).toBe(true);
    expect(isWeekend("2026-08-30")).toBe(true);
    expect(isWeekend("2026-08-31")).toBe(false);
  });
});

describe("manual habit cells", () => {
  it("renders Y / N / blank from the stored flags", () => {
    const rows = buildHabitRows(
      ["2026-08-31"],
      src({
        marks: new Map([["2026-08-31", { early_start: true, early_bed: false }]]),
      }),
    );
    expect(rows[0].cells.early_start).toMatchObject({ state: "hit", text: "Y" });
    expect(rows[0].cells.early_bed).toMatchObject({ state: "miss", text: "N" });
  });

  it("leaves an unmarked day blank", () => {
    const rows = buildHabitRows(["2026-08-31"], empty);
    expect(rows[0].cells.early_start.state).toBe("none");
  });
});

describe("rolling hours cell", () => {
  it("hits at the 70h target across the trailing 7 days", () => {
    const hours = new Map<string, number>();
    for (let d = 26; d <= 31; d++) hours.set(`2026-08-${d}`, 12);
    const rows = buildHabitRows(["2026-08-31"], src({ hours }));
    expect(rows[0].cells.rolling_hours).toMatchObject({ state: "hit", text: "72" });
  });

  it("misses below target and ignores days outside the window", () => {
    const hours = new Map([
      ["2026-08-20", 100],
      ["2026-08-31", 8],
    ]);
    const rows = buildHabitRows(["2026-08-31"], src({ hours }));
    expect(rows[0].cells.rolling_hours).toMatchObject({ state: "miss", text: "8" });
  });
});

describe("to-do cells", () => {
  it("hits priority when a ranked item was worked or done", () => {
    const tdl = new Map([
      ["2026-08-31", { total: 5, done: 2, priorityTotal: 2, priorityActive: 1 }],
    ]);
    const rows = buildHabitRows(["2026-08-31"], src({ tdl }));
    expect(rows[0].cells.priority_task.state).toBe("hit");
    expect(rows[0].cells.task_completion).toMatchObject({ state: "miss", text: "40%" });
  });

  it("hits task completion only when the whole list is done", () => {
    const tdl = new Map([
      ["2026-08-31", { total: 3, done: 3, priorityTotal: 0, priorityActive: 0 }],
    ]);
    const rows = buildHabitRows(["2026-08-31"], src({ tdl }));
    expect(rows[0].cells.task_completion).toMatchObject({ state: "hit", text: "100%" });
    expect(rows[0].cells.priority_task.state).toBe("miss");
  });

  it("leaves a day with no list blank", () => {
    const rows = buildHabitRows(["2026-08-31"], empty);
    expect(rows[0].cells.task_completion.state).toBe("none");
    expect(rows[0].cells.priority_task.state).toBe("none");
  });
});

describe("gymGrowthCell", () => {
  // sum(volume over the 5 days ending on the date) / sum(the 5 days ending the day before)
  it("hits when the rolling 5-day volume grows", () => {
    const vol = new Map<string, number>();
    for (let d = 22; d <= 31; d++) vol.set(`2026-08-${d}`, 1000);
    vol.set("2026-08-31", 2000);
    expect(gymGrowthCell(vol, "2026-08-31")).toMatchObject({ state: "hit", text: "1.20" });
  });

  it("misses when it shrinks", () => {
    const vol = new Map<string, number>();
    for (let d = 22; d <= 30; d++) vol.set(`2026-08-${d}`, 1000);
    expect(gymGrowthCell(vol, "2026-08-31")).toMatchObject({ state: "miss", text: "0.80" });
  });

  it("is blank when the prior window is empty (the sheet's #DIV/0!)", () => {
    const vol = new Map([["2026-08-31", 5000]]);
    expect(gymGrowthCell(vol, "2026-08-31").state).toBe("none");
  });
});

describe("future days", () => {
  it("shows nothing for days after today", () => {
    const rows = buildHabitRows(
      ["2026-09-02"],
      src({ marks: new Map([["2026-09-02", { early_start: true, early_bed: true }]]) }),
    );
    expect(rows[0].isFuture).toBe(true);
    expect(rows[0].cells.early_start.state).toBe("none");
  });
});

describe("tallyColumns / currentStreak", () => {
  const marks = new Map([
    ["2026-08-29", { early_start: false, early_bed: null }],
    ["2026-08-30", { early_start: true, early_bed: null }],
    ["2026-08-31", { early_start: true, early_bed: null }],
  ]);
  const rows = buildHabitRows(["2026-08-29", "2026-08-30", "2026-08-31"], src({ marks }));

  it("counts hits over marked days only", () => {
    const tally = tallyColumns(rows).find((t) => t.key === "early_start")!;
    expect(tally).toMatchObject({ hit: 2, marked: 3 });
    expect(tallyColumns(rows).find((t) => t.key === "early_bed")).toMatchObject({ marked: 0 });
  });

  it("counts the streak back from the most recent day", () => {
    expect(currentStreak(rows, "early_start")).toBe(2);
    expect(currentStreak(rows, "early_bed")).toBe(0);
  });
});

describe("nextMarkValue", () => {
  it("cycles blank → Y → N → blank", () => {
    expect(nextMarkValue(null)).toBe(true);
    expect(nextMarkValue(true)).toBe(false);
    expect(nextMarkValue(false)).toBe(null);
  });
});
