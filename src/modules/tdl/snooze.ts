import type { LocalTdlItem, TdlItemRow } from "./types";

// An item is snoozed when it has a wake-up date that is still in the future
// relative to the day it lives on. Each daily snapshot carries its own
// snapshot_date, so a snoozed item stays dimmed as it rolls forward until the
// snapshot reaches snoozed_until, at which point it becomes active again.
export function isSnoozed(
  item: Pick<TdlItemRow, "snoozed_until" | "snapshot_date">,
  onDate?: string,
): boolean {
  if (!item.snoozed_until) return false;
  return item.snoozed_until > (onDate ?? item.snapshot_date);
}

export function isActive(item: LocalTdlItem): boolean {
  return !item.deleted_at && !item.is_archived && !isSnoozed(item);
}

// Items eligible for a bulk "reset to Open": everything live on the day that
// isn't already open — recurring included, archived and snoozed excluded.
export function isResettable(item: LocalTdlItem): boolean {
  return isActive(item) && item.status !== "open";
}
