import {
  NEVER_SKIP,
  holidayName,
  lastCountingDay,
  onlySkippedBetween,
  skipEmptyHolidays,
  type SkipDay,
} from "@/lib/holidays";
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
  // Work streaks bridge US public holidays — a holiday you logged nothing on
  // neither breaks the run nor counts toward it. The personal streaks don't: a
  // public holiday is no reason to smoke or skip the gym.
  skipsHolidays: boolean;
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
    skipsHolidays: false,
  },
  {
    key: "gym",
    label: "Gym",
    hint: "A set or cardio session logged, or time logged against Gym",
    unit: "day",
    color: "#f97316",
    skipsHolidays: false,
  },
  {
    key: "tgm",
    label: "TGM work",
    hint: `Any time logged against ${TGM_TASK_NAME} · US holidays skipped`,
    unit: "day",
    color: "#a78bfa",
    skipsHolidays: true,
  },
  {
    key: "getbuddy",
    label: "GetBuddy",
    hint: `Any time logged against ${GETBUDDY_TASK_NAME} · US holidays skipped`,
    unit: "day",
    color: "#34d399",
    skipsHolidays: true,
  },
  {
    key: "smoke_free",
    label: "Smoke-free",
    hint: "A day marked smoke-free on the Today screen",
    unit: "day",
    color: "#10b981",
    skipsHolidays: false,
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
  // Today is a US public holiday this streak skips — the run is paused, not
  // pending. Named so the card can say which holiday.
  holidayToday: string | null;
  badges: Badge[];
  next: NextBadge | null;
}

// Longest run of consecutive dates anywhere in the history. A gap made only of
// skipped days (a public holiday on a work streak) bridges the run rather than
// ending it.
function longestRun(sorted: readonly string[], skip: SkipDay): number {
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of sorted) {
    const consecutive =
      prev !== null && (addDays(prev, 1) === date || onlySkippedBetween(prev, date, skip));
    run = consecutive ? run + 1 : 1;
    if (run > best) best = run;
    prev = date;
  }
  return best;
}

// Days back from `from` (inclusive) that are all on the streak. Skipped days
// are stepped over: they don't add to the run and they don't end it.
function runEndingAt(days: ReadonlySet<string>, from: string, skip: SkipDay): number {
  let n = 0;
  let cursor = from;
  for (;;) {
    if (days.has(cursor)) n++;
    else if (!skip(cursor)) return n;
    cursor = addDays(cursor, -1);
  }
}

export function buildStreak(
  key: StreakKey,
  days: ReadonlySet<string>,
  today: string,
  skip: SkipDay = NEVER_SKIP,
): Streak {
  const sorted = Array.from(days).sort();
  // The last day that could have kept the streak: yesterday, or the day before
  // a run of skipped days leading up to it.
  const anchor = lastCountingDay(addDays(today, -1), skip);
  const holidayToday = !days.has(today) && skip(today) ? holidayName(today) : null;
  const current = days.has(today)
    ? runEndingAt(days, today, skip)
    : runEndingAt(days, anchor, skip);
  const pendingToday = !days.has(today) && holidayToday === null && current > 0;
  const best = Math.max(longestRun(sorted, skip), current);
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
    holidayToday,
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
  return STREAK_DEFS.map((def) => {
    const days = src[def.key];
    const skip = def.skipsHolidays ? skipEmptyHolidays((date) => days.has(date)) : NEVER_SKIP;
    return buildStreak(def.key, days, src.today, skip);
  });
}

// Badges earned across every streak — the count in the section header.
export function totalBadgesEarned(streaks: readonly Streak[]): number {
  return streaks.reduce((n, s) => n + s.badges.filter((b) => b.earned).length, 0);
}
