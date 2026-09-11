import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, Copy, Square, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { addDays, prettyDate } from "@/lib/utils";
import { useCategories } from "../categories";
import { useKnownDates, usePrevDateWithItems } from "../hooks";
import { StatusPill } from "./StatusPill";
import {
  applyRollForward,
  planRollForward,
  type RollForwardDuplicate,
  type RollForwardPlan,
} from "../rollForward";

// How many recent days with tasks to offer as one-tap sources.
const QUICK_PICK_LIMIT = 5;

function reasonText(d: RollForwardDuplicate, fromDate: string): string {
  return d.reason === "chain"
    ? `Already carried onto this day (same task as the ${prettyDate(fromDate)} one)`
    : "A task with this title is already in this category today";
}

export function RollForwardButton({
  toDate,
  defaultFrom,
  variant = "secondary",
  className,
}: {
  toDate: string;
  defaultFrom?: string;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const prev = usePrevDateWithItems(toDate);
  const knownDates = useKnownDates();
  const categories = useCategories();

  const [open, setOpen] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [plan, setPlan] = useState<RollForwardPlan | null>(null);
  // Duplicates the user has ticked to add anyway. Everything starts unticked —
  // the safe read of a duplicate is "don't add it twice".
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const suggested = defaultFrom ?? prev ?? addDays(toDate, -1);

  // Seed the picker fresh each time it opens, so it never offers a source date
  // left over from a previous run.
  function openModal() {
    setFromDate(suggested);
    setPlan(null);
    setAccepted(new Set());
    setNote(null);
    setOpen(true);
  }

  // Navigating to another day drops any half-finished roll — the plan it holds
  // was built against the day we just left.
  useEffect(() => {
    setOpen(false);
    setPlan(null);
    setAccepted(new Set());
    setNote(null);
  }, [toDate]);

  const labelBySection = useMemo(
    () => new Map(categories.map((c) => [c.key, c.label])),
    [categories],
  );

  const quickPicks = useMemo(
    () =>
      (knownDates ?? [])
        .filter((d) => d < toDate)
        .slice(-QUICK_PICK_LIMIT)
        .reverse(),
    [knownDates, toDate],
  );

  async function finish(rows: Parameters<typeof applyRollForward>[1], skipped: number) {
    const r = await applyRollForward(toDate, rows);
    if (typeof navigator === "undefined" || navigator.onLine) {
      void syncEngine.drain();
    }
    setOpen(false);
    setNote(
      `Carried ${r.created} item${r.created === 1 ? "" : "s"} from ${prettyDate(fromDate)}` +
        (skipped > 0 ? ` · skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}` : ""),
    );
  }

  async function preview() {
    setBusy(true);
    try {
      const p = await planRollForward(fromDate, toDate);
      if (p.duplicates.length === 0) {
        if (p.carry.length === 0) {
          setPlan(p);
          return;
        }
        await finish(p.carry, 0);
        return;
      }
      setPlan(p);
      setAccepted(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!plan) return;
    setBusy(true);
    try {
      const extra = plan.duplicates.filter((d) => accepted.has(d.row.id)).map((d) => d.row);
      await finish([...plan.carry, ...extra], plan.duplicates.length - extra.length);
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const reviewing = plan !== null && plan.duplicates.length > 0;
  const nothingToDo = plan !== null && plan.carry.length === 0 && plan.duplicates.length === 0;
  const addCount = (plan?.carry.length ?? 0) + accepted.size;

  return (
    <>
      <div className={className}>
        <Button variant={variant} size="sm" onClick={openModal}>
          <ArrowRight className="mr-1 h-4 w-4" />
          Roll forward
        </Button>
        {note && <span className="ml-2 text-xs text-success">{note}</span>}
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Roll tasks forward"
            onClick={() => (busy ? null : setOpen(false))}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ArrowRight className="h-5 w-5 shrink-0 text-accent" />
                  <h2 className="truncate text-base font-semibold">
                    {reviewing ? "Check these duplicates" : "Roll tasks forward"}
                  </h2>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  aria-label="Close"
                  className="h-9 w-9 shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {!reviewing && (
                  <>
                    <label
                      className="mb-1 block text-xs uppercase tracking-wider text-muted"
                      htmlFor="roll-forward-from"
                    >
                      Carry tasks from
                    </label>
                    <Input
                      id="roll-forward-from"
                      type="date"
                      value={fromDate}
                      max={addDays(toDate, -1)}
                      onChange={(e) => {
                        setFromDate(e.target.value);
                        setPlan(null);
                      }}
                      className="h-12"
                    />
                    {quickPicks.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {quickPicks.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              setFromDate(d);
                              setPlan(null);
                            }}
                            className={
                              "h-9 rounded-full border px-3 text-xs " +
                              (d === fromDate
                                ? "border-accent bg-accent/15 text-accent"
                                : "border-line bg-surface2 text-muted hover:text-text")
                            }
                          >
                            {prettyDate(d)}
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="mt-3 text-xs text-muted">
                      Every live task on that day is copied onto {prettyDate(toDate)}. Anything
                      that looks like it is already here is held back for you to confirm.
                    </p>
                    {nothingToDo && (
                      <p className="mt-3 text-sm text-warn">
                        Nothing to carry from {prettyDate(fromDate)}.
                      </p>
                    )}
                  </>
                )}

                {reviewing && plan && (
                  <>
                    <p className="text-sm text-muted">
                      {plan.carry.length} new task{plan.carry.length === 1 ? "" : "s"} will be
                      added. {plan.duplicates.length} look
                      {plan.duplicates.length === 1 ? "s" : ""} like{" "}
                      {plan.duplicates.length === 1 ? "a duplicate" : "duplicates"} — tick any that
                      are genuinely separate and should be added too.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAccepted(new Set(plan.duplicates.map((d) => d.row.id)))}
                        disabled={busy}
                      >
                        Add all
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAccepted(new Set())}
                        disabled={busy}
                      >
                        Skip all
                      </Button>
                    </div>
                    <ul className="mt-3 space-y-2">
                      {plan.duplicates.map((d) => {
                        const on = accepted.has(d.row.id);
                        return (
                          <li key={d.row.id}>
                            <button
                              type="button"
                              onClick={() => toggle(d.row.id)}
                              disabled={busy}
                              aria-pressed={on}
                              className={
                                "flex w-full items-start gap-3 rounded-xl border p-3 text-left " +
                                (on ? "border-accent bg-accent/10" : "border-line bg-surface2")
                              }
                            >
                              <span
                                className={
                                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border " +
                                  (on ? "border-accent bg-accent text-bg" : "border-line text-muted")
                                }
                              >
                                {on ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <Square className="h-3 w-3 opacity-0" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-medium">
                                    {d.row.title}
                                  </span>
                                  <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                                    {labelBySection.get(d.row.section) ?? d.row.section}
                                  </span>
                                </span>
                                <span className="mt-1 flex items-center gap-1 text-xs text-muted">
                                  <Copy className="h-3 w-3 shrink-0" />
                                  {reasonText(d, plan.fromDate)}
                                </span>
                                <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                                  Already here as
                                  <StatusPill
                                    status={d.existing.status}
                                    section={d.existing.section}
                                    compact
                                  />
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
                {reviewing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPlan(null)}
                      disabled={busy}
                    >
                      Back
                    </Button>
                    <Button size="sm" onClick={() => void confirm()} disabled={busy || addCount === 0}>
                      {busy ? "Carrying..." : `Add ${addCount} task${addCount === 1 ? "" : "s"}`}
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void preview()}
                    disabled={busy || !fromDate || fromDate >= toDate}
                  >
                    {busy ? "Checking..." : `Roll forward from ${prettyDate(fromDate)}`}
                  </Button>
                )}
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// The prompt shown in place of an empty day's board.
export function RollForwardEmptyCard({
  toDate,
  defaultFrom,
}: {
  toDate: string;
  defaultFrom?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-6 text-center">
      <p className="text-sm text-muted">Nothing here yet. Carry tasks over from another day?</p>
      <RollForwardButton toDate={toDate} defaultFrom={defaultFrom} variant="primary" />
    </div>
  );
}
