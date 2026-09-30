import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCheck, Square, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { dayMonth } from "@/lib/utils";
import { useCategories } from "../categories";
import { UNCATEGORISED } from "../sections";
import {
  formatMinutes,
  sweepMinutes,
  weekLabel,
  weekOf,
  weekRangeLabel,
} from "../completed";
import { logSweep, useSweepCandidates } from "../completions";

// Closes out the week: offers every task marked done inside it that isn't on the
// Completed list yet. Like the snooze and roll-forward suggestions it only ever
// proposes — every row is ticked in the modal before anything is written, so the
// sweep can be edited down to one task or dropped entirely.
export function CloseOutWeekButton({ snapshot_date }: { snapshot_date: string }) {
  const categories = useCategories();
  const candidates = useSweepCandidates(snapshot_date);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const week = weekOf(snapshot_date);
  const pending = candidates ?? [];

  useEffect(() => {
    if (open) setSkipped(new Set());
  }, [open, week]);

  const labelFor = useMemo(() => {
    const byKey = new Map(categories.map((c) => [c.key, c.label]));
    return (key: string) => byKey.get(key) ?? UNCATEGORISED.label;
  }, [categories]);

  const ticked = pending.filter((c) => !skipped.has(c.threadId));

  function toggle(threadId: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  async function confirm() {
    setBusy(true);
    try {
      const added = await logSweep(ticked);
      setNote(
        added === 0
          ? "Nothing logged."
          : `Logged ${added} task${added === 1 ? "" : "s"} to ${weekLabel(week, snapshot_date).toLowerCase()}.`,
      );
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (pending.length === 0 && !note) return null;

  return (
    <>
      {pending.length > 0 && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen(true)}
          className="h-9 px-3 text-xs text-success"
        >
          <CheckCheck className="mr-1 h-4 w-4" /> Close out week ({pending.length})
        </Button>
      )}
      {note && <span className="text-[11px] text-muted">{note}</span>}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
            <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl">
              <header className="flex items-center gap-2 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">Close out the week</h2>
                  <p className="text-[11px] text-muted">
                    {weekRangeLabel(week)} · nothing is written until you confirm
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="ml-auto h-9 w-9 shrink-0"
                >
                  <X className="h-5 w-5" />
                </Button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <ul>
                  {pending.map((c) => {
                    const on = !skipped.has(c.threadId);
                    return (
                      <li key={c.threadId} className="border-b border-line/50 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => toggle(c.threadId)}
                          aria-pressed={on}
                          aria-label={`${on ? "Skip" : "Include"} ${c.item.title}`}
                          className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface2"
                        >
                          {on ? (
                            <CheckCheck className="h-5 w-5 shrink-0 text-success" />
                          ) : (
                            <Square className="h-5 w-5 shrink-0 text-muted" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={on ? "truncate text-sm" : "truncate text-sm text-muted"}>
                              {c.item.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                              <span>{labelFor(c.item.section)}</span>
                              <span>·</span>
                              <span>done {dayMonth(c.item.snapshot_date)}</span>
                              {c.item.time_estimate_min != null && (
                                <>
                                  <span>·</span>
                                  <span>{formatMinutes(c.item.time_estimate_min)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <footer className="border-t border-line px-4 py-3">
                <p className="mb-2 text-[11px] text-muted">
                  {ticked.length} of {pending.length} ticked · {formatMinutes(sweepMinutes(ticked))}{" "}
                  of work. Each lands on the week it was finished in, and comes off the board.
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setOpen(false)}
                    className="h-11 flex-1 text-sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => void confirm()}
                    disabled={busy || ticked.length === 0}
                    className="h-11 flex-1 text-sm"
                  >
                    {busy ? "Logging…" : `Complete ${ticked.length}`}
                  </Button>
                </div>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
