// Pure helpers for the "Don't want to do" board column and the day header's
// "Did Anyway" pie. Both read the same set through `isReluctantMember`, so the
// list and the pie can never drift apart. Kept free of the sync/db layer so
// they stay import-safe in tests and cheap to reuse.
import { isSnoozed } from "./snooze";
import type { LocalTdlItem, TdlStatus } from "./types";

// The statuses dayCompletion scores a day on: cancelled is a decision not to do
// it and paused is deliberately on hold, so neither drags the "did you do it
// anyway?" ratio.
const COUNTED: ReadonlySet<TdlStatus> = new Set([
  "open",
  "worked_today",
  "ready_for_testing",
  "done",
]);

export type ReluctantCandidate = Pick<
  LocalTdlItem,
  | "is_reluctant"
  | "priority_rank"
  | "position"
  | "status"
  | "is_archived"
  | "deleted_at"
  | "snoozed_until"
  | "snapshot_date"
>;

// Membership in the "Don't want to do" set for a day: flagged, countable, and
// still on the board. Snoozed items live on the snoozed list until they wake. A
// done item survives archiving: filing a finished task away shouldn't claw back
// the point it earned.
export function isReluctantMember(item: ReluctantCandidate): boolean {
  if (!item.is_reluctant) return false;
  if (item.deleted_at) return false;
  if (isSnoozed(item)) return false;
  if (!COUNTED.has(item.status)) return false;
  return !item.is_archived || item.status === "done";
}

// The reluctant items for the virtual "Don't want to do" column: ranked ones
// first (rank 1 → 10) then the rest by board position — the same order the Do
// First mirror uses. Membership is the reluctance flag set from the row's More
// menu, so there's nothing to add or reorder here.
export function selectReluctantItems<T extends ReluctantCandidate>(items: readonly T[]): T[] {
  return items.filter(isReluctantMember).sort((a, b) => {
    const ra = a.priority_rank ?? Infinity;
    const rb = b.priority_rank ?? Infinity;
    if (ra !== rb) return ra - rb;
    return a.position - b.position;
  });
}

export interface ReluctantCounts {
  total: number;
  done: number;
  // Still-to-do: open + in progress + testing, mirroring SectionColumn.
  outstanding: number;
}

// The column's header badges and the "Did Anyway" pie, off one pass of the
// shared set.
export function reluctantCounts(items: readonly ReluctantCandidate[]): ReluctantCounts {
  const members = items.filter(isReluctantMember);
  return {
    total: members.length,
    done: members.filter((i) => i.status === "done").length,
    outstanding: members.filter(
      (i) =>
        i.status === "open" ||
        i.status === "worked_today" ||
        i.status === "ready_for_testing",
    ).length,
  };
}
