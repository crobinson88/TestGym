import { describe, expect, it } from "vitest";
import { dayOffMap } from "./dayOff";
import type { DailyHabitRow } from "./database.types";

const row = (patch: Partial<DailyHabitRow>): DailyHabitRow => ({
  id: "id",
  habit_date: "2026-09-02",
  early_start: null,
  early_bed: null,
  day_off: false,
  day_off_reason: null,
  client_id: null,
  user_id: null,
  created_at: "2026-09-02T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  deleted_at: null,
  ...patch,
});

describe("dayOffMap", () => {
  it("keeps the reason on a day marked off", () => {
    const map = dayOffMap([row({ day_off: true, day_off_reason: "Sick" })]);
    expect(map.get("2026-09-02")).toBe("Sick");
  });

  it("keeps a day off with no reason, valued null", () => {
    const map = dayOffMap([row({ day_off: true })]);
    expect(map.has("2026-09-02")).toBe(true);
    expect(map.get("2026-09-02")).toBeNull();
  });

  it("ignores days that aren't marked off", () => {
    expect(dayOffMap([row({ early_start: true })]).size).toBe(0);
  });

  it("ignores soft-deleted rows", () => {
    const rows = [row({ day_off: true, deleted_at: "2026-09-03T00:00:00Z" })];
    expect(dayOffMap(rows).size).toBe(0);
  });

  it("takes the newest live row when a day has duplicates", () => {
    const rows = [
      row({ id: "a", day_off: true, day_off_reason: "Sick" }),
      row({ id: "b", day_off: false, updated_at: "2026-09-02T09:00:00Z" }),
    ];
    expect(dayOffMap(rows).size).toBe(0);
    expect(dayOffMap([...rows].reverse()).size).toBe(0);
  });
});
