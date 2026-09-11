import { ThumbsDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import type { SectionConfig } from "../sections";
import { ReluctantItemRow } from "./ItemRow";
import { reluctantCounts } from "../reluctance";

// Virtual board column that auto-populates with every item flagged "Don't want
// to do" (is_reluctant), ranked ones first then by board position. Items keep
// their real category and still render there; this is a read-only, at-a-glance
// list of the tasks being put off — membership is the reluctance flag set from
// the row's More menu, so there's nothing to add or reorder here.
export function ReluctantColumn({
  items,
  categories,
  takenRanks,
  focusedId,
  forceExpanded = false,
  collapsed = false,
  onToggleCollapse,
  selecting = false,
  selectedIds,
  onToggleSelect,
  onBulkActed,
}: {
  items: LocalTdlItem[];
  categories: SectionConfig[];
  takenRanks: Set<number>;
  focusedId?: string;
  forceExpanded?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onBulkActed?: () => void;
}) {
  const isCollapsed = forceExpanded ? false : collapsed;

  // Completed vs still-to-do split for the header badges, off the same counter
  // that feeds the header's "Did Anyway" pie.
  const { total, done, outstanding } = reluctantCounts(items);

  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-accent/40 bg-surface",
        isCollapsed && "self-start",
      )}
      data-section-key="__reluctant__"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand Don't want to do" : "Collapse Don't want to do"}
          className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-text"
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform", !isCollapsed && "rotate-90")}
          />
        </button>
        <h2 className="mr-auto flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-accent">
          <ThumbsDown className="h-4 w-4" />
          Don&rsquo;t want to do
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] tabular-nums text-success">
            {done} done
          </span>
          <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] tabular-nums text-danger">
            {outstanding} left
          </span>
          <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted">
            {total} total
          </span>
        </div>
      </header>

      {items.length === 0 ? (
        <p
          className={cn(
            "px-3 py-4 text-center text-xs text-muted",
            isCollapsed && "hidden",
          )}
        >
          Nothing flagged. Mark a task “Don&rsquo;t want to do” from its More menu to pin it here.
        </p>
      ) : (
        <ul className={cn(isCollapsed && "hidden")}>
          {items.map((item, i) => (
            <ReluctantItemRow
              key={item.id}
              item={item}
              categories={categories}
              index={i + 1}
              focused={focusedId === item.id}
              takenRanks={takenRanks}
              selecting={selecting}
              selected={selectedIds?.has(item.id)}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onBulkActed={onBulkActed}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
