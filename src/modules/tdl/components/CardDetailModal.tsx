import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { LocalTdlBoardList } from "@/lib/db";
import { MAX_PRIORITY_RANK, cycleStatus, moveItemToBoardList, setPriorityRank, setQuadrant, updateItem } from "../repo";
import { QUADRANTS, QUADRANT_BY_KEY } from "../quadrant";
import type { TdlQuadrant } from "@/lib/database.types";
import { useThreadId } from "../comments";
import type { SectionConfig } from "../sections";
import type { LocalTdlItem } from "../types";
import { CardComments } from "./CardComments";
import { ItemDetail } from "./ItemDetail";
import { QUADRANT_COLOR } from "./itemStyles";
import { StatusPill } from "./StatusPill";

// The full card, opened from the board. A lane is only 280px wide, so the
// description, the images and the comment thread get a proper dialog rather
// than an inline panel squeezed into the column.
export function CardDetailModal({
  item,
  cfg,
  lists,
  takenRanks,
  onClose,
}: {
  item: LocalTdlItem;
  cfg: SectionConfig;
  // The category's lists, so the card can be moved between lanes from here.
  lists: LocalTdlBoardList[];
  takenRanks: Set<number>;
  onClose: () => void;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const threadId = useThreadId(item);
  const currentList =
    lists.find((l) => l.id === item.board_list_id)?.id ?? lists[0]?.id ?? "";

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-bg shadow-2xl">
        <header className="flex items-start gap-2 border-b border-line p-4">
          <div className="min-w-0 flex-1">
            {editingTitle ? (
              <Input
                autoFocus
                defaultValue={item.title}
                aria-label="Card title"
                className="h-10 text-base"
                onBlur={(e) => {
                  const next = e.currentTarget.value.trim();
                  if (next && next !== item.title) void updateItem(item.id, { title: next });
                  setEditingTitle(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                title="Click to rename"
                className="w-full text-left text-base font-semibold leading-snug"
              >
                {item.title}
              </button>
            )}
            <p className="mt-1 text-[11px] uppercase tracking-wide text-muted">{cfg.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface2 hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="space-y-5 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill
              status={item.status}
              section={item.section}
              onClick={() => void cycleStatus(item.id)}
            />
            {lists.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                List
                <select
                  value={currentList}
                  onChange={(e) => void moveItemToBoardList(item.id, e.target.value)}
                  aria-label="List"
                  className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-text outline-none focus:border-accent"
                >
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Priority
              <select
                value={item.priority_rank ?? ""}
                onChange={(e) =>
                  void setPriorityRank(
                    item.id,
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
                aria-label="Priority rank"
                className={cn(
                  "h-9 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-accent",
                  item.priority_rank != null ? "text-warn" : "text-text",
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
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              Quadrant
              <select
                value={item.eisenhower_quadrant ?? ""}
                onChange={(e) =>
                  void setQuadrant(
                    item.id,
                    e.target.value === "" ? null : (e.target.value as TdlQuadrant),
                  )
                }
                aria-label="Eisenhower quadrant"
                className={cn(
                  "h-9 rounded-lg border border-line bg-surface px-2 text-sm outline-none focus:border-accent",
                  item.eisenhower_quadrant
                    ? QUADRANT_COLOR[item.eisenhower_quadrant]
                    : "text-text",
                )}
              >
                <option value="">—</option>
                {QUADRANTS.map((q) => (
                  <option key={q.key} value={q.key}>
                    {q.short} · {q.label}
                  </option>
                ))}
              </select>
            </label>
            {cfg.hasTimeEstimate && (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                Minutes
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  defaultValue={item.time_estimate_min ?? ""}
                  aria-label="Time in minutes"
                  className="h-9 w-20 px-2 text-sm"
                  onBlur={(e) => {
                    const raw = e.currentTarget.value.trim();
                    const next = raw === "" ? null : Math.max(0, Math.trunc(Number(raw)));
                    if (raw !== "" && Number.isNaN(next)) return;
                    if (next !== item.time_estimate_min) {
                      void updateItem(item.id, { time_estimate_min: next });
                    }
                  }}
                />
              </label>
            )}
            {item.eisenhower_quadrant && (
              <span className="text-[11px] text-muted">
                {QUADRANT_BY_KEY[item.eisenhower_quadrant].hint}
              </span>
            )}
          </div>

          <section>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Description
            </h4>
            <ItemDetail item={item} />
          </section>

          <CardComments threadId={threadId} itemId={item.id} />
        </div>
      </div>
    </div>
  );
}
