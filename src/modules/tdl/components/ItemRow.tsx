import { useState } from "react";
import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  BellOff,
  Check,
  CheckSquare,
  ChevronRight,
  Clock,
  Flame,
  FolderInput,
  GripVertical,
  MoreVertical,
  Pencil,
  Square,
  StickyNote,
  ThumbsDown,
  Trash2,
  X,
} from "lucide-react";
import { Calendar } from "@/components/ui/Calendar";
import { Input } from "@/components/ui/Input";
import { addDays, cn, dayMonth, relativeDay } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import { ageLevel, type AgeLevel } from "../age";
import {
  archiveItems,
  cancelItems,
  cycleStatus,
  deleteItems,
  moveItemsToSection,
  setPriorityRank,
  setQuadrant,
  setReluctantItems,
  MAX_PRIORITY_RANK,
  snoozeItems,
  unsnoozeItems,
  updateItem,
} from "../repo";
import type { SectionConfig } from "../sections";
import { QUADRANTS, QUADRANT_BY_KEY } from "../quadrant";
import type { TdlQuadrant } from "@/lib/database.types";
import { isSnoozed } from "../snooze";
import { ItemDetail } from "./ItemDetail";
import { StatusPill } from "./StatusPill";

type SortableReturn = ReturnType<typeof useSortable>;

interface DragBinding {
  setNodeRef: SortableReturn["setNodeRef"];
  style: CSSProperties;
  attributes: SortableReturn["attributes"];
  listeners: SortableReturn["listeners"];
}

function toDragBinding(s: SortableReturn): DragBinding {
  return {
    setNodeRef: s.setNodeRef,
    style: {
      transform: CSS.Transform.toString(s.transform),
      transition: s.transition,
      opacity: s.isDragging ? 0.4 : 1,
    },
    attributes: s.attributes,
    listeners: s.listeners,
  };
}

// The Priorities column mirrors items that also render as sortables in their
// real category column, so its rows get a prefixed dnd-kit id to stay in a
// separate sortable namespace. DayView routes drops by this prefix.
export const PRIORITY_SORTABLE_PREFIX = "priority:";

// A no-op drag binding for the read-only mirror columns (Do First). The row
// still renders inside the board's DndContext but isn't itself draggable.
const STATIC_DRAG: DragBinding = {
  setNodeRef: () => {},
  style: {},
  attributes: {} as SortableReturn["attributes"],
  listeners: undefined,
};

interface ItemRowProps {
  item: LocalTdlItem;
  categories: SectionConfig[];
  focused?: boolean;
  takenRanks: Set<number>;
  // 1-based ordinal within the category, shown as a leading number. Omitted in
  // the Priorities column, where the rank already numbers the rows.
  index?: number;
  selecting?: boolean;
  selected?: boolean;
  // The full current selection, so a per-row menu action can fan out to every
  // selected item when this row is part of a multi-selection.
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  // Called after a menu action fanned out across the selection, so the parent
  // can clear it (matching the BulkActionBar).
  onBulkActed?: () => void;
  // Read-only mirror rows (Do First): no drag handle, a Flame marker instead.
  dragless?: boolean;
}

// Border + background that intensify as an item goes unworked, up to 3 days
// stale. Level 0 keeps a transparent left rail so every row stays aligned.
const AGE_CLASSES: Record<AgeLevel, string> = {
  0: "border-l-2 border-l-transparent",
  1: "border-l-2 border-l-warn/40 bg-warn/[0.04]",
  2: "border-l-2 border-l-warn/70 bg-warn/[0.07]",
  3: "border-l-2 border-l-danger/80 bg-danger/[0.10]",
};

// Row-selector text colour per quadrant; muted when unclassified.
const QUADRANT_COLOR: Record<TdlQuadrant, string> = {
  do_first: "text-danger",
  schedule: "text-accent",
  delegate: "text-warn",
  eliminate: "text-muted",
};

// Draggable row for the category board columns.
export function ItemRow(props: ItemRowProps) {
  const sortable = useSortable({
    id: props.item.id,
    data: { section: props.item.section, isRecurring: props.item.is_recurring },
  });
  return <ItemRowBase {...props} drag={toDragBinding(sortable)} />;
}

// Draggable row for the virtual Priorities column. Reordering here rewrites the
// ranks (see reorderPriorities) rather than the section positions.
export function PriorityItemRow(props: ItemRowProps) {
  const sortable = useSortable({
    id: PRIORITY_SORTABLE_PREFIX + props.item.id,
    data: { priority: true },
  });
  return <ItemRowBase {...props} drag={toDragBinding(sortable)} />;
}

// Read-only row for the virtual Do First column. It mirrors an item that also
// renders (and is draggable) in its real category column, so it isn't a
// sortable itself — the quadrant tag drives membership, not manual ordering.
export function DoFirstItemRow(props: ItemRowProps) {
  return <ItemRowBase {...props} drag={STATIC_DRAG} dragless />;
}

