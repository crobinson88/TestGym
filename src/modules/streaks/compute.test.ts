import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/utils";
import {
  BADGE_TIERS,
  STREAK_DEFS,
  buildStreak,
  buildStreaks,
  totalBadgesEarned,
  type StreakSources,
} from "./compute";

const TODAY = "2026-09-05";

// The `n` days ending at `end`, inclusive.
const run = (end: string, n: number) =>
  new Set(Array.from({ length: n }, (_, i) => addDays(end, -i)));

const streak = (days: Iterable<string>, today = TODAY) =>
  buildStreak("gym", new Set(days), today);

describe("current streak", () => {
  it("counts back from today when today is logged", () => {
    expect(streak(run(TODAY, 5)).current).toBe(5);
  });

  it("stays alive on a day that isn't logged yet", () => {
    const s = streak(run(addDays(TODAY, -1), 5));
    expect(s.current).toBe(5);
    expect(s.pendingToday).toBe(true);
  });

  it("breaks once a whole day is missed", () => {
    // Ends two days ago: yesterday was missed outright.
    expect(streak(run(addDays(TODAY, -2), 9)).current).toBe(0);
  });

  it("is zero with no days at all", () => {
    const s = streak([]);
    expect(s).toMatchObject({ current: 0, best: 0, total: 0, lastDate: null, pendingToday: false });
  });

  it("ignores days before a gap", () => {
    const days = new Set([...run(TODAY, 3), ...run(addDays(TODAY, -5), 10)]);
    expect(streak(days).current).toBe(3);
  });
});

describe("best streak", () => {
  it("finds the longest run anywhere in the history", () => {
    const days = new Set([...run(TODAY, 3), ...run("2026-06-01", 12)]);
    expect(streak(days).best).toBe(12);
  });

  it("counts the live run when it is the longest", () => {
    expect(streak(run(TODAY, 40)).best).toBe(40);
  });

  it("does not join runs separated by a gap", () => {
    const days = new Set([...run(TODAY, 4), ...run(addDays(TODAY, -5), 4)]);
    expect(streak(days).best).toBe(4);
  });
});

describe("badges", () => {
  it("earns a tier once it has ever been reached, and keeps it after a break", () => {
    // A 30-day run that ended months ago, nothing since.
    const s = streak(run("2026-06-01", 30));
    expect(s.current).toBe(0);
    expect(s.badges.filter((b) => b.earned).map((b) => b.days)).toEqual([7, 14, 30]);
    expect(s.badges.every((b) => !b.held)).toBe(true);
  });

  it("holds the tiers the live run covers", () => {
    const s = streak(run(TODAY, 14));
    expect(s.badges.filter((b) => b.held).map((b) => b.days)).toEqual([7, 14]);
  });

  it("covers 7, 14, 30 and 90 days", () => {
    expect(BADGE_TIERS.map((t) => t.days)).toEqual([7, 14, 30, 90]);
  });
});

describe("next badge", () => {
  it("points at the first tier above the current streak", () => {
    expect(streak(run(TODAY, 5)).next).toEqual({ days: 7, label: "1 week", remaining: 2 });
    expect(streak(run(TODAY, 14)).next).toEqual({ days: 30, label: "1 month", remaining: 16 });
  });

  it("is null once every tier is held", () => {
    expect(streak(run(TODAY, 90)).next).toBeNull();
  });
});

describe("buildStreaks", () => {
  const sources = (patch: Partial<StreakSources>): StreakSources => ({
    today: TODAY,
    french: new Set(),
    gym: new Set(),
    tgm: new Set(),
    getbuddy: new Set(),
    smoke_free: new Set(),
    ...patch,
  });

  it("builds one streak per definition, in order", () => {
    const out = buildStreaks(sources({}));
    expect(out.map((s) => s.key)).toEqual(STREAK_DEFS.map((d) => d.key));
  });

  it("keeps each streak on its own source", () => {
    const out = buildStreaks(sources({ tgm: run(TODAY, 8), smoke_free: run(TODAY, 3) }));
    const byKey = Object.fromEntries(out.map((s) => [s.key, s.current]));
    expect(byKey).toMatchObject({ tgm: 8, smoke_free: 3, gym: 0, french: 0, getbuddy: 0 });
  });

  it("totals the badges earned across every streak", () => {
    const out = buildStreaks(sources({ tgm: run(TODAY, 30), french: run(TODAY, 7) }));
    // TGM has 7/14/30; French has 7.
    expect(totalBadgesEarned(out)).toBe(4);
  });
});
