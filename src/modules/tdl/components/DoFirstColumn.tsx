import { Flame, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import type { SectionConfig } from "../sections";
import { DoFirstItemRow } from "./ItemRow";

// Virtual board column that auto-populates with every "Do First" item for the
// day (Eisenhower urgent & important), ranked ones first then by board position.
// Items keep their real category and still render there; this is a read-only,
// at-a-glance list of what has to happen today — membership is driven by the
// quadrant tag, so there's nothing to add or reorder here.
export function DoFirstColumn({
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

  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-danger/40 bg-surface",
        isCollapsed && "self-start",
      )}
      data-section-key="__do_first__"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand Do First" : "Collapse Do First"}
          className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-text"
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform", !isCollapsed && "rotate-90")}
          />
        </button>
        <h2 className="mr-auto flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-danger">
          <Flame className="h-4 w-4" />
          Do First
        </h2>
        <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] tabular-nums text-danger">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </header>

      {items.length === 0 ? (
        <p
          className={cn(
            "px-3 py-4 text-center text-xs text-muted",
            isCollapsed && "hidden",
          )}
        >
          No Do First tasks. Tag a task “Do First” (urgent &amp; important) to pin it here.
        </p>
      ) : (
        <ul className={cn(isCollapsed && "hidden")}>
          {items.map((item, i) => (
            <DoFirstItemRow
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
