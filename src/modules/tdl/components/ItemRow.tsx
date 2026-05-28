import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Flag, GripVertical, MoreVertical, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import {
  cycleStatus,
  deleteItem,
  togglePriority,
  updateItem,
} from "../repo";
import { SECTION_BY_KEY } from "../sections";
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
  const cfg = SECTION_BY_KEY[item.section];
  const done = item.status === "done";
  const cancelled = item.status === "cancelled";

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-item-id={item.id}
      className={cn(
        "group flex items-center gap-2 border-b border-line/50 px-2 py-2 last:border-b-0",
        focused && "bg-surface2/40",
        cancelled && "opacity-50",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="flex h-9 w-6 cursor-grab items-center justify-center text-muted hover:text-text"
        aria-label="Drag"
        tabIndex={-1}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void togglePriority(item.id)}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg",
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
        {(cfg.hasDueDate && item.due_date) || (cfg.hasTimeEstimate && item.time_estimate_min) ? (
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
            {cfg.hasDueDate && item.due_date && <span>due {item.due_date}</span>}
            {cfg.hasTimeEstimate && item.time_estimate_min && (
              <span>{item.time_estimate_min}m</span>
            )}
          </div>
        ) : null}
      </div>
      <StatusPill
        status={item.status}
        section={item.section}
        compact
        onClick={() => void cycleStatus(item.id)}
      />
      <div className="relative">
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
