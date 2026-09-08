import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  Clock,
  FolderMinus,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import { Input } from "@/components/ui/Input";
import { addDays, cn } from "@/lib/utils";
import { deleteCategory, renameCategory, setCategoryArchived } from "../categories";
import { archiveCategoryItems, countCategoryItems, snoozeCategoryItems } from "../repo";
import { laneDroppableId } from "../board";
import { UNCATEGORISED_KEY, type SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import { BoardCard, StaticBoardCard } from "./BoardCard";
import { TaskComposer } from "./TaskComposer";

// Lane columns are sortable in their own dnd-kit namespace, so a lane drag is
// never mistaken for a card drag.
export const LANE_SORTABLE_PREFIX = "boardlane:";

export interface BoardListProps {
  cfg: SectionConfig;
  categories: SectionConfig[];
  snapshot_date: string;
  cards: LocalTdlItem[];
  // The lane's persisted category row id — absent for the virtual lanes and
  // until the categories table has synced. Gates rename/archive/delete.
  rowId?: string;
  // Section keys the lane's "all cards" actions target (Uncategorised stands in
  // for several orphaned keys at once).
  bulkSections?: string[];
  // Mirror lanes (Priorities / Do First) hold copies of cards that live in a
  // real lane: read-only, no drop target, no composer.
  mirror?: "priority" | "do_first";
  accent?: string;
  icon?: React.ReactNode;
  focusedId?: string;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onBulkActed?: () => void;
  reorderable?: boolean;
  // True while a dragged card would land in this lane.
  highlighted?: boolean;
  // The card the drag would land above, when that card is in this lane.
  indicateCardId?: string | null;
}

export function BoardList({
  cfg,
  categories,
  snapshot_date,
  cards,
  rowId,
  bulkSections,
  mirror,
  accent,
  icon,
  focusedId,
  selecting,
  selectedIds,
  onToggleSelect,
  onBulkActed,
  reorderable = false,
  highlighted = false,
  indicateCardId,
}: BoardListProps) {
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [bulkMode, setBulkMode] = useState<"archive" | "snooze" | null>(null);
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMirror = !!mirror;
  const canAdd = !isMirror && cfg.key !== UNCATEGORISED_KEY;
  const bulkKeys = bulkSections ?? (cfg.key === UNCATEGORISED_KEY ? [] : [cfg.key]);
  const canBulk = !isMirror && bulkKeys.length > 0;

  // Cards drop into the lane body; an empty lane needs its own droppable so
  // there is still somewhere to land. The "is this the target lane" highlight
  // comes from the canvas, which resolves card hits and lane hits the same way.
  const droppable = useDroppable({
    id: laneDroppableId(cfg.key),
    disabled: isMirror,
    data: { lane: cfg.key },
  });

  const sortable = useSortable({
    id: LANE_SORTABLE_PREFIX + cfg.key,
    disabled: !reorderable,
    data: { type: "lane", key: cfg.key },
  });

  const done = cards.filter((c) => c.status === "done").length;
  const outstanding = cards.filter(
    (c) =>
      c.status === "open" || c.status === "worked_today" || c.status === "ready_for_testing",
  ).length;

  function closeMenu() {
    setMenu(false);
    setBulkMode(null);
    setBulkCount(null);
    setConfirmDelete(false);
  }

  async function openBulk(mode: "archive" | "snooze") {
    setBulkMode(mode);
    setBulkCount(null);
    setBulkCount(await countCategoryItems(snapshot_date, bulkKeys));
  }

  async function onDelete() {
    setError(null);
    try {
      await deleteCategory(rowId!);
      closeMenu();
    } catch (e) {
      setError((e as Error).message);
      setConfirmDelete(false);
    }
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
      data-lane-key={cfg.key}
      className={cn(
        "flex max-h-[calc(100vh-13rem)] w-[280px] shrink-0 flex-col rounded-2xl border bg-surface",
        accent ?? "border-line",
        highlighted && !isMirror && "border-accent ring-1 ring-accent/50",
      )}
    >
      <header className="flex items-center gap-1.5 border-b border-line px-2 py-2">
        {reorderable && (
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`Drag to reorder ${cfg.label}`}
            className="flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted/40 hover:text-muted active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {icon}
        {renaming && rowId ? (
          <Input
            autoFocus
            defaultValue={cfg.label}
            aria-label="List name"
            className="h-8 flex-1 px-2 text-sm"
            onBlur={(e) => {
              const next = e.currentTarget.value.trim();
              if (next && next !== cfg.label) void renameCategory(rowId, next);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <h2
            className={cn(
              "mr-auto truncate text-sm font-semibold uppercase tracking-wider",
              accent ? "" : "text-muted",
            )}
            title={cfg.label}
          >
            {cfg.label}
          </h2>
        )}
        <span className="shrink-0 rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted">
          {outstanding}
          {done > 0 && <span className="text-success"> · {done}✓</span>}
        </span>
        {(canBulk || rowId) && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => (menu ? closeMenu() : setMenu(true))}
              aria-label={`More options for ${cfg.label}`}
              aria-expanded={menu}
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-text"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={closeMenu} aria-hidden />
                <div className="absolute right-0 top-7 z-40 min-w-[220px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  {rowId && (
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
                  )}
                  {canBulk && (
                    <>
                      {bulkMode === "archive" ? (
                        <button
                          type="button"
                          disabled={bulkCount === 0}
                          onClick={() =>
                            void archiveCategoryItems(snapshot_date, bulkKeys).then(() => {
                              onBulkActed?.();
                              closeMenu();
                            })
                          }
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent hover:bg-surface2 disabled:text-muted"
                        >
                          <Archive className="h-4 w-4" />
                          {bulkCount == null
                            ? "Checking…"
                            : bulkCount === 0
                              ? "Nothing to archive"
                              : `Archive ${bulkCount} card${bulkCount === 1 ? "" : "s"}?`}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void openBulk("archive")}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
                        >
                          <Archive className="h-4 w-4" /> Archive all cards
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          bulkMode === "snooze" ? setBulkMode(null) : void openBulk("snooze")
                        }
                        aria-expanded={bulkMode === "snooze"}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
                      >
                        <Clock className="h-4 w-4" />
                        {bulkMode !== "snooze" || bulkCount == null
                          ? "Snooze all cards…"
                          : bulkCount === 0
                            ? "Nothing to snooze"
                            : `Snooze ${bulkCount} card${bulkCount === 1 ? "" : "s"} until…`}
                      </button>
                      {bulkMode === "snooze" && (bulkCount ?? 0) > 0 && (
                        <div className="border-t border-line px-2 py-2">
                          <Calendar
                            min={addDays(snapshot_date, 1)}
                            onSelect={(until) => {
                              if (until <= snapshot_date) return;
                              void snoozeCategoryItems(snapshot_date, bulkKeys, until).then(() => {
                                onBulkActed?.();
                                closeMenu();
                              });
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                  {rowId && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          void setCategoryArchived(rowId, true);
                          closeMenu();
                        }}
                        className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm text-muted hover:bg-surface2"
                      >
                        <FolderMinus className="h-4 w-4" /> Archive list
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          confirmDelete ? void onDelete() : setConfirmDelete(true)
                        }
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface2"
                      >
                        <Trash2 className="h-4 w-4" />
                        {confirmDelete ? "Delete this list?" : "Delete list"}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {error && (
        <p className="border-b border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </p>
      )}

      <div
        ref={isMirror ? undefined : droppable.setNodeRef}
        className="min-h-[60px] flex-1 overflow-y-auto p-1.5"
      >
        {cards.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted">
            {isMirror
              ? mirror === "priority"
                ? "Rank a card 1–10 to pin it here."
                : "Tag a card “Do First” to pin it here."
              : "Drop a card here."}
          </p>
        ) : isMirror ? (
          <ul className="flex flex-col gap-1.5">
            {cards.map((item) => (
              <StaticBoardCard
                key={item.id}
                item={item}
                categories={categories}
                marker={mirror === "priority" ? "rank" : "flame"}
                focused={focusedId === item.id}
                selecting={selecting}
                selected={selectedIds?.has(item.id)}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
                onBulkActed={onBulkActed}
              />
            ))}
          </ul>
        ) : (
          <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1.5">
              {cards.map((item) => (
                <BoardCard
                  key={item.id}
                  item={item}
                  categories={categories}
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

      {canAdd && (
        <div className="border-t border-line/50 p-1.5">
          {adding ? (
            <TaskComposer
              snapshot_date={snapshot_date}
              categories={categories}
              fixedSection={cfg}
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
      )}
    </section>
  );
}
