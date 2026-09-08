import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { LayoutList, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { LocalTdlBoardList } from "@/lib/db";
import { createBoardList, reorderBoardLists, seedDefaultLists } from "../boardLists";
import { applyCardPositions, moveItemToBoardList } from "../repo";
import {
  groupCardsByList,
  laneKeyFromDroppableId,
  listDropAssignments,
  resolveListDrop,
} from "../board";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import { BoardCardPreview } from "./BoardCard";
import { BoardList, LANE_SORTABLE_PREFIX } from "./BoardList";

// The Trello board for ONE category: every lane is one of that category's
// lists (Backlog, In progress, Done, …) and dragging a card between lanes
// changes which list it sits in. The category itself is chosen above the board
// (see BoardCategoryPicker in DayView).
export function BoardCanvas({
  cfg,
  categories,
  lists,
  cards,
  snapshot_date,
  focusedId,
  selecting,
  selectedIds,
  onToggleSelect,
  onBulkActed,
}: {
  cfg: SectionConfig;
  categories: SectionConfig[];
  lists: LocalTdlBoardList[];
  // Every live card in this category on this day (already filtered by search).
  cards: LocalTdlItem[];
  snapshot_date: string;
  focusedId?: string;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onBulkActed?: () => void;
}) {
  const [activeCard, setActiveCard] = useState<LocalTdlItem | null>(null);
  // What the dragged card is over, so the target lane lights up and the landing
  // slot shows an insertion line.
  const [overId, setOverId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [seeding, setSeeding] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Lane drags collide only with lanes; card drags prefer a card under the
  // pointer and fall back to whichever lane body it is over.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const draggingLane = String(args.active.id).startsWith(LANE_SORTABLE_PREFIX);
    const containers = args.droppableContainers.filter(
      (c) => String(c.id).startsWith(LANE_SORTABLE_PREFIX) === draggingLane,
    );
    const scoped = { ...args, droppableContainers: containers };
    const hits = pointerWithin(scoped);
    const collisions = hits.length > 0 ? hits : rectIntersection(scoped);
    if (draggingLane) return collisions;
    const onCard = collisions.filter((c) => laneKeyFromDroppableId(String(c.id)) == null);
    return onCard.length > 0 ? onCard : collisions;
  }, []);

  const lanes = groupCardsByList(cards, lists);
  const laneById = new Map(lanes.map((l) => [l.list.id, l]));

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith(LANE_SORTABLE_PREFIX)) return;
    setActiveCard(cards.find((c) => c.id === id) ?? null);
  }

  function onDragOver(e: DragOverEvent) {
    if (String(e.active.id).startsWith(LANE_SORTABLE_PREFIX)) return;
    setOverId(e.over ? String(e.over.id) : null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    setOverId(null);
    const activeId = String(e.active.id);
    const overTarget = e.over ? String(e.over.id) : null;
    if (!overTarget) return;

    if (activeId.startsWith(LANE_SORTABLE_PREFIX)) {
      if (!overTarget.startsWith(LANE_SORTABLE_PREFIX)) return;
      const ids = lists.map((l) => l.id);
      const from = ids.indexOf(activeId.slice(LANE_SORTABLE_PREFIX.length));
      const to = ids.indexOf(overTarget.slice(LANE_SORTABLE_PREFIX.length));
      if (from === -1 || to === -1) return;
      void reorderBoardLists(arrayMove(ids, from, to));
      return;
    }

    const drop = resolveListDrop(activeId, overTarget, lanes);
    if (!drop) return;
    // A lane move changes the card's list, never its category — lists live
    // inside one category — and never its status: the pill stays the card's own.
    if (drop.moved) void moveItemToBoardList(activeId, drop.listId);
    void applyCardPositions(listDropAssignments(drop.orderedCards));
  }

  async function commitAddList() {
    const label = newLabel.trim();
    if (!label) {
      setAddingList(false);
      return;
    }
    await createBoardList(cfg.key, label);
    setNewLabel("");
  }

  async function onSeedDefaults() {
    setSeeding(true);
    try {
      await seedDefaultLists(cfg.key);
    } finally {
      setSeeding(false);
    }
  }

  const sortableLaneIds = lists.map((l) => LANE_SORTABLE_PREFIX + l.id);

  // The lane a drop would land in right now — the lane body under the pointer,
  // or the lane owning the card under it.
  const overLaneId =
    activeCard && overId
      ? (laneKeyFromDroppableId(overId) ??
        lanes.find((l) => l.cards.some((c) => c.id === overId))?.list.id ??
        null)
      : null;
  const indicateCardId =
    activeCard && overId && laneKeyFromDroppableId(overId) == null && overId !== activeCard.id
      ? overId
      : null;

  if (lists.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface/50 p-8 text-center">
        <LayoutList className="mx-auto mb-3 h-8 w-8 text-muted" />
        <p className="text-sm text-muted">
          “{cfg.label}” has no lists yet. Lists are the board’s lanes — cards move between them.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={() => void onSeedDefaults()} disabled={seeding}>
            Use Backlog · In progress · Done
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAddingList(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add a list
          </Button>
        </div>
        {addingList && (
          <div className="mx-auto mt-3 flex max-w-xs items-center gap-2">
            <Input
              autoFocus
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="List name"
              aria-label="New list name"
              className="h-10 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitAddList();
                if (e.key === "Escape") setAddingList(false);
              }}
            />
            <Button size="sm" onClick={() => void commitAddList()} disabled={!newLabel.trim()}>
              Add
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveCard(null);
        setOverId(null);
      }}
    >
      <SortableContext items={sortableLaneIds} strategy={horizontalListSortingStrategy}>
        <div className="flex items-start gap-3 overflow-x-auto pb-3">
          {lists.map((list) => (
            <BoardList
              key={list.id}
              list={list}
              cfg={cfg}
              categories={categories}
              snapshot_date={snapshot_date}
              cards={laneById.get(list.id)?.cards ?? []}
              focusedId={focusedId}
              selecting={selecting}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onBulkActed={onBulkActed}
              reorderable={lists.length > 1}
              highlighted={overLaneId === list.id}
              indicateCardId={indicateCardId}
            />
          ))}

          <div className="w-[280px] shrink-0 rounded-2xl border border-dashed border-line bg-surface/50 p-2">
            {addingList ? (
              <div className="flex flex-col gap-2">
                <Input
                  autoFocus
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="List name"
                  aria-label="New list name"
                  className="h-10 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void commitAddList();
                    if (e.key === "Escape") {
                      setNewLabel("");
                      setAddingList(false);
                    }
                  }}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => void commitAddList()} disabled={!newLabel.trim()}>
                    Add list
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNewLabel("");
                      setAddingList(false);
                    }}
                    aria-label="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAddingList(true)}
                className="w-full justify-start text-muted"
              >
                <Plus className="mr-1 h-4 w-4" /> Add list
              </Button>
            )}
          </div>
        </div>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeCard ? <BoardCardPreview item={activeCard} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
