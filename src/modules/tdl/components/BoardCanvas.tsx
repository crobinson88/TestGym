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
import { Flame, ListChecks, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createCategory, reorderCategories } from "../categories";
import { moveItem, reorderSection } from "../repo";
import { laneKeyFromDroppableId, resolveDrop, type DropLane } from "../board";
import { PRIORITIES_KEY, type SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import { BoardCardPreview } from "./BoardCard";
import { BoardList, LANE_SORTABLE_PREFIX } from "./BoardList";

export const DO_FIRST_LANE_KEY = "__do_first__";

export interface BoardLane {
  cfg: SectionConfig;
  cards: LocalTdlItem[];
  // Real section keys the lane's bulk actions target.
  sections?: string[];
  // Read-only lanes mirroring cards that live in a real lane.
  mirror?: "priority" | "do_first";
}

// The Trello-style board for a day: one lane per category, cards dragged
// between them to change category. Ranked and Do First cards also mirror into
// two read-only lanes at the head of the board, the same way the list view
// shows them as pinned columns.
export function BoardCanvas({
  lanes,
  categories,
  snapshot_date,
  keyToRowId,
  focusedId,
  selecting,
  selectedIds,
  onToggleSelect,
  onBulkActed,
  reorderableKeys,
}: {
  lanes: BoardLane[];
  categories: SectionConfig[];
  snapshot_date: string;
  keyToRowId: Map<string, string>;
  focusedId?: string;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onBulkActed?: () => void;
  // Category keys whose lanes can be dragged to reorder the board.
  reorderableKeys: string[];
}) {
  const [activeCard, setActiveCard] = useState<LocalTdlItem | null>(null);
  // What the dragged card is currently over, so the target lane can light up
  // and the landing slot can show an insertion line.
  const [overId, setOverId] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newLabel, setNewLabel] = useState("");

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

  // Only real category lanes take part in card drops; the mirrors hold copies.
  const dropLanes: DropLane[] = lanes
    .filter((l) => !l.mirror)
    .map((l) => ({
      key: l.cfg.key,
      cards: l.cards.map((c) => ({
        id: c.id,
        section: c.section,
        is_recurring: c.is_recurring,
      })),
    }));

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith(LANE_SORTABLE_PREFIX)) return;
    const card = lanes.flatMap((l) => (l.mirror ? [] : l.cards)).find((c) => c.id === id);
    setActiveCard(card ?? null);
  }

  function onDragOver(e: DragOverEvent) {
    if (String(e.active.id).startsWith(LANE_SORTABLE_PREFIX)) return;
    setOverId(e.over ? String(e.over.id) : null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveCard(null);
    setOverId(null);
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;

    if (activeId.startsWith(LANE_SORTABLE_PREFIX)) {
      if (!overId.startsWith(LANE_SORTABLE_PREFIX)) return;
      const from = reorderableKeys.indexOf(activeId.slice(LANE_SORTABLE_PREFIX.length));
      const to = reorderableKeys.indexOf(overId.slice(LANE_SORTABLE_PREFIX.length));
      if (from === -1 || to === -1) return;
      const nextIds = arrayMove(reorderableKeys, from, to)
        .map((k) => keyToRowId.get(k))
        .filter((v): v is string => !!v);
      void reorderCategories(nextIds);
      return;
    }

    const drop = resolveDrop(activeId, overId, dropLanes);
    if (!drop) return;
    // Unlike the list view, a board drop only moves the card between lanes —
    // the Eisenhower quadrant is a property of the task, not of where it sits.
    if (drop.moved) void moveItem(activeId, drop.section, drop.index);
    void reorderSection(snapshot_date, drop.section, drop.isRecurring, drop.orderedIds);
  }

  async function commitAddList() {
    const label = newLabel.trim();
    if (!label) {
      setAddingList(false);
      return;
    }
    await createCategory(label);
    setNewLabel("");
  }

  const sortableLaneIds = reorderableKeys.map((k) => LANE_SORTABLE_PREFIX + k);
  const reorderableSet = new Set(reorderableKeys);

  // The lane a drop would land in right now — either the lane body under the
  // pointer or the lane owning the card under it.
  const overLaneKey =
    activeCard && overId
      ? (laneKeyFromDroppableId(overId) ??
        dropLanes.find((l) => l.cards.some((c) => c.id === overId))?.key ??
        null)
      : null;
  const indicateCardId =
    activeCard && overId && laneKeyFromDroppableId(overId) == null && overId !== activeCard.id
      ? overId
      : null;

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
          {lanes.map((lane) => (
            <BoardList
              key={lane.cfg.key}
              cfg={lane.cfg}
              categories={categories}
              snapshot_date={snapshot_date}
              cards={lane.cards}
              rowId={lane.mirror ? undefined : keyToRowId.get(lane.cfg.key)}
              bulkSections={lane.sections}
              mirror={lane.mirror}
              accent={
                lane.mirror === "priority"
                  ? "border-warn/40"
                  : lane.mirror === "do_first"
                    ? "border-danger/40"
                    : undefined
              }
              icon={
                lane.mirror === "priority" ? (
                  <ListChecks className="h-4 w-4 shrink-0 text-warn" />
                ) : lane.mirror === "do_first" ? (
                  <Flame className="h-4 w-4 shrink-0 text-danger" />
                ) : undefined
              }
              focusedId={focusedId}
              selecting={selecting}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onBulkActed={onBulkActed}
              reorderable={reorderableSet.has(lane.cfg.key)}
              highlighted={overLaneKey === lane.cfg.key}
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

// Config for the two mirror lanes, so DayView doesn't hand-roll them.
export const PRIORITY_LANE: SectionConfig = {
  key: PRIORITIES_KEY,
  label: "Priorities",
  hasDueDate: true,
  hasTimeEstimate: true,
  recurringSeeds: [],
};

export const DO_FIRST_LANE: SectionConfig = {
  key: DO_FIRST_LANE_KEY,
  label: "Do First",
  hasDueDate: true,
  hasTimeEstimate: true,
  recurringSeeds: [],
};
