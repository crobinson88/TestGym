// Pure helpers for the Trello-style board view of a day. Kept free of the
// sync/db layer so they stay import-safe in tests: the board's drag semantics
// are all decided here, and the components only apply the result.

import { UNCATEGORISED_KEY } from "./sections";

export type TdlViewMode = "list" | "board";

// The list/board choice is a per-device UI preference (like column collapse),
// not synced domain data.
export const VIEW_MODE_STORAGE_KEY = "tdl:viewMode";
export const DEFAULT_VIEW_MODE: TdlViewMode = "list";

export function clampViewMode(raw: unknown): TdlViewMode {
  return raw === "board" || raw === "list" ? raw : DEFAULT_VIEW_MODE;
}

// A lane's own droppable id, so an empty lane (or the gap under its last card)
// still accepts a drop. Cards keep raw uuids as their sortable ids.
export const LANE_DROPPABLE_PREFIX = "lane:";

export function laneDroppableId(key: string): string {
  return LANE_DROPPABLE_PREFIX + key;
}

export function laneKeyFromDroppableId(id: string): string | null {
  return id.startsWith(LANE_DROPPABLE_PREFIX)
    ? id.slice(LANE_DROPPABLE_PREFIX.length)
    : null;
}

// Cards as a lane stacks them: recurring first (they're the day's fixtures),
// then the dated ones, each in board position order.
export function orderLaneCards<T extends { position: number }>(
  recurring: readonly T[],
  dated: readonly T[],
): T[] {
  const byPosition = (a: T, b: T) => a.position - b.position;
  return [...[...recurring].sort(byPosition), ...[...dated].sort(byPosition)];
}

export interface DropCard {
  id: string;
  section: string;
  is_recurring: boolean;
}

export interface DropLane {
  key: string;
  cards: DropCard[];
}

export interface BoardDrop {
  // The category the card ends up in (a real section key, never the virtual
  // Uncategorised one).
  section: string;
  isRecurring: boolean;
  // The target bucket's new order, including the dragged card.
  orderedIds: string[];
  // Where the dragged card lands within that bucket.
  index: number;
  // True when the drop crosses lanes, so the caller also rewrites `section`.
  moved: boolean;
}

// Where a card drag lands: which category it joins and the new order of that
// lane's matching bucket. Returns null when the drop is a no-op or illegal.
//
// Positions are stored per (day, section, is_recurring), so a drop only ever
// re-sequences the bucket the dragged card belongs to — a recurring card
// dropped among dated ones still lands in the lane's recurring bucket.
export function resolveDrop(
  activeId: string,
  overId: string,
  lanes: readonly DropLane[],
): BoardDrop | null {
  if (activeId === overId) return null;
  let active: DropCard | undefined;
  let sourceLane: DropLane | undefined;
  for (const lane of lanes) {
    const found = lane.cards.find((c) => c.id === activeId);
    if (found) {
      active = found;
      sourceLane = lane;
      break;
    }
  }
  if (!active || !sourceLane) return null;

  const overLaneKey = laneKeyFromDroppableId(overId);
  const targetLane =
    overLaneKey != null
      ? lanes.find((l) => l.key === overLaneKey)
      : lanes.find((l) => l.cards.some((c) => c.id === overId));
  if (!targetLane) return null;

  // The Uncategorised lane is a bucket for orphaned section keys, not a real
  // category, so nothing can be moved *into* it — cards already there can only
  // be reordered against their own (orphaned) section.
  if (targetLane.key === UNCATEGORISED_KEY && targetLane !== sourceLane) return null;
  const section = targetLane.key === UNCATEGORISED_KEY ? active.section : targetLane.key;

  const isRecurring = active.is_recurring;
  const inBucket = (c: DropCard) =>
    c.is_recurring === isRecurring &&
    (targetLane.key !== UNCATEGORISED_KEY || c.section === section);
  const bucket = targetLane.cards.filter((c) => c.id !== activeId && inBucket(c));

  const overCard =
    overLaneKey != null ? null : (targetLane.cards.find((c) => c.id === overId) ?? null);
  const overIndex = overCard && inBucket(overCard) ? bucket.findIndex((c) => c.id === overCard.id) : -1;
  const index = overIndex === -1 ? bucket.length : overIndex;

  const orderedIds = bucket.map((c) => c.id);
  orderedIds.splice(index, 0, activeId);

  const moved = active.section !== section;
  // Dropping a card back exactly where it started changes nothing.
  if (!moved) {
    const before = targetLane.cards.filter(inBucket).map((c) => c.id);
    if (before.length === orderedIds.length && before.every((id, i) => id === orderedIds[i])) {
      return null;
    }
  }
  return { section, isRecurring, orderedIds, index, moved };
}
