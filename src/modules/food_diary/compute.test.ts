import { describe, expect, it } from "vitest";
import type { FoodEntryRow } from "@/lib/database.types";
import { goalProgress, groupByDate, sumEntries } from "./compute";

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
