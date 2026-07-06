import { afterEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { GymDB } from "./db";
import { db } from "./db";
import { useDashboardStats } from "./hooks";
import { makeCategory, makeExercise, makeSet } from "./sync/test-helpers";
import { todayIsoDate, weekStart, addDays } from "./utils";

async function reset(d: GymDB) {
  await d.transaction("rw", [d.sets, d.exercises, d.categories], async () => {
    await d.sets.clear();
    await d.exercises.clear();
    await d.categories.clear();
  });
}

afterEach(async () => {
  await reset(db);
});

describe("useDashboardStats", () => {
  it("aggregates today / last / max sessions and weekly stats correctly", async () => {
    const today = todayIsoDate();
    const yesterday = addDays(today, -1);
    const eightDaysAgo = addDays(today, -8);
    const back = makeCategory({ name: "Back", sort_order: 0 });
    const chest = makeCategory({ name: "Chest", sort_order: 1 });
    await db.categories.put({ ...back, sync_status: "synced" });
    await db.categories.put({ ...chest, sync_status: "synced" });

    const exBack = makeExercise(back.id, { name: "Pull-up" });
    const exChest = makeExercise(chest.id, { name: "Bench Press" });
    await db.exercises.put({ ...exBack, sync_status: "synced" });
    await db.exercises.put({ ...exChest, sync_status: "synced" });

    const synced = (s: ReturnType<typeof makeSet>) => ({
      ...s,
      sync_status: "synced" as const,
      sync_attempts: 0,
      sync_last_error: null,
    });

    await db.sets.put(
      synced(makeSet(exBack.id, back.id, { weight: 100, reps: 10, performed_at: today })),
    );
    await db.sets.put(
      synced(makeSet(exChest.id, chest.id, { weight: 50, reps: 5, performed_at: today })),
    );
    await db.sets.put(
      synced(
        makeSet(exBack.id, back.id, { weight: 200, reps: 10, performed_at: yesterday }),
      ),
    );
    await db.sets.put(
      synced(
        makeSet(exBack.id, back.id, { weight: 300, reps: 5, performed_at: eightDaysAgo }),
      ),
    );

    const { result } = renderHook(() => useDashboardStats());
    await waitFor(() => expect(result.current).not.toBeUndefined());

    const s = result.current!;
    expect(s.today.volume).toBe(100 * 10 + 50 * 5);
    expect(s.today.sets).toBe(2);
    expect(s.today.byCategory.Back).toBe(1000);
    expect(s.today.byCategory.Chest).toBe(250);

    expect(s.lastSession?.date).toBe(yesterday);
    expect(s.lastSession?.volume).toBe(2000);

    expect(s.maxSession?.volume).toBe(2000);
    expect(s.maxSession?.date).toBe(yesterday);

    expect(s.allTime.sets).toBe(4);
    expect(s.allTime.volume).toBe(1000 + 250 + 2000 + 1500);
    expect(s.allTime.days).toBe(3);

    const thisWeekStart = weekStart(today);
    const lastWeek = s.weekly.find((w) => w.week_start === addDays(thisWeekStart, -7));
    expect(lastWeek).toBeDefined();
  });

  it("shifts the weekly window back by whole weeks with a negative offset", async () => {
    const today = todayIsoDate();
    const thisWeekStart = weekStart(today);
    const nineDaysAgo = addDays(today, -9);
    const back = makeCategory({ name: "Back", sort_order: 0 });
    await db.categories.put({ ...back, sync_status: "synced" });
    const exBack = makeExercise(back.id, { name: "Pull-up" });
    await db.exercises.put({ ...exBack, sync_status: "synced" });
    await db.sets.put({
      ...makeSet(exBack.id, back.id, { weight: 100, reps: 10, performed_at: nineDaysAgo }),
      sync_status: "synced" as const,
      sync_attempts: 0,
      sync_last_error: null,
    });

    const { result } = renderHook(() => useDashboardStats(-1));
    await waitFor(() => expect(result.current).not.toBeUndefined());

    const s = result.current!;
    expect(s.weekly).toHaveLength(8);
    // Window ends one week earlier than the current week.
    expect(s.weekly[s.weekly.length - 1].week_start).toBe(addDays(thisWeekStart, -7));
    // The set two weeks back now lands inside the shifted window.
    const bucket = s.weekly.find((w) => w.week_start === weekStart(nineDaysAgo));
    expect(bucket?.total).toBe(1000);
  });

  it("handles an empty set table", async () => {
    const { result } = renderHook(() => useDashboardStats());
    await waitFor(() => expect(result.current).not.toBeUndefined());
    const s = result.current!;
    expect(s.today.volume).toBe(0);
    expect(s.lastSession).toBeNull();
    expect(s.maxSession).toBeNull();
    expect(s.allTime).toEqual({ sets: 0, volume: 0, days: 0 });
    expect(s.weekly).toHaveLength(8);
  });
});
