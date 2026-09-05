import { addDays } from "@/lib/utils";

// Consecutive-day streaks over the things worth doing every day. Every streak
// is derived from data the app already holds — nothing new is stored.
export type StreakKey = "french" | "gym" | "tgm" | "getbuddy" | "smoke_free";

export interface StreakDef {
  key: StreakKey;
  label: string;
  // What puts a day on the streak, shown under the card.
  hint: string;
  // The word for one day on this streak, for the "N days" line.
  unit: string;
  color: string;
}

// Time-tracking task names the work streaks read. Matched by name (duplicate
// live tasks can share one — two devices adding "TGM" offline), like the
// habit grid's Bed column.
export const TGM_TASK_NAME = "TGM";
export const GETBUDDY_TASK_NAME = "GetBuddy";
export const FRENCH_TASK_NAME = "French";
export const GYM_TASK_NAME = "Gym";

export const STREAK_DEFS: readonly StreakDef[] = [
  {
    key: "french",
    label: "French",
    hint: "A French test taken, or time logged against French",
    unit: "day",
    color: "#22d3ee",
  },
  {
    key: "gym",
    label: "Gym",
    hint: "A set or cardio session logged, or time logged against Gym",
    unit: "day",
    color: "#f97316",
  },
  {
    key: "tgm",
    label: "TGM work",
    hint: `Any time logged against ${TGM_TASK_NAME}`,
    unit: "day",
    color: "#a78bfa",
  },
  {
    key: "getbuddy",
    label: "GetBuddy",
    hint: `Any time logged against ${GETBUDDY_TASK_NAME}`,
    unit: "day",
    color: "#34d399",
  },
  {
    key: "smoke_free",
    label: "Smoke-free",
    hint: "A day marked smoke-free on the Today screen",
    unit: "day",
    color: "#10b981",
  },
];

export interface BadgeTier {
  days: number;
  label: string;
  short: string;
}

// 1 week → 2 weeks → 1 month → 3 months.
export const BADGE_TIERS: readonly BadgeTier[] = [
  { days: 7, label: "1 week", short: "7d" },
  { days: 14, label: "2 weeks", short: "14d" },
  { days: 30, label: "1 month", short: "1m" },
  { days: 90, label: "3 months", short: "3m" },
];

export interface Badge extends BadgeTier {
  // Reached at some point — the badge is yours for good.
  earned: boolean;
  // The run you're on right now is long enough, so the badge is live.
  held: boolean;
}

export interface NextBadge {
  days: number;
  label: string;
  remaining: number;
}

export interface Streak {
  key: StreakKey;
  current: number;
  best: number;
  // Days on the streak all-time, consecutive or not.
  total: number;
  lastDate: string | null;
  // The run is alive but today isn't on it yet — a streak only breaks once a
  // whole day is missed, so an unlogged today doesn't zero it before bedtime.
  pendingToday: boolean;
  badges: Badge[];
  next: NextBadge | null;
}

// Longest run of consecutive dates anywhere in the history.
function longestRun(sorted: readonly string[]): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of sorted) {
    run = prev !== null && addDays(prev, 1) === date ? run + 1 : 1;
    if (run > best) best = run;
    prev = date;
  }
  return best;
}

// Days back from `from` (inclusive) that are all on the streak.
function runEndingAt(days: ReadonlySet<string>, from: string): number {
  let n = 0;
  let cursor = from;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function buildStreak(key: StreakKey, days: ReadonlySet<string>, today: string): Streak {
  const sorted = Array.from(days).sort();
  const yesterday = addDays(today, -1);
  const pendingToday = !days.has(today) && days.has(yesterday);
  const current = days.has(today)
    ? runEndingAt(days, today)
    : pendingToday
      ? runEndingAt(days, yesterday)
      : 0;
  const best = Math.max(longestRun(sorted), current);
  const badges = BADGE_TIERS.map((tier) => ({
    ...tier,
    earned: best >= tier.days,
    held: current >= tier.days,
  }));
  const nextTier = BADGE_TIERS.find((tier) => tier.days > current) ?? null;
  return {
    key,
    current,
    best,
    total: sorted.length,
    lastDate: sorted.length > 0 ? sorted[sorted.length - 1] : null,
    pendingToday,
    badges,
    next: nextTier
      ? { days: nextTier.days, label: nextTier.label, remaining: nextTier.days - current }
      : null,
  };
}

export type StreakDays = Record<StreakKey, ReadonlySet<string>>;

export interface StreakSources extends StreakDays {
  today: string;
}

export function buildStreaks(src: StreakSources): Streak[] {
  return STREAK_DEFS.map((def) => buildStreak(def.key, src[def.key], src.today));
}

// Badges earned across every streak — the count in the section header.
export function totalBadgesEarned(streaks: readonly Streak[]): number {
  return streaks.reduce((n, s) => n + s.badges.filter((b) => b.earned).length, 0);
}
