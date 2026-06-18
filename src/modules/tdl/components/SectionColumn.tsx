import { useState } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { LocalTdlItem } from "../types";
import { UNCATEGORISED_KEY, type SectionConfig } from "../sections";
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
  forceExpanded = false,
}: {
  cfg: SectionConfig;
  categories: SectionConfig[];
  snapshot_date: string;
  recurring: LocalTdlItem[];
  dated: LocalTdlItem[];
  focusedId?: string;
  forceExpanded?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
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

  function resetAdd() {
    setAdding(false);
    setShowDetails(false);
    setDraft("");
    setNotes("");
    setImages([]);
  }

  async function submit() {
    const title = draft.trim();
    if (!title) {
      if (!showDetails) setAdding(false);
      return;
    }
    await createItem({
      snapshot_date,
      section: cfg.key,
      title,
      notes: notes.trim() ? notes.trim() : null,
      images,
    });
    // Keep the composer open for the next quick add, collapsing details again.
    setDraft("");
    setNotes("");
    setImages([]);
    setShowDetails(false);
    setAdding(true);
  }

  const recurringIds = recurring.map((r) => r.id);
  const datedIds = dated.map((r) => r.id);

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
              {recurring.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  categories={categories}
                  focused={focusedId === item.id}
                />
              ))}
            </ul>
          </SortableContext>
        </div>
      )}

      <SortableContext items={datedIds} strategy={verticalListSortingStrategy}>
        <ul
          data-dated-section={cfg.key}
          className={cn("min-h-[40px]", isCollapsed && "hidden sm:block")}
        >
          {dated.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              categories={categories}
              focused={focusedId === item.id}
            />
          ))}
        </ul>
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
