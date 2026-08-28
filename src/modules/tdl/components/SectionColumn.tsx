import { useState } from "react";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive,
  ChevronRight,
  Clock,
  FolderMinus,
  GripVertical,
  MoreVertical,
  Plus,
} from "lucide-react";
import { addDays, cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/Calendar";
import type { LocalTdlItem } from "../types";
import { UNCATEGORISED_KEY, type SectionConfig } from "../sections";
import { groupByQuadrant, QUADRANTS } from "../quadrant";
import type { TdlQuadrant } from "@/lib/database.types";
import {
  archiveCategoryItems,
  countCategoryItems,
  createItem,
  snoozeCategoryItems,
} from "../repo";
import { sectionStatusCounts } from "../hooks";
import { ImageEditor } from "./ImageEditor";
import { ItemRow } from "./ItemRow";

// Section (category) columns become sortable on the desktop board; their
// dnd-kit ids get this prefix so DayView can route column drags separately from
// item drags (which use raw uuids) and priority-mirror drags.
export const SECTION_SORTABLE_PREFIX = "section:";

// Prominent Eisenhower sub-group headers pick up the quadrant accent so the
// matrix reads at a glance. Mirrors ItemRow's QUADRANT_COLOR.
const QUADRANT_HEAD: Record<TdlQuadrant, { text: string; bar: string }> = {
  do_first: { text: "text-danger", bar: "bg-danger" },
  schedule: { text: "text-accent", bar: "bg-accent" },
  delegate: { text: "text-warn", bar: "bg-warn" },
  eliminate: { text: "text-muted", bar: "bg-muted" },
};

export function SectionColumn({
  cfg,
  categories,
  snapshot_date,
  recurring,
  dated,
  focusedId,
  takenRanks,
  forceExpanded = false,
  collapsed = false,
  onToggleCollapse,
  reorderable = false,
  selecting = false,
  selectedIds,
  onToggleSelect,
  onBulkActed,
  onArchive,
  bulkSections,
}: {
  cfg: SectionConfig;
  categories: SectionConfig[];
  snapshot_date: string;
  recurring: LocalTdlItem[];
  dated: LocalTdlItem[];
  focusedId?: string;
  takenRanks: Set<number>;
  forceExpanded?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  reorderable?: boolean;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onBulkActed?: () => void;
  // Archive this category (tag) straight from the board header. Omitted for the
  // virtual Uncategorised column and before the categories table has synced.
  onArchive?: () => void;
  // Section keys the header's "archive/snooze all items" actions target. Normally
  // just this column's key; the virtual Uncategorised column stands in for every
  // orphaned key at once, so it passes several.
  bulkSections?: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [menu, setMenu] = useState(false);
  // Category-level bulk actions are two-step: pick one, then confirm against a
  // count read from the store (never the search-filtered column).
  const [bulkMode, setBulkMode] = useState<"archive" | "snooze" | null>(null);
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [estimate, setEstimate] = useState("");
  const [estError, setEstError] = useState(false);
  const [quadrant, setQuadrant] = useState<TdlQuadrant | null>(null);
  const [quadError, setQuadError] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  // Per-quadrant collapse within this column (ephemeral UI, keyed by quadrant).
  // Search forces every group open so results are never hidden.
  const [collapsedQuadrants, setCollapsedQuadrants] = useState<Set<string>>(new Set());
  const toggleQuadrant = (key: string) =>
    setCollapsedQuadrants((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  // Collapse is owned by DayView (so "Collapse all" can drive every column and
  // the choice persists) and works at every breakpoint. Search forces the full
  // view open regardless.
  const isCollapsed = forceExpanded ? false : collapsed;
  const canAdd = cfg.key !== UNCATEGORISED_KEY;

  const bulkKeys = bulkSections ?? (cfg.key === UNCATEGORISED_KEY ? [] : [cfg.key]);
  const canBulk = bulkKeys.length > 0;

  function closeMenu() {
    setMenu(false);
    setBulkMode(null);
    setBulkCount(null);
  }

  async function openBulk(mode: "archive" | "snooze") {
    setBulkMode(mode);
    setBulkCount(null);
    setBulkCount(await countCategoryItems(snapshot_date, bulkKeys));
  }

  async function runArchiveAll() {
    await archiveCategoryItems(snapshot_date, bulkKeys);
    onBulkActed?.();
    closeMenu();
  }

  async function runSnoozeAll(until: string) {
    if (until <= snapshot_date) return;
    await snoozeCategoryItems(snapshot_date, bulkKeys, until);
    onBulkActed?.();
    closeMenu();
  }

  // Column drag-to-reorder (desktop only — the handle is hidden below `sm`).
  // useSortable is called unconditionally, but setNodeRef/listeners are only
  // wired when `reorderable`, so non-reorderable columns stay inert.
  const sortable = useSortable({
    id: SECTION_SORTABLE_PREFIX + cfg.key,
    disabled: !reorderable,
    data: { type: "section", key: cfg.key },
  });

  const counts = sectionStatusCounts(dated, cfg.key === "product");
  // Collapsed badge answers "how many are still not marked done" — every live
  // item on the board minus the terminal states (done + cancelled). Snoozed /
  // archived / deleted rows are already dropped upstream (useDayBundle).
  const notDone = [...recurring, ...dated].filter(
    (i) =>
      i.status === "open" ||
      i.status === "worked_today" ||
      i.status === "ready_for_testing",
  ).length;
  const chips = [
    { key: "open", label: "open", n: counts.open, cls: "bg-blue-500/15 text-blue-400" },
    {
      key: "worked_today",
      label: "in progress",
      n: counts.inProgress,
      cls: "bg-accent/15 text-accent",
    },
    {
      key: "ready_for_testing",
      label: "testing",
      n: counts.testing,
      cls: "bg-sky-500/15 text-sky-400",
    },
    { key: "paused", label: "paused", n: counts.paused, cls: "bg-warn/15 text-warn" },
    { key: "done", label: "done", n: counts.done, cls: "bg-success/15 text-success" },
  ].filter((c) => c.key === "open" || c.n > 0);

  // Categories flagged with a time estimate require one on every new item;
  // categories without the flag never show or ask for it.
  const requiresEstimate = cfg.hasTimeEstimate;

  function parsedEstimate(): number | null {
    const raw = estimate.trim();
    if (raw === "") return null;
    const n = Math.trunc(Number(raw));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function resetAdd() {
    setAdding(false);
    setShowDetails(false);
    setDraft("");
    setEstimate("");
    setEstError(false);
    setQuadrant(null);
    setQuadError(false);
    setNotes("");
    setImages([]);
  }

  async function submit() {
    const title = draft.trim();
    if (!title) {
      if (!showDetails) setAdding(false);
      return;
    }
    // Both the (optional) time estimate and the Eisenhower quadrant gate the
    // save; validate both so every missing field lights up at once.
    const est = parsedEstimate();
    const estMissing = requiresEstimate && est == null;
    const quadMissing = quadrant == null;
    if (estMissing) setEstError(true);
    if (quadMissing) setQuadError(true);
    if (estMissing || quadMissing) return;
    await createItem({
      snapshot_date,
      section: cfg.key,
      title,
      time_estimate_min: est,
      eisenhower_quadrant: quadrant,
      notes: notes.trim() ? notes.trim() : null,
      images,
    });
    // Keep the composer open for the next quick add, collapsing details again.
    setDraft("");
    setEstimate("");
    setEstError(false);
    setQuadrant(null);
    setQuadError(false);
    setNotes("");
    setImages([]);
    setShowDetails(false);
    setAdding(true);
  }

  const recurringIds = recurring.map((r) => r.id);
  // Dated items are broken into the Eisenhower matrix. One SortableContext still
  // spans every dated item (in quadrant-display order) so drag-reorder keeps
  // working across the sub-groups; the visual grouping is purely presentational.
  const datedGroups = groupByQuadrant(dated);
  const datedIds = datedGroups.flatMap((g) => g.items.map((i) => i.id));
  const datedIndex = new Map(datedIds.map((id, i) => [id, i]));

  return (
    <section
      ref={reorderable ? sortable.setNodeRef : undefined}
      style={
        reorderable
          ? {
              transform: CSS.Transform.toString(sortable.transform),
              transition: sortable.transition,
              opacity: sortable.isDragging ? 0.5 : undefined,
              zIndex: sortable.isDragging ? 20 : undefined,
            }
          : undefined
      }
      className={cn(
        "flex flex-col rounded-2xl border border-line bg-surface",
        // A collapsed column self-sizes to its header instead of stretching to
        // the grid row's height (align-items: stretch), so collapsing shrinks
        // the container.
        isCollapsed && "self-start",
      )}
      data-section-key={cfg.key}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        {reorderable && (
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            aria-label={`Drag to reorder ${cfg.label}`}
            className="-ml-1 hidden h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted/40 hover:text-muted active:cursor-grabbing sm:flex"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? `Expand ${cfg.label}` : `Collapse ${cfg.label}`}
          className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-text"
        >
          <ChevronRight
            className={cn("h-4 w-4 transition-transform", !isCollapsed && "rotate-90")}
          />
        </button>
        <h2 className="mr-auto text-sm font-semibold uppercase tracking-wider text-muted">
          {cfg.label}
        </h2>
        <span
          className={cn(
            "rounded-full bg-blue-500/15 px-2 py-0.5 text-[11px] tabular-nums text-blue-400",
            !isCollapsed && "hidden",
          )}
        >
          {notDone} not done
        </span>
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1",
            isCollapsed && "hidden",
          )}
        >
          {chips.map((c) => (
            <span
              key={c.key}
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] tabular-nums",
                c.cls,
              )}
            >
              {c.n} {c.label}
            </span>
          ))}
        </div>
        {(canBulk || onArchive) && (
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => (menu ? closeMenu() : setMenu(true))}
              aria-label={`More options for ${cfg.label}`}
              aria-expanded={menu}
              className="flex h-6 w-6 items-center justify-center rounded text-muted hover:text-text"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={closeMenu} aria-hidden />
                <div className="absolute right-0 top-7 z-40 min-w-[220px] overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                  {canBulk && (
                    <>
                      {bulkMode === "archive" ? (
                        <button
                          type="button"
                          disabled={bulkCount === 0}
                          onClick={() => void runArchiveAll()}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-accent hover:bg-surface2 disabled:text-muted"
                        >
                          <Archive className="h-4 w-4" />
                          {bulkCount == null
                            ? "Checking…"
                            : bulkCount === 0
                              ? "Nothing to archive"
                              : `Archive ${bulkCount} item${bulkCount === 1 ? "" : "s"}?`}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void openBulk("archive")}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
                        >
                          <Archive className="h-4 w-4" /> Archive all items
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          bulkMode === "snooze" ? setBulkMode(null) : void openBulk("snooze")
                        }
                        aria-expanded={bulkMode === "snooze"}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2"
                      >
                        <Clock className="h-4 w-4" />
                        {bulkMode !== "snooze" || bulkCount == null
                          ? "Snooze all items…"
                          : bulkCount === 0
                            ? "Nothing to snooze"
                            : `Snooze ${bulkCount} item${bulkCount === 1 ? "" : "s"} until…`}
                      </button>
                      {bulkMode === "snooze" && (bulkCount ?? 0) > 0 && (
                        <div className="border-t border-line px-2 py-2">
                          <Calendar
                            min={addDays(snapshot_date, 1)}
                            onSelect={(until) => void runSnoozeAll(until)}
                          />
                        </div>
                      )}
                    </>
                  )}
                  {onArchive && (
                    <button
                      type="button"
                      onClick={() => {
                        onArchive();
                        closeMenu();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface2",
                        canBulk && "border-t border-line text-muted",
                      )}
                    >
                      <FolderMinus className="h-4 w-4" /> Archive tag
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      {recurring.length > 0 && (
        <div className={cn("border-b border-line/50", isCollapsed && "hidden")}>
          <div className="px-3 pt-2 text-[10px] uppercase tracking-wider text-muted/70">
            Recurring
          </div>
          <SortableContext items={recurringIds} strategy={verticalListSortingStrategy}>
            <ul>
              {recurring.map((item, i) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  categories={categories}
                  focused={focusedId === item.id}
                  takenRanks={takenRanks}
                  index={i + 1}
                  selecting={selecting}
                  selected={selectedIds?.has(item.id)}
                  selectedIds={selectedIds}
                  onToggleSelect={onToggleSelect}
                  onBulkActed={onBulkActed}
                />
              ))}
            </ul>
          </SortableContext>
        </div>
      )}

      <SortableContext items={datedIds} strategy={verticalListSortingStrategy}>
        <div
          data-dated-section={cfg.key}
          className={cn("min-h-[40px]", isCollapsed && "hidden")}
        >
          {datedGroups.map((g) => {
            const accent = g.key ? QUADRANT_HEAD[g.key] : null;
            const gkey = g.key ?? "unclassified";
            const quadCollapsed = forceExpanded ? false : collapsedQuadrants.has(gkey);
            return (
            <div key={gkey} data-quadrant={gkey}>
              <button
                type="button"
                onClick={() => toggleQuadrant(gkey)}
                aria-expanded={!quadCollapsed}
                aria-label={quadCollapsed ? `Expand ${g.label}` : `Collapse ${g.label}`}
                className="flex w-full items-center gap-2 px-3 pb-1 pt-3 text-left"
              >
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted transition-transform",
                    !quadCollapsed && "rotate-90",
                  )}
                />
                <span
                  className={cn(
                    "h-4 w-1 shrink-0 rounded-full",
                    accent ? accent.bar : "bg-muted/40",
                  )}
                />
                <span
                  className={cn(
                    "text-sm font-bold uppercase tracking-wide",
                    accent ? accent.text : "text-muted",
                  )}
                >
                  {g.label}
                </span>
                {g.hint && (
                  <span className="hidden text-[11px] font-medium text-muted sm:inline">
                    {g.hint}
                  </span>
                )}
                <span className="ml-auto rounded-full bg-surface2 px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
                  {g.items.length}
                </span>
              </button>
              <ul className={cn(quadCollapsed && "hidden")}>
                {g.items.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    categories={categories}
                    focused={focusedId === item.id}
                    takenRanks={takenRanks}
                    index={recurring.length + (datedIndex.get(item.id) ?? 0) + 1}
                    selecting={selecting}
                    selected={selectedIds?.has(item.id)}
                    selectedIds={selectedIds}
                    onToggleSelect={onToggleSelect}
                    onBulkActed={onBulkActed}
                  />
                ))}
              </ul>
            </div>
            );
          })}
        </div>
      </SortableContext>

      {canAdd && (
      <div className={cn("border-t border-line/50 p-2", isCollapsed && "hidden")}>
        {adding ? (
          <div className="space-y-2">
            <Input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
                if (e.key === "Escape") resetAdd();
              }}
              onBlur={() => {
                if (!showDetails && !draft.trim()) setAdding(false);
              }}
              placeholder="New task..."
              className="h-9 text-sm"
            />
            {requiresEstimate && (
              <div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={estimate}
                    onChange={(e) => {
                      setEstimate(e.target.value);
                      if (estError) setEstError(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submit();
                      if (e.key === "Escape") resetAdd();
                    }}
                    placeholder="Est."
                    aria-label="Time to complete estimate in minutes"
                    aria-invalid={estError}
                    className={cn("h-9 w-20 text-sm", estError && "border-danger")}
                  />
                  <span className="text-xs text-muted">min to complete</span>
                </div>
                {estError && (
                  <div className="mt-1 text-xs text-danger">
                    Add a time-to-complete estimate (minutes) to save.
                  </div>
                )}
              </div>
            )}
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted/70">
                Eisenhower priority
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {QUADRANTS.map((q) => {
                  const selected = quadrant === q.key;
                  return (
                    <button
                      key={q.key}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuadrant((cur) => (cur === q.key ? null : q.key));
                        if (quadError) setQuadError(false);
                      }}
                      aria-pressed={selected}
                      title={`${q.label} — ${q.hint}`}
                      className={cn(
                        "flex min-h-[44px] flex-col items-start justify-center rounded-lg border px-2 py-1 text-left transition",
                        selected
                          ? "border-accent bg-accent/15 text-text"
                          : "border-line text-muted hover:bg-surface2",
                        quadError && !selected && "border-danger/60",
                      )}
                    >
                      <span className="text-[11px] font-semibold uppercase leading-tight">
                        {q.short} · {q.label}
                      </span>
                      <span className="text-[10px] leading-tight text-muted">{q.hint}</span>
                    </button>
                  );
                })}
              </div>
              {quadError && (
                <div className="mt-1 text-xs text-danger">
                  Pick an Eisenhower priority quadrant to save.
                </div>
              )}
            </div>
            {showDetails ? (
              <>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Details…"
                  rows={3}
                  className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-accent"
                />
                <ImageEditor images={images} onChange={setImages} />
              </>
            ) : (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setShowDetails(true)}
                className="text-xs text-muted hover:text-text"
              >
                + Add details
              </button>
            )}
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => void submit()}>
                Add task
              </Button>
              <Button size="sm" variant="ghost" onClick={resetAdd}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdding(true)}
            className="w-full justify-start text-muted"
          >
            <Plus className="mr-1 h-4 w-4" /> Add item
          </Button>
        )}
      </div>
      )}
    </section>
  );
}
