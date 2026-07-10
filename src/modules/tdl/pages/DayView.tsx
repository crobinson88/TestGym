import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { todayIsoDate } from "@/lib/utils";
import { useDay, usePrevDateWithItems } from "../hooks";
import { useCategories } from "../categories";
import { UNCATEGORISED, UNCATEGORISED_KEY } from "../sections";
import { selectPriorityItems } from "../priority";
import type { LocalTdlItem } from "../types";
import {
  cycleStatus,
  deleteItem,
  moveItem,
  reorderPriorities,
  reorderSection,
  setPriorityRank,
  usedRanks,
  createItem,
} from "../repo";
import { DayHeader } from "../components/DayHeader";
import { SectionColumn } from "../components/SectionColumn";
import { PriorityColumn } from "../components/PriorityColumn";
import { PRIORITY_SORTABLE_PREFIX } from "../components/ItemRow";
import { RollForwardButton } from "../components/RollForwardButton";

export default function DayView() {
  const params = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const date = params.date ?? todayIsoDate();
  const bundle = useDay(date);
  const prev = usePrevDateWithItems(date);
  const categories = useCategories();

  const [query, setQuery] = useState("");

  const allIds = useMemo(() => bundle?.items.map((i) => i.id) ?? [], [bundle]);
  const [focusIdx, setFocusIdx] = useState(0);
  const focusedId = allIds[focusIdx];

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusIdx >= allIds.length) setFocusIdx(Math.max(0, allIds.length - 1));
  }, [allIds.length, focusIdx]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (!bundle) return;
      if (e.key === "j") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(allIds.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
      } else if (e.key === " ") {
        if (focusedId) {
          e.preventDefault();
          void cycleStatus(focusedId);
        }
      } else if (e.key === "p") {
        if (focusedId) {
          e.preventDefault();
          // Toggle top priority (rank 1) on/off for the focused item.
          const focusedItem = bundle.items.find((i) => i.id === focusedId);
          void setPriorityRank(focusedId, focusedItem?.priority_rank != null ? null : 1);
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (focusedId && e.metaKey) {
          e.preventDefault();
          void deleteItem(focusedId);
        }
      } else if (e.key === "n") {
        e.preventDefault();
        const focusedItem = bundle.items.find((i) => i.id === focusedId);
        const section =
          focusedItem && focusedItem.section !== UNCATEGORISED_KEY
            ? focusedItem.section
            : categories[0]?.key;
        if (!section) return;
        void createItem({ snapshot_date: date, section, title: "New task" });
      }
    },
    [allIds, bundle, focusedId, date, categories],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function onDragEnd(e: DragEndEvent) {
    if (!bundle) return;
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || activeId === overId) return;

    // Drags inside the Priorities column live in their own sortable namespace
    // (prefixed ids). Reordering there rewrites ranks, not section positions.
    const activeIsPriority = activeId.startsWith(PRIORITY_SORTABLE_PREFIX);
    const overIsPriority = overId.startsWith(PRIORITY_SORTABLE_PREFIX);
    if (activeIsPriority || overIsPriority) {
      // Ignore drags that cross between the mirror and a real category column.
      if (!activeIsPriority || !overIsPriority) return;
      const activeReal = activeId.slice(PRIORITY_SORTABLE_PREFIX.length);
      const overReal = overId.slice(PRIORITY_SORTABLE_PREFIX.length);
      const order = selectPriorityItems(bundle.items).map((i) => i.id);
      const from = order.indexOf(activeReal);
      const to = order.indexOf(overReal);
      if (from === -1 || to === -1) return;
      order.splice(from, 1);
      order.splice(to, 0, activeReal);
      void reorderPriorities(date, order);
      return;
    }

    const activeItem = bundle.items.find((i) => i.id === activeId);
    if (!activeItem) return;
    const overItem = bundle.items.find((i) => i.id === overId);

    const sourceSection = activeItem.section;
    const targetSection = overItem?.section ?? sourceSection;
    const isRecurring = activeItem.is_recurring;

    const targetList = (
      bundle.bySection[targetSection]?.[isRecurring ? "recurring" : "dated"] ?? []
    ).filter((i) => i.id !== activeId);

    const insertAt = overItem ? targetList.findIndex((i) => i.id === overItem.id) : targetList.length;
    const orderedIds = [...targetList.map((i) => i.id)];
    orderedIds.splice(Math.max(0, insertAt), 0, activeId);

    if (sourceSection !== targetSection) {
      void moveItem(activeId, targetSection, insertAt);
      void reorderSection(date, targetSection, isRecurring, orderedIds);
    } else {
      void reorderSection(date, targetSection, isRecurring, orderedIds);
    }
  }

  if (!bundle) {
    return <div className="p-6 text-center text-muted">Loading...</div>;
  }

  const empty = bundle.items.length === 0;
  const takenRanks = usedRanks(bundle.items);

  const liveKeys = new Set(categories.map((c) => c.key));
  const orphanSections = Object.keys(bundle.bySection).filter(
    (key) =>
      !liveKeys.has(key) &&
      ((bundle.bySection[key]?.recurring.length ?? 0) > 0 ||
        (bundle.bySection[key]?.dated.length ?? 0) > 0),
  );
  const columns = orphanSections.length > 0 ? [...categories, UNCATEGORISED] : categories;

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matchesQuery = (i: LocalTdlItem) =>
    !searching ||
    i.title.toLowerCase().includes(q) ||
    (i.notes ?? "").toLowerCase().includes(q);

  function listsFor(key: string): { recurring: LocalTdlItem[]; dated: LocalTdlItem[] } {
    let recurring: LocalTdlItem[];
    let dated: LocalTdlItem[];
    if (key !== UNCATEGORISED_KEY) {
      const lists = bundle!.bySection[key] ?? { recurring: [], dated: [] };
      recurring = lists.recurring;
      dated = lists.dated;
    } else {
      recurring = [];
      dated = [];
      for (const k of orphanSections) {
        recurring.push(...(bundle!.bySection[k]?.recurring ?? []));
        dated.push(...(bundle!.bySection[k]?.dated ?? []));
      }
    }
    if (!searching) return { recurring, dated };
    return { recurring: recurring.filter(matchesQuery), dated: dated.filter(matchesQuery) };
  }

  const visibleColumns = searching
    ? columns.filter((cfg) => {
        const lists = listsFor(cfg.key);
        return lists.recurring.length + lists.dated.length > 0;
      })
    : columns;

  const priorityItems = selectPriorityItems(bundle.items).filter(matchesQuery);
  const showPriorityColumn = !searching || priorityItems.length > 0;
  const nothingMatches = searching && visibleColumns.length === 0 && priorityItems.length === 0;

  return (
    <div ref={containerRef} className="flex min-h-full flex-col">
      <DayHeader
        snapshot_date={date}
        items={bundle.items}
        completionItems={bundle.completionItems}
        day={bundle.day}
        onNavigate={(d) => navigate(`/tdl/${d}`)}
      />
      <div className="p-3">
        {!empty && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks…"
              aria-label="Search tasks"
              className="h-10 pl-9 text-sm"
            />
          </div>
        )}
        {empty && prev && (
          <div className="mb-4">
            <RollForwardButton fromDate={prev} toDate={date} />
          </div>
        )}
        {nothingMatches ? (
          <div className="py-8 text-center text-sm text-muted">No tasks match “{query.trim()}”.</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {showPriorityColumn && (
                <PriorityColumn
                  items={priorityItems}
                  categories={categories}
                  focusedId={focusedId}
                  takenRanks={takenRanks}
                  forceExpanded={searching}
                />
              )}
              {visibleColumns.map((cfg) => {
                const lists = listsFor(cfg.key);
                return (
                  <SectionColumn
                    key={cfg.key}
                    cfg={cfg}
                    categories={categories}
                    snapshot_date={date}
                    recurring={lists.recurring}
                    dated={lists.dated}
                    focusedId={focusedId}
                    takenRanks={takenRanks}
                    forceExpanded={searching}
                  />
                );
              })}
            </div>
          </DndContext>
        )}
      </div>
    </div>
  );
}
