import { useState } from "react";
import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  BellOff,
  Check,
  ChevronRight,
  Clock,
  FolderInput,
  GripVertical,
  MoreVertical,
  Pencil,
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
  archiveItem,
  cycleStatus,
  deleteItem,
  moveItemToSection,
  setPriorityRank,
  setReluctant,
  MAX_PRIORITY_RANK,
  snoozeItem,
  unsnoozeItem,
  updateItem,
} from "../repo";
import type { SectionConfig } from "../sections";
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

interface ItemRowProps {
  item: LocalTdlItem;
  categories: SectionConfig[];
  focused?: boolean;
  takenRanks: Set<number>;
}

// Border + background that intensify as an item goes unworked, up to 3 days
// stale. Level 0 keeps a transparent left rail so every row stays aligned.
const AGE_CLASSES: Record<AgeLevel, string> = {
  0: "border-l-2 border-l-transparent",
  1: "border-l-2 border-l-warn/40 bg-warn/[0.04]",
  2: "border-l-2 border-l-warn/70 bg-warn/[0.07]",
  3: "border-l-2 border-l-danger/80 bg-danger/[0.10]",
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

function ItemRowBase({
  item,
  categories,
  focused,
  takenRanks,
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

  return (
    <li
      ref={drag.setNodeRef}
      style={drag.style}
      data-item-id={item.id}
      className={cn(
        "group relative block w-full max-w-full min-w-0 border-b border-line/50 px-2 py-2 last:border-b-0",
        AGE_CLASSES[level],
        focused && "bg-surface2/40",
        (cancelled || snoozed) && "opacity-50",
        menu && "z-30",
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-1.5">
      <button
        {...drag.attributes}
        {...drag.listeners}
        className="flex h-9 w-6 shrink-0 cursor-grab items-center justify-center text-muted hover:text-text"
        aria-label="Drag"
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>
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
            onClick={() => setDetailOpen((v) => !v)}
            aria-expanded={detailOpen}
            title="Click for details"
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
                  if (next > item.snapshot_date) void snoozeItem(item.id, next);
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
                void setReluctant(item.id, next);
                // Marking it open the detail so the reason can be recorded.
                if (next) setDetailOpen(true);
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
                    disabled={current}
                    onClick={() => {
                      void moveItemToSection(item.id, s.key);
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
                  void unsnoozeItem(item.id);
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
                void archiveItem(item.id);
                setMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
            >
              <Archive className="h-4 w-4" /> Archive
            </button>
            <button
              type="button"
              onClick={() => {
                void updateItem(item.id, { status: "cancelled" });
                setMenu(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void deleteItem(item.id);
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
