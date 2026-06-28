import { useState } from "react";
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
  Trash2,
  X,
} from "lucide-react";
import { Calendar } from "@/components/ui/Calendar";
import { Input } from "@/components/ui/Input";
import { addDays, cn, dayMonth } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import {
  archiveItem,
  cycleStatus,
  deleteItem,
  moveItemToSection,
  setPriorityRank,
  MAX_PRIORITY_RANK,
  snoozeItem,
  unsnoozeItem,
  updateItem,
} from "../repo";
import type { SectionConfig } from "../sections";
import { isSnoozed } from "../snooze";
import { ItemDetail } from "./ItemDetail";
import { StatusPill } from "./StatusPill";

export function ItemRow({
  item,
  categories,
  focused,
}: {
  item: LocalTdlItem;
  categories: SectionConfig[];
  focused?: boolean;
}) {
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

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-item-id={item.id}
      className={cn(
        "group relative block w-full max-w-full min-w-0 border-b border-line/50 px-2 py-2 last:border-b-0",
        focused && "bg-surface2/40",
        (cancelled || snoozed) && "opacity-50",
        menu && "z-30",
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-1.5">
      <button
        {...attributes}
        {...listeners}
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
          <option key={n} value={n}>
            {n}
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