function ItemRowBase({
  item,
  categories,
  focused,
  takenRanks,
  index,
  selecting,
  selected,
  selectedIds,
  onToggleSelect,
  onBulkActed,
  dragless,
  drag,
}: ItemRowProps & { drag: DragBinding }) {
  const [editing, setEditing] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [moving, setMoving] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const cfg = categories.find((c) => c.key === item.section);
  const hasDueDate = cfg?.hasDueDate ?? true;
  const done = item.status === "done";
  const cancelled = item.status === "cancelled";
  const snoozed = isSnoozed(item);
  const hasDetail = !!item.notes?.trim() || (item.images?.length ?? 0) > 0;
  // Snoozed items are deliberately deferred, so they never build urgency.
  const level = snoozed ? 0 : ageLevel(item);

  // When this row is one of several selected items, its "More" menu actions
  // apply to the whole selection rather than just this row. A lone selection
  // (or an unselected row) stays a single-item action.
  const bulkActive = !!(selecting && selected && selectedIds && selectedIds.size > 1);
  const targetIds = bulkActive ? [...selectedIds!] : [item.id];
  const afterAction = () => {
    if (bulkActive) onBulkActed?.();
  };

  return (
    <li
      ref={drag.setNodeRef}
      style={drag.style}
      data-item-id={item.id}
      className={cn(
        "group relative block w-full max-w-full min-w-0 border-b border-line/50 px-2 py-2 last:border-b-0",
        AGE_CLASSES[level],
        focused && "bg-surface2/40",
        selected && "bg-accent/10 ring-1 ring-inset ring-accent/60",
        (cancelled || snoozed) && "opacity-50",
        menu && "z-30",
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-1.5">
      {selecting ? (
        <button
          type="button"
          onClick={() => onToggleSelect?.(item.id)}
          className="flex h-9 w-6 shrink-0 items-center justify-center text-muted hover:text-text"
          aria-label={selected ? "Deselect" : "Select"}
          aria-pressed={selected}
        >
          {selected ? (
            <CheckSquare className="h-4 w-4 text-accent" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </button>
      ) : dragless ? (
        <span
          className="flex h-9 w-6 shrink-0 items-center justify-center text-danger/70"
          aria-hidden
        >
          <Flame className="h-4 w-4" />
        </span>
      ) : (
        <button
          {...drag.attributes}
          {...drag.listeners}
          className="flex h-9 w-6 shrink-0 cursor-grab items-center justify-center text-muted hover:text-text"
          aria-label="Drag"
          tabIndex={-1}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      {index != null && (
        <span
          className={cn(
            "w-5 shrink-0 text-right text-xs tabular-nums text-muted",
            (done || cancelled) && "line-through",
          )}
          aria-hidden
        >
          {index}.
        </span>
      )}
      {editingTime ? (
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step={1}
          autoFocus
          defaultValue={item.time_estimate_min ?? ""}
          className="h-9 w-12 shrink-0 px-1 text-center text-sm"
          aria-label="Time in minutes"
          onBlur={(e) => {
            const raw = e.currentTarget.value.trim();
            const next = raw === "" ? null : Math.max(0, Math.trunc(Number(raw)));
            if (raw !== "" && Number.isNaN(next)) {
              setEditingTime(false);
              return;
            }
            if (next !== item.time_estimate_min) {
              void updateItem(item.id, { time_estimate_min: next });
            }
            setEditingTime(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
            if (e.key === "Escape") setEditingTime(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingTime(true)}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg tabular-nums",
            item.time_estimate_min != null ? "text-text" : "text-muted hover:text-text",
          )}
          aria-label={item.time_estimate_min != null ? `Time ${item.time_estimate_min} minutes` : "Set time"}
        >
          {item.time_estimate_min != null ? item.time_estimate_min : <Clock className="h-4 w-4" />}
        </button>
      )}
      <select
        value={item.priority_rank ?? ""}
        onChange={(e) => {
          const v = e.currentTarget.value;
          void setPriorityRank(item.id, v === "" ? null : Number(v));
        }}
        aria-label={item.priority_rank != null ? `Priority rank ${item.priority_rank}` : "Set priority rank"}
        title={item.priority_rank != null ? `Priority ${item.priority_rank}` : "Set priority rank"}
        className={cn(
          "h-9 w-9 shrink-0 cursor-pointer appearance-none rounded-lg bg-transparent text-center text-sm font-semibold tabular-nums outline-none focus:bg-surface2",
          item.priority_rank != null ? "text-warn" : "text-muted hover:text-text",
        )}
      >
        <option value="">—</option>
        {Array.from({ length: MAX_PRIORITY_RANK }, (_, i) => i + 1).map((n) => (
          <option key={n} value={n} disabled={takenRanks.has(n) && n !== item.priority_rank}>
            {n}
            {takenRanks.has(n) && n !== item.priority_rank ? " (taken)" : ""}
          </option>
        ))}
      </select>
      <select
        value={item.eisenhower_quadrant ?? ""}
        onChange={(e) => {
          const v = e.currentTarget.value;
          void setQuadrant(item.id, v === "" ? null : (v as TdlQuadrant));
        }}
        aria-label={
          item.eisenhower_quadrant != null
            ? `Quadrant ${QUADRANT_BY_KEY[item.eisenhower_quadrant].label}`
            : "Set Eisenhower quadrant"
        }
        title={
          item.eisenhower_quadrant != null
            ? `${QUADRANT_BY_KEY[item.eisenhower_quadrant].label} — ${QUADRANT_BY_KEY[item.eisenhower_quadrant].hint}`
            : "Set Eisenhower quadrant"
        }
        className={cn(
          "h-9 w-10 shrink-0 cursor-pointer appearance-none rounded-lg bg-transparent text-center text-[11px] font-semibold uppercase outline-none focus:bg-surface2",
          item.eisenhower_quadrant != null
            ? QUADRANT_COLOR[item.eisenhower_quadrant]
            : "text-muted hover:text-text",
        )}
      >
        <option value="">—</option>
        {QUADRANTS.map((q) => (
          <option key={q.key} value={q.key}>
            {q.short} · {q.label}
          </option>
        ))}
      </select>
      <div className="min-w-0 flex-1">
        {editing ? (
          <Input
            autoFocus
            defaultValue={item.title}
            className="h-9 px-2 text-sm"
            onBlur={(e) => {
              const next = e.currentTarget.value.trim();
              if (next && next !== item.title) {
                void updateItem(item.id, { title: next });
              }
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => (selecting ? onToggleSelect?.(item.id) : setDetailOpen((v) => !v))}
            aria-expanded={selecting ? undefined : detailOpen}
            title={selecting ? (selected ? "Deselect" : "Select") : "Click for details"}
            className={cn(
              "flex w-full select-none items-center gap-1 text-left text-sm",
              done && "line-through text-muted",
              cancelled && "line-through",
            )}
          >
            <span className={cn("min-w-0", detailOpen ? "whitespace-normal break-words" : "truncate")}>
              {item.title}
            </span>
            {hasDetail && <StickyNote className="h-3.5 w-3.5 shrink-0 text-muted" />}
          </button>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          <span>added {dayMonth(item.origin_snapshot_date ?? item.snapshot_date)}</span>
          {item.last_worked_at && (
            <span
              className={cn(
                level === 3 && "text-danger",
                level > 0 && level < 3 && "text-warn",
              )}
            >
              worked {relativeDay(item.last_worked_at.slice(0, 10), item.snapshot_date)}
            </span>
          )}
          {hasDueDate && item.due_date && <span>due {item.due_date}</span>}
          {snoozed && item.snoozed_until && (
            <span className="inline-flex items-center gap-1 text-accent">
              <Clock className="h-3 w-3" /> snoozed until {dayMonth(item.snoozed_until)}
            </span>
          )}
        </div>
        {snoozing && (
          <div className="relative">
            <div className="fixed inset-0 z-30" onClick={() => setSnoozing(false)} aria-hidden />
            <div className="absolute left-0 top-1 z-40">
              <Calendar
                value={item.snoozed_until ?? null}
                min={addDays(item.snapshot_date, 1)}
                onSelect={(next) => {
                  if (next > item.snapshot_date) void snoozeItems(targetIds, next).then(afterAction);
                  setSnoozing(false);
                }}
              />
            </div>
          </div>
        )}
      </div>
      <StatusPill
        status={item.status}
        section={item.section}
        compact
        className="shrink-0"
        onClick={() => void cycleStatus(item.id)}
      />
      {item.is_reluctant && (
        <span
          className="flex h-9 w-5 shrink-0 items-center justify-center text-warn"
          title="Don't want to do"
        >
          <ThumbsDown className="h-4 w-4" aria-label="Don't want to do" />
        </span>
      )}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() =>
            setMenu((m) => {
              if (m) setMoving(false);
              return !m;
            })
          }
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-text"
          aria-label="More"
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
                setEditing(true);
                setMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
            >
              <Pencil className="h-4 w-4" /> Rename
            </button>
            <button
              type="button"
              onClick={() => {
                setDetailOpen(true);
                setMenu(false);
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
                if (next && !bulkActive) setDetailOpen(true);
                setMenu(false);
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
                      setMoving(false);
                      setMenu(false);
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
                  setMenu(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
              >
                <BellOff className="h-4 w-4" /> Wake up
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSnoozing(true);
                  setMenu(false);
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
                setMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
            >
              <Archive className="h-4 w-4" /> Archive
            </button>
            <button
              type="button"
              onClick={() => {
                void cancelItems(targetIds).then(afterAction);
                setMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void deleteItems(targetIds).then(afterAction);
                setMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface2"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        )}
      </div>
      </div>
      {detailOpen && <ItemDetail item={item} />}
    </li>
  );
}
