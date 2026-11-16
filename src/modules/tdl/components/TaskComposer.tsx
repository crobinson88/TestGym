import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Star } from "lucide-react";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { SectionConfig } from "../sections";
import { QUADRANTS } from "../quadrant";
import type { TdlQuadrant } from "@/lib/database.types";
import { validateDraft } from "../composer";
import { createItem, setPriorityRank } from "../repo";
import { firstFreeRank, prioritySlots } from "../priority";
import { isSnoozed } from "../snooze";
import { useWorkstreams } from "../workstreams";
import { NO_WORKSTREAM_LABEL } from "../workstreamGroups";
import { ImageEditor } from "./ImageEditor";
import { ReplacePriorityDialog, type ReplaceSlot } from "./ReplacePriorityDialog";

// The new-task form. Used twice: at the foot of a category column (the section
// is fixed) and in the quick-add bar at the top of the day (the category is
// picked here). Same fields either way — title, minutes when the category asks
// for them, Eisenhower quadrant, optional notes + images, and an "Add as
// priority" toggle that takes the day's first free rank — or, when all ten are
// taken, asks which priority the new task replaces.
export function TaskComposer({
  snapshot_date,
  categories,
  fixedSection,
  boardListId,
  defaultWorkstreamId,
  defaultSectionKey,
  autoFocus = true,
  collapseWhenEmpty = false,
  onCancel,
  onCreated,
  onSectionChange,
}: {
  snapshot_date: string;
  // Pickable categories. Ignored when `fixedSection` is set.
  categories: SectionConfig[];
  // When set the composer writes to this category and shows no picker.
  fixedSection?: SectionConfig;
  // Board View only: the list lane the new card lands in.
  boardListId?: string;
  // The workstream the composer starts on — set when adding from inside a
  // workstream group. Still changeable in the picker.
  defaultWorkstreamId?: string | null;
  // The category the picker opens on (and falls back to when the current pick
  // goes away). Ignored when `fixedSection` is set.
  defaultSectionKey?: string;
  autoFocus?: boolean;
  // Close the composer when the title is blurred/submitted while empty. The
  // column composer collapses that way; the quick-add bar keeps its category
  // pick alive instead and closes only on Cancel/Escape.
  collapseWhenEmpty?: boolean;
  onCancel: () => void;
  onCreated?: (title: string, section: SectionConfig) => void;
  // Fires when the category picker changes, so the caller can remember it.
  onSectionChange?: (key: string) => void;
}) {
  const [sectionKey, setSectionKey] = useState(
    () => fixedSection?.key ?? defaultSectionKey ?? categories[0]?.key ?? "",
  );
  const [draft, setDraft] = useState("");
  const [estimate, setEstimate] = useState("");
  const [quadrant, setQuadrant] = useState<TdlQuadrant | null>(null);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [workstreamId, setWorkstreamId] = useState<string | null>(defaultWorkstreamId ?? null);
  const [asPriority, setAsPriority] = useState(false);
  // Set while the replace-a-priority dialog is up: the validated task waiting
  // on the user's pick.
  const [pendingReplace, setPendingReplace] = useState<{ title: string; estimate: number | null } | null>(
    null,
  );
  const [errors, setErrors] = useState({
    title: false,
    estimate: false,
    quadrant: false,
    section: false,
  });

  const cfg = useMemo(
    () => fixedSection ?? categories.find((c) => c.key === sectionKey),
    [fixedSection, categories, sectionKey],
  );

  // Categories arrive from a live query; fall back to the default (else the
  // first one) if the picked key is gone (archived elsewhere) or nothing was
  // picked yet.
  useEffect(() => {
    if (fixedSection) return;
    if (categories.length === 0) return;
    if (categories.some((c) => c.key === sectionKey)) return;
    const fallback = categories.find((c) => c.key === defaultSectionKey) ?? categories[0];
    setSectionKey(fallback.key);
  }, [fixedSection, categories, sectionKey, defaultSectionKey]);

  const workstreams = useWorkstreams(cfg?.key ?? null);
  // A workstream belongs to one category, so a pick that isn't one of the
  // current category's (category changed, or it was deleted) reads as none.
  const effectiveWorkstreamId =
    workstreamId && workstreams?.some((w) => w.id === workstreamId) ? workstreamId : null;

  const requiresEstimate = cfg?.hasTimeEstimate ?? false;

  // The tasks holding the day's priority slots — the same set the Priorities
  // column shows. A rank held only by an archived/snoozed task reads as free;
  // setPriorityRank displaces it if the new task takes it.
  const rankedItems = useLiveQuery(
    async () =>
      (await db.tdl_items.where("snapshot_date").equals(snapshot_date).toArray()).filter(
        (r) => r.priority_rank != null && !r.deleted_at && !r.is_archived && !isSnoozed(r),
      ),
    [snapshot_date],
  );
  const nextRank = rankedItems ? firstFreeRank(rankedItems) : null;
  const priorityFull = rankedItems != null && nextRank == null;

  function clearFields() {
    setDraft("");
    setEstimate("");
    setQuadrant(null);
    setNotes("");
    setImages([]);
    setShowDetails(false);
    setAsPriority(false);
    setPendingReplace(null);
    setErrors({ title: false, estimate: false, quadrant: false, section: false });
  }

  function cancel() {
    clearFields();
    onCancel();
  }

  async function submit() {
    const v = validateDraft({
      title: draft,
      estimate,
      quadrant,
      section: cfg?.key ?? null,
      requiresEstimate,
    });
    if (!v.ok) {
      // An empty title in the column composer means "I'm done adding" — close
      // rather than shouting, exactly as it behaved before.
      if (v.errors.title && collapseWhenEmpty && !showDetails) {
        cancel();
        return;
      }
      setErrors(v.errors);
      return;
    }
    if (asPriority) {
      const free = firstFreeRank(rankedItems ?? []);
      if (free == null) {
        setPendingReplace({ title: v.title, estimate: v.estimate });
        return;
      }
      await save(v.title, v.estimate, free);
      return;
    }
    await save(v.title, v.estimate, null);
  }

  // Ranked through setPriorityRank rather than createItem so per-day
  // uniqueness holds: taking a full list's rank displaces its holder to
  // unranked, exactly as picking that rank from a row's dropdown would.
  async function save(title: string, estimateMin: number | null, rank: number | null) {
    const item = await createItem({
      snapshot_date,
      section: cfg!.key,
      title,
      time_estimate_min: estimateMin,
      eisenhower_quadrant: quadrant,
      notes: notes.trim() ? notes.trim() : null,
      images,
      board_list_id: boardListId ?? null,
      workstream_id: effectiveWorkstreamId,
    });
    if (rank != null) await setPriorityRank(item.id, rank);
    onCreated?.(title, cfg!);
    // Keep the composer open for the next quick add, collapsing details again.
    clearFields();
  }

  function onFieldKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void submit();
    if (e.key === "Escape") cancel();
  }

  return (
    <div ref={rootRef} className="space-y-2">
      {!fixedSection && (
        <div>
          <select
            value={sectionKey}
            onChange={(e) => {
              setSectionKey(e.currentTarget.value);
              onSectionChange?.(e.currentTarget.value);
              setErrors((p) => ({ ...p, section: false, estimate: false }));
            }}
            aria-label="Category"
            aria-invalid={errors.section}
            className={cn(
              "h-9 w-full cursor-pointer rounded-xl border border-line bg-surface px-3 text-sm text-text outline-none focus:border-accent",
              errors.section && "border-danger",
            )}
          >
            {categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          {errors.section && (
            <div className="mt-1 text-xs text-danger">Pick a category to save.</div>
          )}
        </div>
      )}
      <Input
        autoFocus={autoFocus}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (errors.title) setErrors((p) => ({ ...p, title: false }));
        }}
        onKeyDown={onFieldKeyDown}
        onBlur={(e) => {
          // Tabbing/clicking into the composer's own fields (the workstream
          // picker) isn't "done adding".
          if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
          if (collapseWhenEmpty && !showDetails && !draft.trim()) cancel();
        }}
        placeholder="New task..."
        aria-label="Task title"
        aria-invalid={errors.title}
        className={cn("h-9 text-sm", errors.title && "border-danger")}
      />
      {errors.title && <div className="text-xs text-danger">Give the task a title to save.</div>}
      {workstreams && workstreams.length > 0 && (
        <select
          value={effectiveWorkstreamId ?? ""}
          onChange={(e) => setWorkstreamId(e.currentTarget.value || null)}
          aria-label="Workstream"
          className="h-9 w-full cursor-pointer rounded-xl border border-line bg-surface px-3 text-sm text-text outline-none focus:border-accent"
        >
          <option value="">{NO_WORKSTREAM_LABEL}</option>
          {workstreams.map((w) => (
            <option key={w.id} value={w.id}>
              {w.label}
            </option>
          ))}
        </select>
      )}
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
                if (errors.estimate) setErrors((p) => ({ ...p, estimate: false }));
              }}
              onKeyDown={onFieldKeyDown}
              placeholder="Est."
              aria-label="Time to complete estimate in minutes"
              aria-invalid={errors.estimate}
              className={cn("h-9 w-20 text-sm", errors.estimate && "border-danger")}
            />
            <span className="text-xs text-muted">min to complete</span>
          </div>
          {errors.estimate && (
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
                  if (errors.quadrant) setErrors((p) => ({ ...p, quadrant: false }));
                }}
                aria-pressed={selected}
                title={`${q.label} — ${q.hint}`}
                className={cn(
                  "flex min-h-[44px] flex-col items-start justify-center rounded-lg border px-2 py-1 text-left transition",
                  selected
                    ? "border-accent bg-accent/15 text-text"
                    : "border-line text-muted hover:bg-surface2",
                  errors.quadrant && !selected && "border-danger/60",
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
        {errors.quadrant && (
          <div className="mt-1 text-xs text-danger">
            Pick an Eisenhower priority quadrant to save.
          </div>
        )}
      </div>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAsPriority((v) => !v)}
        aria-pressed={asPriority}
        className={cn(
          "flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-3 py-1 text-left transition",
          asPriority
            ? "border-accent bg-accent/15 text-text"
            : "border-line text-muted hover:bg-surface2",
        )}
      >
        <Star className={cn("h-4 w-4 shrink-0", asPriority && "fill-current text-accent")} />
        <span className="text-xs font-semibold">Add as priority</span>
        <span className="ml-auto text-[11px] text-muted">
          {rankedItems == null
            ? ""
            : priorityFull
              ? "List full — pick one to replace"
              : `Next free: P${nextRank}`}
        </span>
      </button>
      {showDetails ? (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Details…"
            aria-label="Details"
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
        <Button size="sm" variant="ghost" onClick={cancel}>
          Cancel
        </Button>
      </div>
      {pendingReplace && (
        <ReplacePriorityDialog
          newTitle={pendingReplace.title}
          slots={replaceSlots(rankedItems ?? [], categories, fixedSection)}
          onPick={(rank) => void save(pendingReplace.title, pendingReplace.estimate, rank)}
          onAddUnranked={() => void save(pendingReplace.title, pendingReplace.estimate, null)}
          onCancel={() => setPendingReplace(null)}
        />
      )}
    </div>
  );
}

function replaceSlots(
  rankedItems: readonly { id: string; title: string; section: string; priority_rank: number | null }[],
  categories: SectionConfig[],
  fixedSection: SectionConfig | undefined,
): ReplaceSlot[] {
  const labelOf = (key: string) =>
    categories.find((c) => c.key === key)?.label ?? (fixedSection?.key === key ? fixedSection.label : null);
  return prioritySlots(rankedItems).flatMap(({ rank, item }) =>
    item ? [{ rank, title: item.title, categoryLabel: labelOf(item.section) }] : [],
  );
}
