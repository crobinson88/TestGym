import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { LocalTdlItem } from "../types";
import { UNCATEGORISED_KEY, type SectionConfig } from "../sections";
import { groupByQuadrant } from "../quadrant";
import { createItem } from "../repo";
import { sectionStatusCounts } from "../hooks";
import { ImageEditor } from "./ImageEditor";
import { ItemRow } from "./ItemRow";

export function SectionColumn({
  cfg,
  categories,
  snapshot_date,
  recurring,
  dated,
  focusedId,
  takenRanks,
  forceExpanded = false,
  selecting = false,
  selectedIds,
  onToggleSelect,
}: {
  cfg: SectionConfig;
  categories: SectionConfig[];
  snapshot_date: string;
  recurring: LocalTdlItem[];
  dated: LocalTdlItem[];
  focusedId?: string;
  takenRanks: Set<number>;
  forceExpanded?: boolean;
  selecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [estimate, setEstimate] = useState("");
  const [estError, setEstError] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  // Mobile-only collapse: sections start collapsed so the single-column phone
  // view shows just category names + active counts. The `sm:` classes below
  // force the full view open from the tablet breakpoint up, so this state is
  // inert on larger screens.
  const [collapsed, setCollapsed] = useState(true);
  const isCollapsed = forceExpanded ? false : collapsed;
  const canAdd = cfg.key !== UNCATEGORISED_KEY;

  const counts = sectionStatusCounts(dated, cfg.key === "product");
  const activeTotal = [...recurring, ...dated].filter(
    (i) =>
      i.status === "open" ||
      i.status === "worked_today" ||
      i.status === "ready_for_testing",
  ).length;
  const chips = [
    { key: "open", label: "open", n: counts.open, cls: "bg-surface2 text-muted" },
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
    setNotes("");
    setImages([]);
  }

  async function submit() {
    const title = draft.trim();
    if (!title) {
      if (!showDetails) setAdding(false);
      return;
    }
    const est = parsedEstimate();
    if (requiresEstimate && est == null) {
      setEstError(true);
      return;
    }
    await createItem({
      snapshot_date,
      section: cfg.key,
      title,
      time_estimate_min: est,
      notes: notes.trim() ? notes.trim() : null,
      images,
    });
    // Keep the composer open for the next quick add, collapsing details again.
    setDraft("");
    setEstimate("");
    setEstError(false);
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
      className="flex flex-col rounded-2xl border border-line bg-surface"
      data-section-key={cfg.key}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-line px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? `Expand ${cfg.label}` : `Collapse ${cfg.label}`}
          className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted hover:text-text sm:hidden"
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
            "rounded-full bg-surface2 px-2 py-0.5 text-[11px] tabular-nums text-muted sm:hidden",
            !isCollapsed && "hidden",
          )}
        >
          {activeTotal} active
        </span>
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1",
            isCollapsed && "hidden sm:flex",
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
      </header>

      {recurring.length > 0 && (
        <div className={cn("border-b border-line/50", isCollapsed && "hidden sm:block")}>
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
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </ul>
          </SortableContext>
        </div>
      )}

      <SortableContext items={datedIds} strategy={verticalListSortingStrategy}>
        <div
          data-dated-section={cfg.key}
          className={cn("min-h-[40px]", isCollapsed && "hidden sm:block")}
        >
          {datedGroups.map((g) => (
            <div key={g.key ?? "unclassified"} data-quadrant={g.key ?? "unclassified"}>
              <div className="flex items-baseline gap-1.5 px-3 pt-2 text-[10px] uppercase tracking-wider text-muted/70">
                <span>{g.label}</span>
                {g.hint && (
                  <span className="normal-case tracking-normal text-muted/50">{g.hint}</span>
                )}
                <span className="ml-auto tabular-nums">{g.items.length}</span>
              </div>
              <ul>
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
                    onToggleSelect={onToggleSelect}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SortableContext>

      {canAdd && (
      <div className={cn("border-t border-line/50 p-2", isCollapsed && "hidden sm:block")}>
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
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => void submit()}>
                    Add task
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetAdd}>
                    Cancel
                  </Button>
                </div>
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
