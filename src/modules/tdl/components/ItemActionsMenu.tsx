import { useState } from "react";
import {
  Archive,
  BellOff,
  Check,
  ChevronRight,
  Clock,
  FolderInput,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  StickyNote,
  ThumbsDown,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import type { SectionConfig } from "../sections";
import {
  archiveItems,
  cancelItems,
  deleteItems,
  moveItemsToSection,
  pauseItems,
  resumeItems,
  setReluctantItems,
  unsnoozeItems,
} from "../repo";
import { isSnoozed } from "../snooze";

// The per-item "More" menu, shared by the list rows and the board cards so both
// surfaces offer exactly the same actions. The host owns rename, the detail
// panel and the snooze calendar (each needs to render inside its own layout),
// so those are callbacks; everything else acts here.
export function ItemActionsMenu({
  item,
  categories,
  selecting,
  selected,
  selectedIds,
  onBulkActed,
  onRename,
  onOpenDetail,
  onStartSnooze,
  onOpenChange,
  triggerClassName,
}: {
  item: LocalTdlItem;
  categories: SectionConfig[];
  selecting?: boolean;
  selected?: boolean;
  // The full current selection, so an action can fan out to every selected item
  // when this item is part of a multi-selection.
  selectedIds?: Set<string>;
  onBulkActed?: () => void;
  onRename: () => void;
  onOpenDetail: () => void;
  onStartSnooze: () => void;
  // Mirrors the open state out, so the host can lift the row/card above its
  // neighbours while the menu is showing.
  onOpenChange?: (open: boolean) => void;
  triggerClassName?: string;
}) {
  const [menu, setMenu] = useState(false);
  const [moving, setMoving] = useState(false);

  function setOpen(next: boolean) {
    setMenu(next);
    if (!next) setMoving(false);
    onOpenChange?.(next);
  }

  const snoozed = isSnoozed(item);
  const paused = item.status === "paused";

  // When this item is one of several selected, its menu actions apply to the
  // whole selection rather than just this item. A lone selection (or an
  // unselected item) stays a single-item action.
  const bulkActive = !!(selecting && selected && selectedIds && selectedIds.size > 1);
  const targetIds = bulkActive ? [...selectedIds!] : [item.id];
  const afterAction = () => {
    if (bulkActive) onBulkActed?.();
  };

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(!menu)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-text",
          triggerClassName,
        )}
        aria-label="More"
        aria-expanded={menu}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {menu && (
        <div className="absolute right-0 top-9 z-20 min-w-[160px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {bulkActive && (
            <div className="border-b border-line px-3 py-1.5 text-[11px] font-medium text-muted">
              Applies to {selectedIds!.size} selected
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              onRename();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
          >
            <Pencil className="h-4 w-4" /> Rename
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenDetail();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
          >
            <StickyNote className="h-4 w-4" /> Details
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !item.is_reluctant;
              void setReluctantItems(targetIds, next).then(afterAction);
              // Marking a single item opens its detail so the reason can be
              // recorded; a bulk mark skips that (no single reason to edit).
              if (next && !bulkActive) onOpenDetail();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
          >
            <ThumbsDown className="h-4 w-4" />{" "}
            {item.is_reluctant ? "Clear don't-want-to-do" : "Don't want to do"}
          </button>
          <button
            type="button"
            onClick={() => setMoving((v) => !v)}
            aria-expanded={moving}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
          >
            <FolderInput className="h-4 w-4" /> Move to
            <ChevronRight className={cn("ml-auto h-4 w-4 transition-transform", moving && "rotate-90")} />
          </button>
          {moving &&
            categories.map((s) => {
              const current = s.key === item.section;
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={current && !bulkActive}
                  onClick={() => {
                    void moveItemsToSection(targetIds, s.key).then(afterAction);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 py-2 pl-9 pr-3 text-left text-sm",
                    current ? "text-muted" : "hover:bg-surface2",
                  )}
                >
                  {s.label}
                  {current && <Check className="ml-auto h-4 w-4" />}
                </button>
              );
            })}
          {snoozed ? (
            <button
              type="button"
              onClick={() => {
                void unsnoozeItems(targetIds).then(afterAction);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
            >
              <BellOff className="h-4 w-4" /> Wake up
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                onStartSnooze();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
            >
              <Clock className="h-4 w-4" /> Snooze
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void archiveItems(targetIds).then(afterAction);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
          >
            <Archive className="h-4 w-4" /> Archive
          </button>
          {paused ? (
            <button
              type="button"
              onClick={() => {
                void resumeItems(targetIds).then(afterAction);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
            >
              <Play className="h-4 w-4" /> Resume
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                void pauseItems(targetIds).then(afterAction);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
            >
              <Pause className="h-4 w-4" /> Pause
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void cancelItems(targetIds).then(afterAction);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
          >
            <X className="h-4 w-4" /> Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void deleteItems(targetIds).then(afterAction);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface2"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
