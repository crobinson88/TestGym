import { addDays, dayMonth, todayIsoDate } from "@/lib/utils";
import type { LocalTdlItem } from "./types";

// An inclusive [from, to] window over the day a task was added. Either end can
// be null (open-ended); both null = no filter.
export type CreatedRange = { from: string | null; to: string | null };

export const EMPTY_CREATED_RANGE: CreatedRange = { from: null, to: null };

export type CreatedRangePresetKey = "today" | "7d" | "30d" | "month";

export const CREATED_RANGE_PRESETS: { key: CreatedRangePresetKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
];

type CreatedItem = Pick<LocalTdlItem, "snapshot_date" | "origin_snapshot_date">;

// The day a task entered the list. Roll-forward mints a fresh row every morning,
// so created_at is the copy's birthday, not the task's — origin_snapshot_date
// carries the original day, which is what the row shows as "added".
export function createdDate(item: CreatedItem): string {
  return item.origin_snapshot_date ?? item.snapshot_date;
}

// Ends given the wrong way round still describe a window, so swap rather than
// matching nothing.
export function normaliseCreatedRange(range: CreatedRange): CreatedRange {
  const { from, to } = range;
  if (from && to && from > to) return { from: to, to: from };
  return { from: from || null, to: to || null };
}

export function isCreatedRangeActive(range: CreatedRange): boolean {
  return Boolean(range.from || range.to);
}

export function matchesCreatedRange(item: CreatedItem, range: CreatedRange): boolean {
  const { from, to } = normaliseCreatedRange(range);
  if (!from && !to) return true;
  const created = createdDate(item);
  if (from && created < from) return false;
  if (to && created > to) return false;
  return true;
}

export function createdRangePreset(
  key: CreatedRangePresetKey,
  today = todayIsoDate(),
): CreatedRange {
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

// Which preset (if any) the current range is exactly, so the picker can show the
// active one instead of a raw date pair.
export function matchingPreset(
  range: CreatedRange,
  today = todayIsoDate(),
): CreatedRangePresetKey | null {
  const { from, to } = normaliseCreatedRange(range);
  for (const { key } of CREATED_RANGE_PRESETS) {
    const preset = createdRangePreset(key, today);
    if (preset.from === from && preset.to === to) return key;
  }
  return null;
}

// Short chip label: a preset name when it is one, else the date window.
export function describeCreatedRange(range: CreatedRange, today = todayIsoDate()): string {
  const { from, to } = normaliseCreatedRange(range);
  if (!from && !to) return "Any date";
  const preset = matchingPreset({ from, to }, today);
  if (preset) return CREATED_RANGE_PRESETS.find((p) => p.key === preset)!.label;
  if (from && to) return from === to ? dayMonth(from) : `${dayMonth(from)} – ${dayMonth(to)}`;
  if (from) return `From ${dayMonth(from)}`;
  return `Until ${dayMonth(to!)}`;
}
