import { describe, expect, it } from "vitest";
import type { FoodEntryRow } from "@/lib/database.types";
import {
  adjustedCalorieGoal,
  baselineBurn,
  cardioSessionKcal,
  cmToFtIn,
  dailyBalance,
  exerciseKcalFromMetMinutes,
  ftInToCm,
  goalProgress,
  groupByDate,
  lbToKg,
  mifflinBmr,
  recentFoods,
  sumEntries,
} from "./compute";

function entry(over: Partial<FoodEntryRow> = {}): FoodEntryRow {
  return {
    id: crypto.randomUUID(),
    entry_date: "2026-07-16",
    name: "Chicken",
    calories: 200,
    protein: 40,
    client_id: null,
    user_id: null,
    created_at: "2026-07-16T10:00:00.000Z",
    updated_at: "2026-07-16T10:00:00.000Z",
    deleted_at: null,
    ...over,
  };
}

describe("sumEntries", () => {
  it("adds calories and protein and counts rows", () => {
    const totals = sumEntries([
      entry({ calories: 200, protein: 40 }),
      entry({ calories: 150, protein: 12 }),
    ]);
    expect(totals).toEqual({ calories: 350, protein: 52, count: 2 });
  });

  it("returns zeros for an empty day", () => {
    expect(sumEntries([])).toEqual({ calories: 0, protein: 0, count: 0 });
  });
});

describe("groupByDate", () => {
  it("groups by date, newest day first, newest entry first within a day", () => {
    const groups = groupByDate([
      entry({ entry_date: "2026-07-14", created_at: "2026-07-14T08:00:00.000Z" }),
      entry({ entry_date: "2026-07-16", created_at: "2026-07-16T08:00:00.000Z", name: "A" }),
      entry({ entry_date: "2026-07-16", created_at: "2026-07-16T12:00:00.000Z", name: "B" }),
    ]);
    expect(groups.map((g) => g.date)).toEqual(["2026-07-16", "2026-07-14"]);
    expect(groups[0].entries.map((e) => e.name)).toEqual(["B", "A"]);
    expect(groups[0].totals.count).toBe(2);
  });
});

describe("recentFoods", () => {
  it("dedupes by name (case-insensitive), most recent macros win, newest first", () => {
    const foods = recentFoods([
      entry({ name: "Oats", calories: 300, protein: 10, created_at: "2026-07-10T08:00:00.000Z" }),
      entry({ name: "Chicken", calories: 200, protein: 40, created_at: "2026-07-12T12:00:00.000Z" }),
      entry({ name: "oats", calories: 320, protein: 11, created_at: "2026-07-15T08:00:00.000Z" }),
    ]);
    expect(foods).toEqual([
      { name: "oats", calories: 320, protein: 11, lastDate: "2026-07-16" },
      { name: "Chicken", calories: 200, protein: 40, lastDate: "2026-07-16" },
    ]);
  });

  it("excludes the given date so today's own logs don't show", () => {
    const foods = recentFoods(
      [
        entry({ name: "Eggs", entry_date: "2026-07-16", created_at: "2026-07-16T08:00:00.000Z" }),
        entry({ name: "Rice", entry_date: "2026-07-14", created_at: "2026-07-14T08:00:00.000Z" }),
      ],
      { excludeDate: "2026-07-16" },
    );
    expect(foods.map((f) => f.name)).toEqual(["Rice"]);
  });

  it("skips blank names and honours the limit", () => {
    const foods = recentFoods(
      [
        entry({ name: "  ", created_at: "2026-07-15T08:00:00.000Z" }),
        entry({ name: "A", created_at: "2026-07-14T08:00:00.000Z" }),
        entry({ name: "B", created_at: "2026-07-13T08:00:00.000Z" }),
      ],
      { limit: 1 },
    );
    expect(foods.map((f) => f.name)).toEqual(["A"]);
  });
});

describe("goalProgress", () => {
  it("reports fraction met and remaining below goal", () => {
    const p = goalProgress(120, 150);
    expect(p.pct).toBeCloseTo(0.8);
    expect(p.remaining).toBe(30);
    expect(p.over).toBe(false);
  });

  it("clamps pct to 1 and flags over when past goal", () => {
    const p = goalProgress(180, 150);
    expect(p.pct).toBe(1);
    expect(p.remaining).toBe(-30);
    expect(p.over).toBe(true);
  });

  it("treats a goal of 0 as no goal", () => {
    const p = goalProgress(500, 0);
    expect(p).toEqual({ value: 500, goal: 0, pct: 0, remaining: 0, over: false });
  });
});

