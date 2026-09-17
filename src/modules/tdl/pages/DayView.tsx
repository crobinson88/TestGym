import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CheckSquare, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { SearchBox } from "../components/SearchBox";
import { Button } from "@/components/ui/Button";
import { todayIsoDate } from "@/lib/utils";
import {
  useArchivedItems,
  useDay,
  usePrevDateWithItems,
  useSnoozedItems,
} from "../hooks";
import { matchesQuery as matchesTdlQuery } from "../search";
import {
  BOARD_CATEGORY_STORAGE_KEY,
  VIEW_MODE_STORAGE_KEY,
  clampViewMode,
  resolveBoardCategory,
  type TdlViewMode,
} from "../board";
import { useBoardLists } from "../boardLists";
import {
  EMPTY_CREATED_RANGE,
  describeCreatedRange,
  isCreatedRangeActive,
  matchesCreatedRange,
  type CreatedRange,
} from "../createdRange";
import {
  EMPTY_DURATION_RANGE,
  describeDurationRange,
  isDurationRangeActive,
  matchesItemDuration,
  type DurationRange,
} from "../duration";
import {
  reorderCategories,
  setCategoryArchived,
  useCategories,
  useCategoryRows,
} from "../categories";
import { UNCATEGORISED, UNCATEGORISED_KEY } from "../sections";
import { selectPriorityItems } from "../priority";
import { selectDoFirstItems } from "../quadrant";
import { selectReluctantItems } from "../reluctance";
import type { LocalTdlItem } from "../types";
import {
  archiveItems,
  createItem,
  cycleStatus,
  deleteItem,
  deleteItems,
  moveItem,
  reorderPriorities,
  reorderSection,
  setPriorityRank,
  setQuadrant,
  snoozeItems,
  usedRanks,
} from "../repo";
import { DayHeader } from "../components/DayHeader";
import { SectionColumn, SECTION_SORTABLE_PREFIX } from "../components/SectionColumn";
import { PriorityColumn } from "../components/PriorityColumn";
import { DoFirstColumn } from "../components/DoFirstColumn";
import { ReluctantColumn } from "../components/ReluctantColumn";
import { PRIORITY_SORTABLE_PREFIX } from "../components/ItemRow";
import { BulkActionBar } from "../components/BulkActionBar";
import { RollForwardEmptyCard } from "../components/RollForwardButton";
import { OffBoardResults } from "../components/OffBoardResults";
import { QuickAdd } from "../components/QuickAdd";
import { CreatedRangeFilter } from "../components/CreatedRangeFilter";
import { DurationFilter } from "../components/DurationFilter";
import { ViewToggle } from "../components/ViewToggle";
import { BoardCanvas } from "../components/BoardCanvas";
import { BoardCategoryPicker } from "../components/BoardCategoryPicker";

// Collapsed columns persist per device across days (a UI preference, not synced
// domain data — the module keeps ephemeral UI local). The Priorities mirror
// collapses under this reserved key.
const COLLAPSE_STORAGE_KEY = "tdl:collapsedSections";
const PRIORITIES_COLLAPSE_KEY = "__priorities__";
const DO_FIRST_COLLAPSE_KEY = "__do_first__";
const RELUCTANT_COLLAPSE_KEY = "__reluctant__";

function loadCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore malformed/unavailable storage — start with nothing collapsed
  }
  return new Set();
}

function loadBoardCategory(): string | null {
  try {
    return localStorage.getItem(BOARD_CATEGORY_STORAGE_KEY);
  } catch {
    return null;
  }
}

function loadViewMode(): TdlViewMode {
  try {
    return clampViewMode(localStorage.getItem(VIEW_MODE_STORAGE_KEY));
  } catch {
    // ignore unavailable storage — fall back to the list layout
    return clampViewMode(null);
  }
}

