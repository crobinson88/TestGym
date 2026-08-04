import type { BodySex, CardioSessionRow, FoodEntryRow } from "@/lib/database.types";

export interface DailyTotals {
  calories: number;
  protein: number;
  count: number;
}

export interface DayGroup {
  date: string;
  entries: FoodEntryRow[];
  totals: DailyTotals;
}

export interface GoalProgress {
  value: number;
  goal: number;
  // Fraction of the goal met, clamped to [0, 1] for bar/ring rendering.
  pct: number;
  // Signed distance to the goal: positive = still to go, negative = over.
  remaining: number;
  over: boolean;
}

// Sum the calories + protein of a day's entries. Callers pass an already
// date-filtered, non-deleted list.
export function sumEntries(entries: FoodEntryRow[]): DailyTotals {
  return entries.reduce<DailyTotals>(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein: acc.protein + e.protein,
      count: acc.count + 1,
    }),
    { calories: 0, protein: 0, count: 0 },
  );
}

// Group entries by their date, newest day first. Within a day, newest entry
// leads (by created_at) so the most recent log sits on top.
export function groupByDate(entries: FoodEntryRow[]): DayGroup[] {
  const byDate = new Map<string, FoodEntryRow[]>();
  for (const e of entries) {
    const list = byDate.get(e.entry_date);
    if (list) list.push(e);
    else byDate.set(e.entry_date, [e]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, list]) => {
      const sorted = [...list].sort((a, b) =>
        a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
      );
      return { date, entries: sorted, totals: sumEntries(sorted) };
    });
}

export interface RecentFood {
  name: string;
  calories: number;
  protein: number;
  // The most recent day this food was logged (its macros are taken from that log).
  lastDate: string;
}

// Distinct foods logged previously, most-recently-logged first, so a food can
// be re-logged onto the current day with one tap. Deduped by name
// (case-insensitive, trimmed); the most recent entry's macros win. Pass
// `excludeDate` (today) to keep the picker to prior logs only.
export function recentFoods(
  entries: FoodEntryRow[],
  opts: { excludeDate?: string; limit?: number } = {},
): RecentFood[] {
  const { excludeDate, limit } = opts;
  const byName = new Map<string, FoodEntryRow>();
  for (const e of entries) {
    if (excludeDate && e.entry_date === excludeDate) continue;
    const key = e.name.trim().toLowerCase();
    if (!key) continue;
    const seen = byName.get(key);
    if (!seen || isNewerEntry(e, seen)) byName.set(key, e);
  }
  const foods = [...byName.values()]
    .sort((a, b) => (isNewerEntry(a, b) ? -1 : 1))
    .map((e) => ({
      name: e.name,
      calories: e.calories,
      protein: e.protein,
      lastDate: e.entry_date,
    }));
  return limit != null ? foods.slice(0, limit) : foods;
}

// Recency: newest created_at wins; fall back to entry_date for legacy rows that
// share a timestamp.
function isNewerEntry(a: FoodEntryRow, b: FoodEntryRow): boolean {
  if (a.created_at !== b.created_at) return a.created_at > b.created_at;
  return a.entry_date > b.entry_date;
}

// Progress of a running total against a goal. A goal of 0 (or unset) means "no
// goal": pct stays 0 and nothing reads as over.
export function goalProgress(value: number, goal: number): GoalProgress {
  if (goal <= 0) {
    return { value, goal: 0, pct: 0, remaining: 0, over: false };
  }
  const pct = Math.min(1, value / goal);
  const remaining = goal - value;
  return { value, goal, pct, remaining, over: value > goal };
}

// ---- Daily energy balance --------------------------------------------------

const LB_PER_KG = 2.2046226218;
const CM_PER_INCH = 2.54;

export const lbToKg = (lb: number) => lb / LB_PER_KG;
export const ftInToCm = (feet: number, inches: number) => (feet * 12 + inches) * CM_PER_INCH;

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
}

// Resting metabolic rate via Mifflin-St Jeor (kcal/day). Needs age, height and
// weight; returns null when any is missing so the UI can prompt to complete the
// profile rather than show a bogus number.
export function mifflinBmr(input: {
  sex: BodySex;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
}): number | null {
  const { sex, age, heightCm, weightKg } = input;
  if (age == null || heightCm == null || weightKg == null) return null;
  if (age <= 0 || heightCm <= 0 || weightKg <= 0) return null;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

// The baseline daily burn: BMR scaled by a non-exercise activity factor.
// Logged gym exercise is added on top separately, so keep the factor low
// (sedentary ≈ 1.2) to avoid double-counting.
export function baselineBurn(bmr: number | null, activityFactor: number): number | null {
  if (bmr == null) return null;
  return Math.round(bmr * activityFactor);
}

// Calories burned from a cardio session's MET-minutes:
//   kcal = MET × 3.5 × kg / 200 × minutes = met_minutes × kg × 0.0175
// Sums a day's sessions. Returns 0 when weight is unknown (can't convert).
export function exerciseKcalFromMetMinutes(
  metMinutes: number,
  weightKg: number | null,
): number {
  if (weightKg == null || weightKg <= 0) return 0;
  return Math.round(metMinutes * weightKg * 0.0175);
}

// Calories burned by a single cardio session. A directly-logged `calories`
// value (from the machine/watch readout) wins; otherwise fall back to the
// MET-based estimate. Sum over a day's sessions for the cardio exercise burn.
export function cardioSessionKcal(
  session: Pick<
    CardioSessionRow,
    "calories" | "met_minutes" | "met_value_snapshot" | "minutes"
  >,
  weightKg: number | null,
): number {
  if (session.calories != null && session.calories >= 0) return session.calories;
  const metMinutes = session.met_minutes ?? session.met_value_snapshot * session.minutes;
  return exerciseKcalFromMetMinutes(metMinutes, weightKg);
}

export interface DailyBalance {
  intake: number;
  baseline: number | null;
  exercise: number;
  // Total energy out (baseline + exercise), null when baseline is unknown.
  burn: number | null;
  // burn − intake. Positive = deficit (burned more than eaten). Null when
  // baseline is unknown.
  net: number | null;
}

// The calorie target adjusted for logged exercise: the base goal plus the day's
// exercise burn (cardio + strength), so calories burned are "earned back" and
// the target rises as you train. A base goal of 0 (unset) stays 0 — no goal,
// no adjustment — and a negative burn never pulls the target below the base.
export function adjustedCalorieGoal(baseGoal: number, exercise: number): number {
  if (baseGoal <= 0) return 0;
  return baseGoal + Math.max(0, exercise);
}

// The day's energy balance. `net > 0` is a deficit.
export function dailyBalance(input: {
  intake: number;
  baseline: number | null;
  exercise: number;
}): DailyBalance {
  const { intake, baseline, exercise } = input;
  const burn = baseline == null ? null : baseline + exercise;
  const net = burn == null ? null : burn - intake;
  return { intake, baseline, exercise, burn, net };
}
