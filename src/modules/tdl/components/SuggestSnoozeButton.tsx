import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, MoonStar, PauseCircle, Square, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { addDays, prettyDate } from "@/lib/utils";
import { useCategories } from "../categories";
import { snoozeItems } from "../repo";
import { horizonWake, suggestSnoozes, type SnoozeSuggestion } from "../snoozeSuggest";
import type { LocalTdlItem } from "../types";
import { StatusPill } from "./StatusPill";

// One-tap horizons for "wake everything ticked at the same time".
const HORIZONS: { label: string; days: number }[] = [
  { label: "3 days", days: 3 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
];

function reasonText(s: SnoozeSuggestion): string {
  if (s.reason === "paused") return "Paused — on hold by hand";
  return `No progress in ${s.stale} day${s.stale === 1 ? "" : "s"}`;
}

// Offers up the day's stalled tasks for a bulk snooze. It only ever proposes:
// every row is ticked and dated in the modal before anything is written, so the
// suggestion can be edited down to a single task or dropped entirely.
export function SuggestSnoozeButton({
  snapshot_date,
  items,
}: {
  snapshot_date: string;
  items: LocalTdlItem[];
}) {
  const categories = useCategories();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Ticked rows and their (editable) wake-up dates, keyed by item id. Held in
  // modal state only — nothing is written until the user confirms.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Record<string, string>>({});

  const suggestions = useMemo(
    () => suggestSnoozes(items, snapshot_date),
    [items, snapshot_date],
  );

  // A day change (or the board moving underneath us) drops a half-finished pick.
  useEffect(() => {
    setOpen(false);
    setNote(null);
  }, [snapshot_date]);

  const labelBySection = useMemo(
    () => new Map(categories.map((c) => [c.key, c.label])),
    [categories],
  );

  function openModal() {
    setPicked(new Set(suggestions.map((s) => s.item.id)));
    setDates(Object.fromEntries(suggestions.map((s) => [s.item.id, s.until])));
    setNote(null);
    setOpen(true);
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Re-date every ticked row to the same horizon, keeping each item's own floor
  // (a snooze can only move an item forward) and its due-date ceiling.
  function applyHorizon(days: number) {
    setDates((prev) => {
      const next = { ...prev };
      for (const s of suggestions) {
        if (!picked.has(s.item.id)) continue;
        next[s.item.id] = horizonWake(s.item, snapshot_date, days);
      }
      return next;
    });
  }

  async function confirm() {
    setBusy(true);
    try {
      // One write per distinct wake-up date, so hand-edited rows keep their own.
      const byDate = new Map<string, string[]>();
      for (const s of suggestions) {
        if (!picked.has(s.item.id)) continue;
        const until = dates[s.item.id] ?? s.until;
        byDate.set(until, [...(byDate.get(until) ?? []), s.item.id]);
      }
      let snoozed = 0;
      for (const [until, ids] of byDate) snoozed += await snoozeItems(ids, until);
      setOpen(false);
      setNote(`Snoozed ${snoozed} task${snoozed === 1 ? "" : "s"}`);
    } finally {
      setBusy(false);
    }
  }

  const count = suggestions.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={openModal} disabled={count === 0}>
          <MoonStar className="mr-1 h-4 w-4" />
          {count === 0 ? "Nothing to snooze" : `Suggest snoozes · ${count}`}
        </Button>
        {note && <span className="text-xs text-success">{note}</span>}
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Suggested snoozes"
            onClick={() => (busy ? null : setOpen(false))}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <MoonStar className="h-5 w-5 shrink-0 text-accent" />
                  <h2 className="truncate text-base font-semibold">Suggested snoozes</h2>
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
                <p className="text-sm text-muted">
                  These {count === 1 ? "task has" : `${count} tasks have`} stalled on{" "}
                  {prettyDate(snapshot_date)}. Untick anything you still want on the board, or
                  change when it comes back. Priorities, reluctant tasks and anything due soon are
                  never suggested.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setPicked(new Set(suggestions.map((s) => s.item.id)))} disabled={busy}>
                    All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())} disabled={busy}>
                    None
                  </Button>
                  <span className="ml-1 text-xs text-muted">Wake all in</span>
                  {HORIZONS.map((h) => (
                    <button
                      key={h.days}
                      type="button"
                      onClick={() => applyHorizon(h.days)}
                      disabled={busy || picked.size === 0}
                      className="h-9 rounded-full border border-line bg-surface2 px-3 text-xs text-muted hover:text-text disabled:opacity-50"
                    >
                      {h.label}
                    </button>
                  ))}
                </div>

                <ul className="mt-3 space-y-2">
                  {suggestions.map((s) => {
                    const on = picked.has(s.item.id);
                    return (
                      <li
                        key={s.item.id}
                        className={
                          "rounded-xl border p-3 " +
                          (on ? "border-accent bg-accent/10" : "border-line bg-surface2")
                        }
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => toggle(s.item.id)}
                            disabled={busy}
                            aria-pressed={on}
                            aria-label={`Snooze ${s.item.title}`}
                            className={
                              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border " +
                              (on ? "border-accent bg-accent text-bg" : "border-line text-muted")
                            }
                          >
                            {on ? <Check className="h-4 w-4" /> : <Square className="h-3 w-3 opacity-0" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium">{s.item.title}</span>
                              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                                {labelBySection.get(s.item.section) ?? s.item.section}
                              </span>
                              <StatusPill status={s.item.status} section={s.item.section} compact />
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                              {s.reason === "paused" && <PauseCircle className="h-3 w-3 shrink-0" />}
                              <span>{reasonText(s)}</span>
                              {s.item.due_date && <span>· due {s.item.due_date}</span>}
                            </div>
                            <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                              Wake on
                              <Input
                                type="date"
                                value={dates[s.item.id] ?? s.until}
                                min={addDays(s.item.snapshot_date, 1)}
                                disabled={busy || !on}
                                aria-label={`Wake ${s.item.title} on`}
                                onChange={(e) =>
                                  setDates((prev) => ({ ...prev, [s.item.id]: e.target.value }))
                                }
                                className="h-10 w-auto px-2 text-sm"
                              />
                            </label>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => void confirm()} disabled={busy || picked.size === 0}>
                  {busy ? "Snoozing..." : `Snooze ${picked.size} task${picked.size === 1 ? "" : "s"}`}
                </Button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