export default function DayView() {
  const params = useParams<{ date?: string }>();
  const navigate = useNavigate();
  const date = params.date ?? todayIsoDate();
  const bundle = useDay(date);
  const prev = usePrevDateWithItems(date);
  // Archived and snoozed items are day-independent and off the board; the search
  // surfaces matches from them too (see OffBoardResults below).
  const archivedItems = useArchivedItems();
  const snoozedItems = useSnoozedItems();
  const categories = useCategories();
  const categoryRows = useCategoryRows();
  // Map category key → persisted row id, so a board column drag can write
  // sort_order via reorderCategories (which keys off row ids). Empty until the
  // categories table has synced — column dragging stays off before then.
  const keyToRowId = useMemo(
    () => new Map((categoryRows ?? []).map((r) => [r.key, r.id])),
    [categoryRows],
  );

  const [query, setQuery] = useState("");
  const [createdRange, setCreatedRange] = useState<CreatedRange>(EMPTY_CREATED_RANGE);
  const [durationRange, setDurationRange] = useState<DurationRange>(EMPTY_DURATION_RANGE);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [durationOpen, setDurationOpen] = useState(false);

  const allIds = useMemo(() => bundle?.items.map((i) => i.id) ?? [], [bundle]);
  const [focusIdx, setFocusIdx] = useState(0);
  const focusedId = allIds[focusIdx];

  const containerRef = useRef<HTMLDivElement>(null);

  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(loadCollapsed);
  const [viewMode, setViewMode] = useState<TdlViewMode>(loadViewMode);
  // Board View shows one category at a time; the pick is remembered per device.
  const [boardCategoryKey, setBoardCategoryKey] = useState<string | null>(loadBoardCategory);
  const boardCategory = resolveBoardCategory(
    boardCategoryKey,
    categories.map((c) => c.key),
  );
  const boardLists = useBoardLists(viewMode === "board" ? boardCategory : null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
      if (boardCategory) localStorage.setItem(BOARD_CATEGORY_STORAGE_KEY, boardCategory);
    } catch {
      // ignore storage failures — the choices still hold for the session
    }
  }, [viewMode, boardCategory]);

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify([...collapsedKeys]));
    } catch {
      // ignore storage failures — collapse still works for the session
    }
  }, [collapsedKeys]);

  const toggleCollapse = useCallback((key: string) => {
    setCollapsedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (focusIdx >= allIds.length) setFocusIdx(Math.max(0, allIds.length - 1));
  }, [allIds.length, focusIdx]);

  // Drop selections for items that have left the board (bulk-acted, deleted,
  // rolled away). Keeps the selected count honest.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(allIds);
      const next = new Set([...prev].filter((id) => live.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [allIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelecting(false);
    setSelected(new Set());
  }, []);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT"))
        return;
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

  // Column drags collide only with other columns (clean reorder, never drops
  // onto an inner row); every other drag ignores the column droppables entirely,
  // so item/priority drag targeting is exactly as it was before columns became
  // sortable.
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    const draggingColumn = String(args.active.id).startsWith(SECTION_SORTABLE_PREFIX);
    const droppableContainers = args.droppableContainers.filter(
      (c) => String(c.id).startsWith(SECTION_SORTABLE_PREFIX) === draggingColumn,
    );
    return closestCorners({ ...args, droppableContainers });
  }, []);

  function onDragEnd(e: DragEndEvent) {
    if (!bundle) return;
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || activeId === overId) return;

    // Column (category) reorder — its own sortable namespace (prefixed ids).
    if (activeId.startsWith(SECTION_SORTABLE_PREFIX)) {
      if (!overId.startsWith(SECTION_SORTABLE_PREFIX)) return;
      const order = reorderableKeys.map((k) => SECTION_SORTABLE_PREFIX + k);
      const from = order.indexOf(activeId);
      const to = order.indexOf(overId);
      if (from === -1 || to === -1) return;
      const nextKeys = arrayMove(reorderableKeys, from, to);
      const nextIds = nextKeys.map((k) => keyToRowId.get(k)).filter((v): v is string => !!v);
      void reorderCategories(nextIds);
      return;
    }

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

    // Drag-to-classify: dropping a dated item onto another dated item adopts
    // that item's Eisenhower quadrant. Recurring items sit outside the matrix.
    if (overItem && !activeItem.is_recurring && !overItem.is_recurring) {
      const targetQuadrant = overItem.eisenhower_quadrant ?? null;
      if ((activeItem.eisenhower_quadrant ?? null) !== targetQuadrant) {
        void setQuadrant(activeId, targetQuadrant);
      }
    }

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
  // Text, added-date and time-requirement filters stack (AND); "searching" is
  // any of them being on, which is what narrows the board.
  const rangeActive = isCreatedRangeActive(createdRange);
  const durationActive = isDurationRangeActive(durationRange);
  const searching = q.length > 0 || rangeActive || durationActive;
  const matchesQuery = (i: LocalTdlItem) =>
    matchesTdlQuery(i, query) &&
    matchesCreatedRange(i, createdRange) &&
    matchesItemDuration(i, durationRange);

  // Selectable = every live item currently visible on the board (filter-aware).
  const selectableIds = bundle.items.filter(matchesQuery).map((i) => i.id);

  async function runBulk(fn: (ids: string[]) => Promise<number>) {
    await fn([...selected]);
    setSelected(new Set());
  }

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
  const doFirstItems = selectDoFirstItems(bundle.items).filter(matchesQuery);
  const showDoFirstColumn = !searching || doFirstItems.length > 0;
  // completionItems, not items: a done-then-archived task keeps its place in
  // the set so the pie's numerator stays visible in the list.
  const reluctantItems = selectReluctantItems(bundle.completionItems).filter(matchesQuery);
  const showReluctantColumn = !searching || reluctantItems.length > 0;

  // While filtering, also surface matching archived/snoozed items (they never
  // appear on the board). Empty when unfiltered so nothing renders below.
  const archivedMatches = searching ? (archivedItems ?? []).filter(matchesQuery) : [];
  const snoozedMatches = searching ? (snoozedItems ?? []).filter(matchesQuery) : [];

  const boardEmpty =
    visibleColumns.length === 0 &&
    priorityItems.length === 0 &&
    doFirstItems.length === 0 &&
    reluctantItems.length === 0;
  const showBoard = !searching || !boardEmpty;
  const nothingMatches =
    searching &&
    boardEmpty &&
    archivedMatches.length === 0 &&
    snoozedMatches.length === 0;

  // "Collapse all" targets every column on the board (the Priorities, Do First
  // and Don't-want-to-do mirrors plus each category), independent of the
  // filters so the toggle is stable.
  const collapsibleKeys = [
    PRIORITIES_COLLAPSE_KEY,
    DO_FIRST_COLLAPSE_KEY,
    RELUCTANT_COLLAPSE_KEY,
    ...columns.map((c) => c.key),
  ];
  const allCollapsed = collapsibleKeys.every((k) => collapsedKeys.has(k));

  // Column reorder is a desktop convenience: off while filtering (the visible
  // set is narrowed) and until the categories table has synced ids to persist.
  const columnsReorderable = !searching && keyToRowId.size > 0;
  const reorderableKeys = columnsReorderable
    ? visibleColumns
        .filter((c) => c.key !== UNCATEGORISED_KEY && keyToRowId.has(c.key))
        .map((c) => c.key)
    : [];
  const reorderableKeySet = new Set(reorderableKeys);
  const sortableColumnIds = reorderableKeys.map((k) => SECTION_SORTABLE_PREFIX + k);

  // Board View works on one category: its cards for the day (search-filtered
  // like everywhere else) and a count per category for the picker.
  const boardCounts = new Map<string, number>();
  for (const cfg of columns) {
    const lists = listsFor(cfg.key);
    boardCounts.set(cfg.key, lists.recurring.length + lists.dated.length);
  }
  const boardCfg = columns.find((c) => c.key === boardCategory) ?? null;
  const boardCards = boardCfg
    ? (() => {
        const lists = listsFor(boardCfg.key);
        return [...lists.recurring, ...lists.dated];
      })()
    : [];

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
        <QuickAdd snapshot_date={date} categories={categories} />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <ViewToggle value={viewMode} onChange={setViewMode} />
          {!empty && (
            <>
            <SearchBox
              value={query}
              onChange={setQuery}
              placeholder="Search tasks…"
              ariaLabel="Search tasks"
              className="order-first basis-full sm:order-none sm:flex-1"
              iconClassName="text-accent"
              inputClassName="border-accent/50 bg-accent/10 placeholder:text-text/70 focus:bg-accent/15"
            />
            <CreatedRangeFilter
              value={createdRange}
              onChange={setCreatedRange}
              open={rangeOpen}
              onToggle={() => {
                setRangeOpen((v) => !v);
                setDurationOpen(false);
              }}
            />
            <DurationFilter
              value={durationRange}
              onChange={setDurationRange}
              open={durationOpen}
              onToggle={() => {
                setDurationOpen((v) => !v);
                setRangeOpen(false);
              }}
              title="Filter by how long a task takes — tasks with no time set are hidden"
            />
            {viewMode === "list" && (
              <Button
                variant="ghost"
                onClick={() =>
                  setCollapsedKeys(allCollapsed ? new Set() : new Set(collapsibleKeys))
                }
                className="h-10 shrink-0 px-3 text-sm"
                aria-pressed={allCollapsed}
                title={allCollapsed ? "Expand all categories" : "Collapse all categories"}
              >
                {allCollapsed ? (
                  <ChevronsUpDown className="h-4 w-4 sm:mr-1" />
                ) : (
                  <ChevronsDownUp className="h-4 w-4 sm:mr-1" />
                )}
                <span className="hidden sm:inline">
                  {allCollapsed ? "Expand all" : "Collapse all"}
                </span>
              </Button>
            )}
            <Button
              variant={selecting ? "secondary" : "ghost"}
              onClick={() => (selecting ? exitSelection() : setSelecting(true))}
              className="h-10 shrink-0 px-3 text-sm"
              aria-pressed={selecting}
            >
              <CheckSquare className="mr-1 h-4 w-4" />
              {selecting ? "Cancel" : "Select"}
            </Button>
            </>
          )}
        </div>
        {empty && (
          <div className="mb-4">
            <RollForwardEmptyCard toDate={date} defaultFrom={prev} />
          </div>
        )}
        {nothingMatches && viewMode === "list" && (
          <div className="py-8 text-center text-sm text-muted">
            No tasks match {q ? `“${query.trim()}”` : "this filter"}
            {rangeActive && ` · added ${describeCreatedRange(createdRange)}`}
            {durationActive && ` · ${describeDurationRange(durationRange).toLowerCase()}`}.
          </div>
        )}
        {viewMode === "board" && (
          <>
            <BoardCategoryPicker
              categories={columns}
              value={boardCategory}
              counts={boardCounts}
              onChange={setBoardCategoryKey}
            />
            {boardCfg && boardLists ? (
              <BoardCanvas
                cfg={boardCfg}
                categories={categories}
                lists={boardLists}
                cards={boardCards}
                takenRanks={takenRanks}
                snapshot_date={date}
                focusedId={focusedId}
                selecting={selecting}
                selectedIds={selected}
                onToggleSelect={toggleSelect}
                onBulkActed={() => setSelected(new Set())}
              />
            ) : (
              <div className="py-8 text-center text-sm text-muted">
                {boardCfg ? "Loading lists…" : "Add a category to start a board."}
              </div>
            )}
          </>
        )}
        {showBoard && viewMode === "list" && (
          <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragEnd={onDragEnd}>
            <SortableContext items={sortableColumnIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {showPriorityColumn && (
                  <PriorityColumn
                    items={priorityItems}
                    categories={categories}
                    focusedId={focusedId}
                    takenRanks={takenRanks}
                    forceExpanded={searching}
                    collapsed={collapsedKeys.has(PRIORITIES_COLLAPSE_KEY)}
                    onToggleCollapse={() => toggleCollapse(PRIORITIES_COLLAPSE_KEY)}
                    selecting={selecting}
                    selectedIds={selected}
                    onToggleSelect={toggleSelect}
                    onBulkActed={() => setSelected(new Set())}
                  />
                )}
                {showDoFirstColumn && (
                  <DoFirstColumn
                    items={doFirstItems}
                    categories={categories}
                    focusedId={focusedId}
                    takenRanks={takenRanks}
                    forceExpanded={searching}
                    collapsed={collapsedKeys.has(DO_FIRST_COLLAPSE_KEY)}
                    onToggleCollapse={() => toggleCollapse(DO_FIRST_COLLAPSE_KEY)}
                    selecting={selecting}
                    selectedIds={selected}
                    onToggleSelect={toggleSelect}
                    onBulkActed={() => setSelected(new Set())}
                  />
                )}
                {showReluctantColumn && (
                  <ReluctantColumn
                    items={reluctantItems}
                    categories={categories}
                    focusedId={focusedId}
                    takenRanks={takenRanks}
                    forceExpanded={searching}
                    collapsed={collapsedKeys.has(RELUCTANT_COLLAPSE_KEY)}
                    onToggleCollapse={() => toggleCollapse(RELUCTANT_COLLAPSE_KEY)}
                    selecting={selecting}
                    selectedIds={selected}
                    onToggleSelect={toggleSelect}
                    onBulkActed={() => setSelected(new Set())}
                  />
                )}
                {visibleColumns.map((cfg) => {
                  const lists = listsFor(cfg.key);
                  const rowId = keyToRowId.get(cfg.key);
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
                      collapsed={collapsedKeys.has(cfg.key)}
                      onToggleCollapse={() => toggleCollapse(cfg.key)}
                      reorderable={reorderableKeySet.has(cfg.key)}
                      selecting={selecting}
                      selectedIds={selected}
                      onToggleSelect={toggleSelect}
                      onBulkActed={() => setSelected(new Set())}
                      onArchive={
                        rowId
                          ? () => void setCategoryArchived(rowId, true)
                          : undefined
                      }
                      bulkSections={
                        cfg.key === UNCATEGORISED_KEY ? orphanSections : [cfg.key]
                      }
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
        {searching && (
          <OffBoardResults
            archived={archivedMatches}
            snoozed={snoozedMatches}
            categories={categories}
          />
        )}
        {selecting && (
          <BulkActionBar
            snapshot_date={date}
            selectedCount={selected.size}
            totalSelectable={selectableIds.length}
            onSelectAll={() => setSelected(new Set(selectableIds))}
            onClear={() => setSelected(new Set())}
            onArchive={() => void runBulk(archiveItems)}
            onSnooze={(until) => void runBulk((ids) => snoozeItems(ids, until))}
            onDelete={() => void runBulk(deleteItems)}
            onExit={exitSelection}
          />
        )}
      </div>
    </div>
  );
}