describe("unit conversions", () => {
  it("converts pounds to kilograms", () => {
    expect(lbToKg(220.462)).toBeCloseTo(100, 2);
  });

  it("converts feet+inches to cm and back", () => {
    expect(ftInToCm(5, 10)).toBeCloseTo(177.8, 5);
    expect(cmToFtIn(177.8)).toEqual({ feet: 5, inches: 10 });
  });
});

describe("mifflinBmr", () => {
  it("computes male BMR", () => {
    expect(mifflinBmr({ sex: "male", age: 38, heightCm: 178, weightKg: 90 })).toBe(1828);
  });

  it("computes female BMR (161 lower)", () => {
    expect(mifflinBmr({ sex: "female", age: 38, heightCm: 178, weightKg: 90 })).toBe(1662);
  });

  it("returns null when a measurement is missing", () => {
    expect(mifflinBmr({ sex: "male", age: null, heightCm: 178, weightKg: 90 })).toBeNull();
    expect(mifflinBmr({ sex: "male", age: 38, heightCm: null, weightKg: 90 })).toBeNull();
    expect(mifflinBmr({ sex: "male", age: 38, heightCm: 178, weightKg: null })).toBeNull();
  });
});

describe("baselineBurn", () => {
  it("scales BMR by the activity factor", () => {
    expect(baselineBurn(1828, 1.2)).toBe(2194);
  });

  it("passes null through", () => {
    expect(baselineBurn(null, 1.2)).toBeNull();
  });
});

describe("exerciseKcalFromMetMinutes", () => {
  it("converts MET-minutes to kcal using body weight", () => {
    expect(exerciseKcalFromMetMinutes(300, 90)).toBe(473);
  });

  it("returns 0 when weight is unknown", () => {
    expect(exerciseKcalFromMetMinutes(300, null)).toBe(0);
  });
});

describe("cardioSessionKcal", () => {
  const base = { calories: null, met_minutes: 300, met_value_snapshot: 10, minutes: 30 };

  it("uses logged calories when present, even without weight", () => {
    expect(cardioSessionKcal({ ...base, calories: 280 }, null)).toBe(280);
    expect(cardioSessionKcal({ ...base, calories: 280 }, 90)).toBe(280);
  });

  it("treats a logged zero as a real value, not missing", () => {
    expect(cardioSessionKcal({ ...base, calories: 0 }, 90)).toBe(0);
  });

  it("falls back to the MET estimate when calories are null", () => {
    expect(cardioSessionKcal({ ...base, calories: null }, 90)).toBe(473);
  });

  it("derives met_minutes from the snapshot when null", () => {
    expect(
      cardioSessionKcal({ calories: null, met_minutes: null, met_value_snapshot: 10, minutes: 30 }, 90),
    ).toBe(473);
  });
});

describe("adjustedCalorieGoal", () => {
  it("adds the exercise burn to the base goal", () => {
    expect(adjustedCalorieGoal(2000, 473)).toBe(2473);
  });

  it("leaves the goal untouched with no exercise", () => {
    expect(adjustedCalorieGoal(2000, 0)).toBe(2000);
  });

  it("never drops below the base goal on a negative burn", () => {
    expect(adjustedCalorieGoal(2000, -100)).toBe(2000);
  });

  it("stays 0 when the base goal is unset", () => {
    expect(adjustedCalorieGoal(0, 473)).toBe(0);
  });
});

describe("dailyBalance", () => {
  it("nets burn against intake (positive = deficit)", () => {
    const b = dailyBalance({ intake: 2000, baseline: 2194, exercise: 473 });
    expect(b.burn).toBe(2667);
    expect(b.net).toBe(667);
  });

  it("leaves burn/net null when baseline is unknown", () => {
    const b = dailyBalance({ intake: 2000, baseline: null, exercise: 473 });
    expect(b.burn).toBeNull();
    expect(b.net).toBeNull();
  });
});
