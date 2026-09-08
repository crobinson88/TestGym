import { useState } from "react";
import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckSquare,
  Clock,
  Flame,
  GripVertical,
  Square,
  StickyNote,
  ThumbsDown,
} from "lucide-react";
import { Calendar } from "@/components/ui/Calendar";
import { Input } from "@/components/ui/Input";
import { addDays, cn, dayMonth, relativeDay } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import { ageLevel } from "../age";
import { cycleStatus, snoozeItems, updateItem } from "../repo";
import type { SectionConfig } from "../sections";
import { QUADRANT_BY_KEY } from "../quadrant";
import { isSnoozed } from "../snooze";
import { ItemActionsMenu } from "./ItemActionsMenu";
import { AGE_CLASSES, QUADRANT_COLOR } from "./itemStyles";
import { ItemDetail } from "./ItemDetail";
import { StatusPill } from "./StatusPill";

type SortableReturn = ReturnType<typeof useSortable>;

interface DragBinding {
  setNodeRef: SortableReturn["setNodeRef"];
  style: CSSProperties;
  attributes: SortableReturn["attributes"];
  listeners: SortableReturn["listeners"];
  dragging: boolean;
}

export interface BoardCardProps {
  item: LocalTdlItem;
  // Draws the insertion line: this is where the card in flight would land.
  indicate?: boolean;
  categories: SectionConfig[];
  focused?: boolean;
  selecting?: boolean;
  selected?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onBulkActed?: () => void;
}

// A card in a real category lane: draggable between lanes, which is what moves
// the task to another category.
export function BoardCard(props: BoardCardProps) {
  const sortable = useSortable({
    id: props.item.id,
    data: { section: props.item.section, isRecurring: props.item.is_recurring },
  });
  return (
    <BoardCardBase
      {...props}
      drag={{
        setNodeRef: sortable.setNodeRef,
        style: {
          transform: CSS.Transform.toString(sortable.transform),
          transition: sortable.transition,
          opacity: sortable.isDragging ? 0.4 : 1,
        },
        attributes: sortable.attributes,
        listeners: sortable.listeners,
        dragging: sortable.isDragging,
      }}
    />
  );
}

// A card in one of the mirror lanes (Priorities / Do First). It shows the same
// task as a card in a real lane, so it is deliberately not a sortable — two
// draggables can't share an id, and membership there is driven by the rank or
// the quadrant tag, not by hand-ordering.
export function StaticBoardCard(props: BoardCardProps & { marker?: "flame" | "rank" }) {
  const { marker, ...rest } = props;
  return (
    <BoardCardBase
      {...rest}
      marker={marker}
      drag={{
        setNodeRef: () => {},
        style: {},
        attributes: {} as SortableReturn["attributes"],
        listeners: undefined,
        dragging: false,
      }}
    />
  );
}

// Read-only preview rendered under the pointer while a card is in flight.
export function BoardCardPreview({ item }: { item: LocalTdlItem }) {
  return (
    <div className="w-[268px] rotate-2 rounded-xl border border-accent/60 bg-surface px-3 py-2 text-sm shadow-2xl">
      {item.title}
    </div>
  );
}

