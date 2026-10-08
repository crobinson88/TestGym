import type { TdlSection, TdlStatus } from "./types";

const STANDARD_CYCLE: TdlStatus[] = ["open", "worked_today", "done"];
const PRODUCT_CYCLE: TdlStatus[] = ["open", "worked_today", "ready_for_testing", "done"];

// Only the Product category exposes the "ready for testing" step; every other
// category (including user-created ones) uses the standard cycle.
export function statusCycleFor(section: TdlSection): TdlStatus[] {
  return section === "product" ? PRODUCT_CYCLE : STANDARD_CYCLE;
}

export function coerceStatus(section: TdlSection, status: TdlStatus): TdlStatus {
  if (status === "ready_for_testing" && section !== "product") return "worked_today";
  return status;
}

export function nextStatus(section: TdlSection, current: TdlStatus): TdlStatus {
  const cycle = statusCycleFor(section);
  // Paused and cancelled sit outside the cycle; tapping the pill resumes them.
  if (current === "cancelled" || current === "paused") return "open";
  const i = cycle.indexOf(current);
  if (i === -1) return "open";
  return cycle[(i + 1) % cycle.length];
}

// The two statuses that sit outside the tap-through cycle: a task put down for
// now, and one abandoned. Reachable from the status pass, not from the pill.
export const OFF_CYCLE_STATUSES: TdlStatus[] = ["paused", "cancelled"];

// Every status a task in this category can be set to, cycle first.
export function statusOptionsFor(section: TdlSection): TdlStatus[] {
  return [...statusCycleFor(section), ...OFF_CYCLE_STATUSES];
}

const LABELS: Record<TdlStatus, string> = {
  open: "Open",
  worked_today: "In progress",
  ready_for_testing: "Ready for testing",
  paused: "Paused",
  done: "Done",
  cancelled: "Cancelled",
};

export function statusLabel(status: TdlStatus, section: TdlSection): string {
  return LABELS[coerceStatus(section, status)];
}
