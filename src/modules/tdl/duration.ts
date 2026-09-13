import type { LocalTdlItem } from "./types";

export function prettyDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// An inclusive [min, max] window over a task's time requirement in minutes —
// "between 5 and 15 minutes", "30 minutes or less". Either end can be null
// (open-ended); both null = no filter. Shared by the day board's Time filter and
// the calendar modal's Length filter so a window means the same thing on both.
export type DurationRange = { minMin: number | null; maxMin: number | null };

export const EMPTY_DURATION_RANGE: DurationRange = { minMin: null, maxMin: null };

export type DurationRangePresetKey = "q15" | "q5_15" | "q30" | "half" | "hour";

export const DURATION_RANGE_PRESETS: { key: DurationRangePresetKey; label: string }[] = [
  { key: "q15", label: "15m or less" },
  { key: "q5_15", label: "5 – 15m" },
  { key: "q30", label: "30m or less" },
  { key: "half", label: "30m – 1h" },
  { key: "hour", label: "1h or more" },
];

export function durationRangePreset(key: DurationRangePresetKey): DurationRange {
  switch (key) {
    case "q15":
      return { minMin: null, maxMin: 15 };
    case "q5_15":
      return { minMin: 5, maxMin: 15 };
    case "q30":
      return { minMin: null, maxMin: 30 };
    case "half":
      return { minMin: 30, maxMin: 60 };
    case "hour":
      return { minMin: 60, maxMin: null };
  }
}

// Ends given the wrong way round still describe a window, so swap rather than
// matching nothing. Blank / non-positive ends read as open.
export function normaliseDurationRange(range: DurationRange): DurationRange {
  const min = range.minMin != null && range.minMin > 0 ? range.minMin : null;
  const max = range.maxMin != null && range.maxMin > 0 ? range.maxMin : null;
  if (min != null && max != null && min > max) return { minMin: max, maxMin: min };
  return { minMin: min, maxMin: max };
}

export function isDurationRangeActive(range: DurationRange): boolean {
  const { minMin, maxMin } = normaliseDurationRange(range);
  return minMin != null || maxMin != null;
}

export function matchesDurationRange(durationMin: number, range: DurationRange): boolean {
  const { minMin, maxMin } = normaliseDurationRange(range);
  if (minMin != null && durationMin < minMin) return false;
  if (maxMin != null && durationMin > maxMin) return false;
  return true;
}

// The board filter reads the task's own estimate, and an unestimated task has no
// time requirement to match — so it drops out of any active window rather than
// riding along on a default. (The calendar modal filters the *block* it would
// book, which always has a length, so it uses matchesDurationRange directly.)
export function matchesItemDuration(
  item: Pick<LocalTdlItem, "time_estimate_min">,
  range: DurationRange,
): boolean {
  if (!isDurationRangeActive(range)) return true;
  const est = item.time_estimate_min;
  if (est == null) return false;
  return matchesDurationRange(est, range);
}

// Which preset (if any) the window is exactly, so the picker shows the active
// chip instead of a raw pair.
export function matchingDurationPreset(range: DurationRange): DurationRangePresetKey | null {
  const { minMin, maxMin } = normaliseDurationRange(range);
  for (const { key } of DURATION_RANGE_PRESETS) {
    const preset = durationRangePreset(key);
    if (preset.minMin === minMin && preset.maxMin === maxMin) return key;
  }
  return null;
}

// Short chip label: a preset name when it is one, else the window itself.
export function describeDurationRange(range: DurationRange): string {
  const { minMin, maxMin } = normaliseDurationRange(range);
  if (minMin == null && maxMin == null) return "Any length";
  const preset = matchingDurationPreset({ minMin, maxMin });
  if (preset) return DURATION_RANGE_PRESETS.find((p) => p.key === preset)!.label;
  if (minMin != null && maxMin != null) {
    return minMin === maxMin
      ? prettyDuration(minMin)
      : `${prettyDuration(minMin)} – ${prettyDuration(maxMin)}`;
  }
  if (minMin != null) return `${prettyDuration(minMin)} or more`;
  return `${prettyDuration(maxMin!)} or less`;
}
