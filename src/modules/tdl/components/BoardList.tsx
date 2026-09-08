import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { LocalTdlBoardList } from "@/lib/db";
import { deleteBoardList, renameBoardList } from "../boardLists";
import { laneDroppableId } from "../board";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import { BoardCard } from "./BoardCard";
import { TaskComposer } from "./TaskComposer";

// Lanes are sortable in their own dnd-kit namespace, so a lane drag is never
// mistaken for a card drag.
export const LANE_SORTABLE_PREFIX = "boardlane:";

export function BoardList({
  list,
  cfg,
  categories,
  snapshot_date,
  cards,
  lists,
  takenRanks,
  commentCounts,
  focusedId,
  selecting,
  selectedIds,
  onToggleSelect,
  onBulkActed,
  reorderable = false,
  highlighted = false,
  indicateCardId,
}: {
  list: LocalTdlBoardList;
  // The category this board belongs to — every card added here joins it.
  cfg: SectionConfig;
  categories: SectionConfig[];
  snapshot_date: string;
  cards: LocalTdlItem[];
  // Every list in this category, so a card's dialog can move it between lanes.
  lists: LocalTdlBoardList[];
  takenRanks: Set<number>;
  // Item id → comment count on its thread, for the card badges.
  commentCounts?: Map<string, number>;
  focusedId?: string;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onBulkActed?: () => void;
  reorderable?: boolean;
  // True while a dragged card would land in this list.
  highlighted?: boolean;
  // The card the drag would land above, when that card is in this list.
  indicateCardId?: string | null;
}) {
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Cards drop into the lane body; an empty lane needs its own droppable so
  // there is still somewhere to land. The highlight comes from the canvas,
  // which resolves card hits and lane hits the same way.
  const droppable = useDroppable({ id: laneDroppableId(list.id), data: { list: list.id } });

  const sortable = useSortable({
    id: LANE_SORTABLE_PREFIX + list.id,
    disabled: !reorderable,
    data: { type: "lane", listId: list.id },
  });

  const done = cards.filter((c) => c.status === "done").length;
  const outstanding = cards.filter(
    (c) =>
      c.status === "open" || c.status === "worked_today" || c.status === "ready_for_testing",
  ).length;

  function closeMenu() {
    setMenu(false);
    setConfirmDelete(false);
  }

  return (
    <section
      ref={reorderable ? sortable.setNodeRef : undefined}
      style={
        reorderable
          ? {
              transform: CSS.Transform.toString(sortable.transform),
              transition: sortable.transition,
              opacity: sortable.isDragging ? 0.5 : undefined,
            }
          : undefined
      }
      data-lane-id={list.id}
      className={cn(
        "flex max-h-[calc(100vh-15rem)] w-[280px] shrink-0 flex-col rounded-2xl border bg-surface",
        highlighted ? "border-accent ring-1 ring-accent/50" : "border-line",
      )}
    >
      <header className="flex items-center gap-1.5 border-b border-line px-2 py-2">
        {reorderable && (
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`Drag to reorder ${list.label}`}
            className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted/40 hover:text-muted active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {renaming ? (
          <Input
            autoFocus
            defaultValue={list.label}
            aria-label="List name"
            className="h-8 flex-1 px-2 text-sm"
            onBlur={(e) => {
              const next = e.currentTarget.value.trim();
              if (next && next !== list.label) void renameBoardList(list.id, next);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <h3
            className="mr-auto truncate text-sm font-semibold uppercase tracking-wider text-muted"
            title={list.label}
          >
            {list.label}
          </h3>
        )}
        <span className="shrink-0 rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted">
          {outstanding}
          {done > 0 && <span className="text-success"> · {done}✓</span>}
        </span>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => (menu ? closeMenu() : setMenu(true))}
            aria-label={`More options for ${list.label}`}
            aria-expanded={menu}
            className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-text"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-30" onClick={closeMenu} aria-hidden />
              <div className="absolute right-0 top-7 z-40 min-w-[210px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(true);
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
                >
                  <Pencil className="h-4 w-4" /> Rename list
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmDelete) {
                      setConfirmDelete(true);
                      return;
                    }
                    void deleteBoardList(list.id);
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface2"
                >
                  <Trash2 className="h-4 w-4" />
                  {confirmDelete
                    ? cards.length > 0
                      ? `Delete — ${cards.length} card${cards.length === 1 ? "" : "s"} move to the first list?`
                      : "Delete this list?"
                    : "Delete list"}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div ref={droppable.setNodeRef} className="min-h-[60px] flex-1 overflow-y-auto p-1.5">
        {cards.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted">Drop a card here.</p>
        ) : (
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1.5">
              {cards.map((item) => (
                <BoardCard
                  key={item.id}
                  item={item}
                  categories={categories}
                  cfg={cfg}
                  lists={lists}
                  takenRanks={takenRanks}
                  commentCount={commentCounts?.get(item.id) ?? 0}
                  indicate={indicateCardId === item.id}
                  focused={focusedId === item.id}
                  selecting={selecting}
                  selected={selectedIds?.has(item.id)}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                  onBulkActed={onBulkActed}
                />
              ))}
            </ul>
          </SortableContext>
        )}
      </div>

      <div className="border-t border-line/50 p-1.5">
        {adding ? (
          <TaskComposer
            snapshot_date={snapshot_date}
            categories={categories}
            fixedSection={cfg}
            boardListId={list.id}
            collapseWhenEmpty
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdding(true)}
            className="w-full justify-start text-muted"
          >
            <Plus className="mr-1 h-4 w-4" /> Add a card
          </Button>
        )}
      </div>
    </section>
  );
}