function BoardCardBase({
  item,
  categories,
  focused,
  selecting,
  selected,
  selectedIds,
  onToggleSelect,
  onBulkActed,
  indicate,
  marker,
  drag,
}: BoardCardProps & { marker?: "flame" | "rank"; drag: DragBinding }) {
  const [editing, setEditing] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [snoozing, setSnoozing] = useState(false);

  const cfg = categories.find((c) => c.key === item.section);
  const hasDueDate = cfg?.hasDueDate ?? true;
  const hasTimeEstimate = cfg?.hasTimeEstimate ?? true;
  const done = item.status === "done";
  const cancelled = item.status === "cancelled";
  const paused = item.status === "paused";
  const snoozed = isSnoozed(item);
  const hasDetail = !!item.notes?.trim() || (item.images?.length ?? 0) > 0;
  const level = snoozed ? 0 : ageLevel(item);
  const quadrant = item.eisenhower_quadrant ? QUADRANT_BY_KEY[item.eisenhower_quadrant] : null;

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
        "rounded-xl border border-line bg-surface2/50 shadow-sm transition",
        AGE_CLASSES[level],
        focused && "ring-1 ring-inset ring-accent/40",
        selected && "bg-accent/10 ring-1 ring-inset ring-accent/60",
        (cancelled || snoozed || paused) && "opacity-50",
        menu && "relative z-30",
        drag.dragging && "shadow-none",
        indicate &&
          "relative before:absolute before:-top-1 before:left-0 before:right-0 before:h-0.5 before:rounded-full before:bg-accent before:content-['']",
      )}
    >
      <div className="flex items-start gap-1 px-1.5 py-1.5">
        {selecting ? (
          <button
            type="button"
            onClick={() => onToggleSelect?.(item.id)}
            className="flex h-7 w-6 shrink-0 items-center justify-center text-muted hover:text-text"
            aria-label={selected ? "Deselect" : "Select"}
            aria-pressed={selected}
          >
            {selected ? (
              <CheckSquare className="h-4 w-4 text-accent" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        ) : marker === "flame" ? (
          <span
            className="flex h-7 w-6 shrink-0 items-center justify-center text-danger/70"
            aria-hidden
          >
            <Flame className="h-4 w-4" />
          </span>
        ) : marker === "rank" ? (
          <span
            className="flex h-7 w-6 shrink-0 items-center justify-center text-xs font-semibold tabular-nums text-warn"
            aria-hidden
          >
            {item.priority_rank}
          </span>
        ) : (
          // Dragging is handle-only so the lane still scrolls under a finger.
          <button
            {...drag.attributes}
            {...drag.listeners}
            className="flex h-7 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted/50 hover:text-text active:cursor-grabbing"
            aria-label={`Drag ${item.title}`}
            tabIndex={-1}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}

        <div className="min-w-0 flex-1 pt-0.5">
          {editing ? (
            <Input
              autoFocus
              defaultValue={item.title}
              className="h-8 px-2 text-sm"
              onBlur={(e) => {
                const next = e.currentTarget.value.trim();
                if (next && next !== item.title) void updateItem(item.id, { title: next });
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
                "flex w-full items-start gap-1 text-left text-sm leading-snug",
                (done || cancelled) && "text-muted line-through",
              )}
            >
              <span className={cn("min-w-0", detailOpen ? "whitespace-normal break-words" : "line-clamp-3")}>
                {item.title}
              </span>
              {hasDetail && <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />}
            </button>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1">
            {quadrant && (
              <span
                className={cn(
                  "rounded bg-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  QUADRANT_COLOR[quadrant.key],
                )}
                title={`${quadrant.label} — ${quadrant.hint}`}
              >
                {quadrant.short}
              </span>
            )}
            {item.priority_rank != null && marker !== "rank" && (
              <span
                className="rounded bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-warn"
                title={`Priority ${item.priority_rank}`}
              >
                P{item.priority_rank}
              </span>
            )}
            {item.is_recurring && (
              <span className="rounded bg-surface px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                Recurring
              </span>
            )}
            {hasTimeEstimate &&
              (editingTime ? (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  autoFocus
                  defaultValue={item.time_estimate_min ?? ""}
                  className="h-6 w-14 px-1 text-center text-xs"
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
                    "inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[10px] tabular-nums",
                    item.time_estimate_min != null ? "text-text" : "text-muted hover:text-text",
                  )}
                  aria-label={
                    item.time_estimate_min != null
                      ? `Time ${item.time_estimate_min} minutes`
                      : "Set time"
                  }
                >
                  <Clock className="h-3 w-3" />
                  {item.time_estimate_min != null ? `${item.time_estimate_min}m` : "—"}
                </button>
              ))}
            {item.is_reluctant && (
              <span className="text-warn" title="Don't want to do">
                <ThumbsDown className="h-3.5 w-3.5" aria-label="Don't want to do" />
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted">
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
                <Clock className="h-3 w-3" /> until {dayMonth(item.snoozed_until)}
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
                    if (next > item.snapshot_date) {
                      void snoozeItems(targetIds, next).then(afterAction);
                    }
                    setSnoozing(false);
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-1.5">
            <StatusPill
              status={item.status}
              section={item.section}
              compact
              onClick={() => void cycleStatus(item.id)}
            />
          </div>
        </div>

        <ItemActionsMenu
          item={item}
          categories={categories}
          selecting={selecting}
          selected={selected}
          selectedIds={selectedIds}
          onBulkActed={onBulkActed}
          onRename={() => setEditing(true)}
          onOpenDetail={() => setDetailOpen(true)}
          onStartSnooze={() => setSnoozing(true)}
          onOpenChange={setMenu}
          triggerClassName="h-7 w-7"
        />
      </div>
      {detailOpen && (
        <div className="border-t border-line/50 px-1.5 pb-1.5">
          <ItemDetail item={item} />
        </div>
      )}
    </li>
  );
}
