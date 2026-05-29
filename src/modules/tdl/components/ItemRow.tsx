import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  BellOff,
  Clock,
  Flag,
  GripVertical,
  MoreVertical,
  Trash2,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { addDays, cn, dayMonth } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import {
  archiveItem,
  cycleStatus,
  deleteItem,
  snoozeItem,
  togglePriority,
  unsnoozeItem,
  updateItem,
} from "../repo";
import { SECTION_BY_KEY } from "../sections";
import { isSnoozed } from "../snooze";
import { StatusPill } from "./StatusPill";

export function ItemRow({ item, focused }: { item: LocalTdlItem; focused?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { section: item.section, isRecurring: item.is_recurring },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const cfg = SECTION_BY_KEY[item.section];
  const done = item.status === "done";
  const cancelled = item.status === "cancelled";
  const snoozed = isSnoozed(item);

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-item-id={item.id}
      className={cn(
        "group flex w-full max-w-full min-w-0 items-center gap-1.5 overflow-hidden border-b border-line/50 px-2 py-2 last:border-b-0",
        focused && "bg-surface2/40",
        (cancelled || snoozed) && "opacity-50",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex h-9 w-6 shrink-0 cursor-grab items-center justify-center text-muted hover:text-text"
        aria-label="Drag"
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void togglePriority(item.id)}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          item.is_priority ? "text-warn" : "text-muted hover:text-text",
        )}
        aria-label={item.is_priority ? "Unset priority" : "Set priority"}
      >
        <Flag className={cn("h-4 w-4", item.is_priority && "fill-warn")} />
      </button>
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
            onClick={() => setEditing(true)}
            className={cn(
              "block w-full truncate text-left text-sm",
              done && "line-through text-muted",
              cancelled && "line-through",
            )}
          >
            {item.title}
          </button>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
          <span>added {dayMonth(item.origin_snapshot_date ?? item.snapshot_date)}</span>
          {cfg.hasDueDate && item.due_date && <span>due {item.due_date}</span>}
          {cfg.hasTimeEstimate && item.time_estimate_min && (
            <span>{item.time_estimate_min}m</span>
          )}
          {snoozed && item.snoozed_until && (
            <span className="inline-flex items-center gap-1 text-accent">
              <Clock className="h-3 w-3" /> snoozed until {dayMonth(item.snoozed_until)}
            </span>
          )}
        </div>
        {snoozing && (
          <Input
            type="date"
            autoFocus
            min={addDays(item.snapshot_date, 1)}
            defaultValue={item.snoozed_until ?? addDays(item.snapshot_date, 1)}
            className="mt-1 h-8 w-[150px] px-2 text-xs"
            onBlur={() => setSnoozing(false)}
            onChange={(e) => {
              const next = e.currentTarget.value;
              if (next && next > item.snapshot_date) {
                void snoozeItem(item.id, next);
                setSnoozing(false);
              }
            }}
          />
        )}
      </div>
      <StatusPill
        status={item.status}
        section={item.section}
        compact
        className="shrink-0"
        onClick={() => void cycleStatus(item.id)}
      />
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-text"
          aria-label="More"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {menu && (
          <div className="absolute right-0 top-9 z-20 min-w-[160px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
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
    </li>
  );
}
