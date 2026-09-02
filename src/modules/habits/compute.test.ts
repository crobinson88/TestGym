import { describe, expect, it } from "vitest";
import { ACTION_TARGET } from "@/modules/tdl/targets";
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
  firstSlot: new Map(),
  firstBedSlot: new Map(),
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

// Slots are 15 minutes: slot 0 starts 00:00, so slot n starts at n × 15 minutes.
const slotAt = (hour: number, minute = 0) => (hour * 60 + minute) / 15;

describe("5:30 column — time logged before 6am", () => {
  const day = (firstSlot: number) =>
    buildHabitRows(["2026-08-31"], src({ firstSlot: new Map([["2026-08-31", firstSlot]]) }))[0]
      .cells.early_start;

  it("hits when the first slot starts before 6am", () => {
    expect(day(slotAt(5, 30))).toMatchObject({ state: "hit", text: "Y" });
    // 05:45–06:00 still starts before 6am.
    expect(day(slotAt(5, 45))).toMatchObject({ state: "hit", text: "Y" });
  });

  it("misses when the first slot starts at 6am or later", () => {
    expect(day(slotAt(6))).toMatchObject({ state: "miss", text: "N" });
    expect(day(slotAt(9))).toMatchObject({ state: "miss", text: "N" });
  });

  it("leaves a day with no time logged blank", () => {
    const rows = buildHabitRows(["2026-08-31"], empty);
    expect(rows[0].cells.early_start.state).toBe("none");
  });

  it("lets a hand-set mark override the time log", () => {
    const rows = buildHabitRows(
      ["2026-08-31"],
      src({
        firstSlot: new Map([["2026-08-31", slotAt(5, 30)]]),
        marks: new Map([["2026-08-31", { early_start: false, early_bed: null }]]),
      }),
    );
    expect(rows[0].cells.early_start).toMatchObject({ state: "miss", text: "N" });
    expect(rows[0].marks.early_start).toBe(false);
  });
});

describe("9:30 column — Bed logged by 9:30pm", () => {
  const day = (firstBedSlot: number) =>
    buildHabitRows(
      ["2026-08-31"],
      src({ firstBedSlot: new Map([["2026-08-31", firstBedSlot]]) }),
    )[0].cells.early_bed;

  it("hits when the first Bed slot starts at or before 9:30pm", () => {
    expect(day(slotAt(21, 15))).toMatchObject({ state: "hit", text: "Y" });
    expect(day(slotAt(21, 30))).toMatchObject({ state: "hit", text: "Y" });
  });

  it("misses when Bed starts after 9:30pm", () => {
    expect(day(slotAt(21, 45))).toMatchObject({ state: "miss", text: "N" });
    expect(day(slotAt(23))).toMatchObject({ state: "miss", text: "N" });
  });

  it("leaves a day with no Bed logged blank", () => {
    const rows = buildHabitRows(
      ["2026-08-31"],
      src({ firstSlot: new Map([["2026-08-31", slotAt(9)]]) }),
    );
    expect(rows[0].cells.early_bed.state).toBe("none");
  });

  it("lets a hand-set mark override the time log", () => {
    const rows = buildHabitRows(
      ["2026-08-31"],
      src({
        firstBedSlot: new Map([["2026-08-31", slotAt(23)]]),
        marks: new Map([["2026-08-31", { early_start: null, early_bed: true }]]),
      }),
    );
    expect(rows[0].cells.early_bed).toMatchObject({ state: "hit", text: "Y" });
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
      ["2026-08-31", { total: 5, done: 2, active: 3, priorityTotal: 2, priorityActive: 1 }],
    ]);
    const rows = buildHabitRows(["2026-08-31"], src({ tdl }));
    expect(rows[0].cells.priority_task.state).toBe("hit");
  });

  // The Task column reads the same number as the to-do list's Action Items pie:
  // items worked or done over the daily target, not a share of the day's list.
  it("scores task completion against the action-item target", () => {
    const tdl = new Map([
      ["2026-08-31", { total: 5, done: 2, active: 3, priorityTotal: 2, priorityActive: 1 }],
    ]);
    const rows = buildHabitRows(["2026-08-31"], src({ tdl }));
    expect(ACTION_TARGET).toBe(30);
    expect(rows[0].cells.task_completion).toMatchObject({ state: "miss", text: "10%" });
  });

  it("hits task completion once the target is met", () => {
    const tdl = new Map([
      [
        "2026-08-31",
        { total: 40, done: 30, active: ACTION_TARGET, priorityTotal: 0, priorityActive: 0 },
      ],
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
  const firstSlot = new Map([
    ["2026-08-29", slotAt(8)],
    ["2026-08-30", slotAt(5, 30)],
    ["2026-08-31", slotAt(5, 45)],
  ]);
  const rows = buildHabitRows(["2026-08-29", "2026-08-30", "2026-08-31"], src({ firstSlot }));

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
