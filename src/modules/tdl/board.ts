// Pure helpers for the Board View — the Trello board for ONE category, whose
// lanes are that category's lists (Backlog, In progress, Done, …). Kept free of
// the sync/db layer so the drag semantics stay import-safe in tests: everything
// the board decides is decided here, and the components only apply the result.

export type TdlViewMode = "list" | "board";

// Both the layout choice and the category the board is showing are per-device
// UI preferences (like column collapse), not synced domain data.
export const VIEW_MODE_STORAGE_KEY = "tdl:viewMode";
export const BOARD_CATEGORY_STORAGE_KEY = "tdl:boardCategory";
export const DEFAULT_VIEW_MODE: TdlViewMode = "list";

export function clampViewMode(raw: unknown): TdlViewMode {
  return raw === "board" || raw === "list" ? raw : DEFAULT_VIEW_MODE;
}

// The category the board opens on: the remembered one while it is still a live
// category, else the first one. Null when there are no categories at all.
export function resolveBoardCategory(
  remembered: string | null | undefined,
  categoryKeys: readonly string[],
): string | null {
  if (remembered && categoryKeys.includes(remembered)) return remembered;
  return categoryKeys[0] ?? null;
}

// A lane's own droppable id, so an empty list (or the gap under its last card)
// still accepts a drop. Cards keep raw uuids as their sortable ids.
export const LANE_DROPPABLE_PREFIX = "lane:";

export function laneDroppableId(listId: string): string {
  return LANE_DROPPABLE_PREFIX + listId;
}

export function laneKeyFromDroppableId(id: string): string | null {
  return id.startsWith(LANE_DROPPABLE_PREFIX)
    ? id.slice(LANE_DROPPABLE_PREFIX.length)
    : null;
}

export interface BoardListLike {
  id: string;
  label: string;
}

export interface BoardCardLike {
  id: string;
  is_recurring: boolean;
  position: number;
  board_list_id: string | null;
}

// The list a card shows in: the one it was placed in while that list is live,
// else the leftmost list. A card that has never been placed — or whose list was
// deleted — reads as the first list rather than disappearing.
export function resolveListId(
  card: Pick<BoardCardLike, "board_list_id">,
  lists: readonly BoardListLike[],
): string | null {
  if (lists.length === 0) return null;
  if (card.board_list_id && lists.some((l) => l.id === card.board_list_id)) {
    return card.board_list_id;
  }
  return lists[0].id;
}

export interface BoardLane<T extends BoardCardLike = BoardCardLike> {
  list: BoardListLike;
  cards: T[];
}

// Bucket a category's cards into its lists, in list order. Within a lane the
// recurring cards lead (the day's fixtures), then the dated ones, each by board
// position — the same reading order as the list layout's column.
export function groupCardsByList<T extends BoardCardLike>(
  cards: readonly T[],
  lists: readonly BoardListLike[],
): BoardLane<T>[] {
  const byList = new Map<string, T[]>(lists.map((l) => [l.id, []]));
  for (const card of cards) {
    const id = resolveListId(card, lists);
    if (id == null) continue;
    byList.get(id)?.push(card);
  }
  const byPosition = (a: T, b: T) =>
    Number(b.is_recurring) - Number(a.is_recurring) || a.position - b.position;
  return lists.map((list) => ({ list, cards: (byList.get(list.id) ?? []).sort(byPosition) }));
}

export interface ListDrop {
  // The list the card lands in.
  listId: string;
  // True when that isn't the list it came from.
  moved: boolean;
  // The target lane's matching bucket in its new order, including the card.
  orderedCards: BoardCardLike[];
}

// Where a card drag lands: which list it joins and that lane's new order.
// Returns null when the drop changes nothing.
//
// Board positions are stored per (day, category, is_recurring), so a drop only
// ever re-sequences the bucket the dragged card belongs to — a recurring card
// dropped among dated ones still lands among the lane's recurring cards.
export function resolveListDrop(
  activeId: string,
  overId: string,
  lanes: readonly BoardLane[],
): ListDrop | null {
  if (activeId === overId) return null;

  let active: BoardCardLike | undefined;
  let sourceLane: BoardLane | undefined;
  for (const lane of lanes) {
    const found = lane.cards.find((c) => c.id === activeId);
    if (found) {
      active = found;
      sourceLane = lane;
      break;
    }
  }
  if (!active || !sourceLane) return null;

  const overListId = laneKeyFromDroppableId(overId);
  const targetLane =
    overListId != null
      ? lanes.find((l) => l.list.id === overListId)
      : lanes.find((l) => l.cards.some((c) => c.id === overId));
  if (!targetLane) return null;

  const isRecurring = active.is_recurring;
  const bucket = targetLane.cards.filter(
    (c) => c.id !== activeId && c.is_recurring === isRecurring,
  );

  const overCard =
    overListId != null ? null : (targetLane.cards.find((c) => c.id === overId) ?? null);
  const overIndex =
    overCard && overCard.is_recurring === isRecurring
      ? bucket.findIndex((c) => c.id === overCard.id)
      : -1;
  const index = overIndex === -1 ? bucket.length : overIndex;

  const orderedCards = [...bucket];
  orderedCards.splice(index, 0, active);

  const moved = targetLane !== sourceLane;
  if (!moved) {
    const before = sourceLane.cards.filter((c) => c.is_recurring === isRecurring);
    if (before.every((c, i) => c.id === orderedCards[i]?.id)) return null;
  }
  return { listId: targetLane.list.id, moved, orderedCards };
}

// Rewrite the positions of one lane's bucket to match its new visual order.
// The cards keep the set of position slots they already hold between them
// (shuffled to the new order), so a drop never renumbers the rest of the day —
// the same trick reorderPriorities plays with rank values. Cards that don't
// actually move are dropped from the result.
export function listDropAssignments(
  orderedCards: readonly BoardCardLike[],
): { id: string; position: number }[] {
  const slots = orderedCards.map((c) => c.position).sort((a, b) => a - b);
  const out: { id: string; position: number }[] = [];
  orderedCards.forEach((card, i) => {
    if (card.position !== slots[i]) out.push({ id: card.id, position: slots[i] });
  });
  return out;
}
