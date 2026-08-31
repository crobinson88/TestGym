import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import type { SectionConfig } from "../sections";
import { QUADRANTS } from "../quadrant";
import type { TdlQuadrant } from "@/lib/database.types";
import { validateDraft } from "../composer";
import { createItem } from "../repo";
import { ImageEditor } from "./ImageEditor";

// The new-task form. Used twice: at the foot of a category column (the section
// is fixed) and in the quick-add bar at the top of the day (the category is
// picked here). Same fields either way — title, minutes when the category asks
// for them, Eisenhower quadrant, and optional notes + images.
export function TaskComposer({
  snapshot_date,
  categories,
  fixedSection,
  autoFocus = true,
  collapseWhenEmpty = false,
  onCancel,
  onCreated,
}: {
  snapshot_date: string;
  // Pickable categories. Ignored when `fixedSection` is set.
  categories: SectionConfig[];
  // When set the composer writes to this category and shows no picker.
  fixedSection?: SectionConfig;
  autoFocus?: boolean;
  // Close the composer when the title is blurred/submitted while empty. The
  // column composer collapses that way; the quick-add bar keeps its category
  // pick alive instead and closes only on Cancel/Escape.
  collapseWhenEmpty?: boolean;
  onCancel: () => void;
  onCreated?: (title: string, section: SectionConfig) => void;
}) {
  const [sectionKey, setSectionKey] = useState(
    () => fixedSection?.key ?? categories[0]?.key ?? "",
  );
  const [draft, setDraft] = useState("");
  const [estimate, setEstimate] = useState("");
  const [quadrant, setQuadrant] = useState<TdlQuadrant | null>(null);
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
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

  // Categories arrive from a live query; fall back to the first one if the
  // picked key is gone (archived elsewhere) or nothing was picked yet.
  useEffect(() => {
    if (fixedSection) return;
    if (categories.length === 0) return;
    if (!categories.some((c) => c.key === sectionKey)) setSectionKey(categories[0].key);
  }, [fixedSection, categories, sectionKey]);

  const requiresEstimate = cfg?.hasTimeEstimate ?? false;

  function clearFields() {
    setDraft("");
    setEstimate("");
    setQuadrant(null);
    setNotes("");
    setImages([]);
    setShowDetails(false);
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
    await createItem({
      snapshot_date,
      section: cfg!.key,
      title: v.title,
      time_estimate_min: v.estimate,
      eisenhower_quadrant: quadrant,
      notes: notes.trim() ? notes.trim() : null,
      images,
    });
    onCreated?.(v.title, cfg!);
    // Keep the composer open for the next quick add, collapsing details again.
    clearFields();
  }

  function onFieldKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void submit();
    if (e.key === "Escape") cancel();
  }

  return (
    <div className="space-y-2">
      {!fixedSection && (
        <div>
          <select
            value={sectionKey}
            onChange={(e) => {
              setSectionKey(e.currentTarget.value);
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
        onBlur={() => {
          if (collapseWhenEmpty && !showDetails && !draft.trim()) cancel();
        }}
        placeholder="New task..."
        aria-label="Task title"
        aria-invalid={errors.title}
        className={cn("h-9 text-sm", errors.title && "border-danger")}
      />
      {errors.title && <div className="text-xs text-danger">Give the task a title to save.</div>}
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
    </div>
  );
}
