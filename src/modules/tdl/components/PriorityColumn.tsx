import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronRight, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocalTdlItem } from "../types";
import type { SectionConfig } from "../sections";
import { PRIORITY_SORTABLE_PREFIX, PriorityItemRow } from "./ItemRow";

// Virtual board column that mirrors every ranked item for the day, ordered 1 →
// 10. Items keep their real category and still render there; this is an
// at-a-glance list of what matters most today. No add box — drag to reorder
// rewrites the ranks (order is the rank itself).
export function PriorityColumn({
  items,
  categories,
  takenRanks,
  focusedId,
  forceExpanded = false,
  selecting = false,
  selectedIds,
  onToggleSelect,
}: {
  items: LocalTdlItem[];
  categories: SectionConfig[];
  takenRanks: Set<number>;
  focusedId?: string;
  forceExpanded?: boolean;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  // Mirrors SectionColumn's mobile-only collapse, but priorities lead the board
  // so they start open.
  const [collapsed, setCollapsed] = useState(false);
  const isCollapsed = forceExpanded ? false : collapsed;

  return (
    <section
      className="flex flex-col rounded-2xl border border-warn/40 bg-surface"
      data-section-key="__priorities__"
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "Expand Priorities" : "Collapse Priorities"}
          className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-text sm:hidden"
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform", !isCollapsed && "rotate-90")}
          />
        </button>
        <h2 className="mr-auto flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-warn">
          <ListChecks className="h-4 w-4" />
          Priorities
        </h2>
        <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] tabular-nums text-warn">
          {items.length} ranked
        </span>
      </header>

      {items.length === 0 ? (
        <p
          className={cn(
            "px-3 py-4 text-center text-xs text-muted",
            isCollapsed && "hidden sm:block",
          )}
        >
          No priorities set. Give a task a rank 1–10 to pin it here.
        </p>
      ) : (
        <SortableContext
          items={items.map((i) => PRIORITY_SORTABLE_PREFIX + i.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className={cn(isCollapsed && "hidden sm:block")}>
            {items.map((item) => (
              <PriorityItemRow
                key={item.id}
                item={item}
                categories={categories}
                focused={focusedId === item.id}
                takenRanks={takenRanks}
                selecting={selecting}
                selected={selectedIds?.has(item.id)}
                onToggleSelect={onToggleSelect}
              />
            ))}
          </ul>
        </SortableContext>
      )}
    </section>
  );
}
