import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarClock, Check, Clock, RefreshCw, Square, ThumbsDown, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { prettyDate } from "@/lib/utils";
import { useCategories } from "../categories";
import { setReluctantItems } from "../repo";
import {
  RELUCTANT_SUGGESTION_LIMIT,
  suggestReluctant,
  type ReluctantSuggestion,
} from "../reluctantSuggest";
import type { LocalTdlItem } from "../types";
import { StatusPill } from "./StatusPill";

function reasonText(s: ReluctantSuggestion): string {
  if (s.reason === "overdue") return `Overdue by ${s.overdue} day${s.overdue === 1 ? "" : "s"}`;
  if (s.reason === "due_soon") return s.item.due_date ? `Due ${s.item.due_date}` : "Due soon";
  return `No progress in ${s.stale} day${s.stale === 1 ? "" : "s"}`;
}

function ReasonIcon({ reason }: { reason: ReluctantSuggestion["reason"] }) {
  if (reason === "overdue") return <AlertTriangle className="h-3 w-3 shrink-0" />;
  if (reason === "due_soon") return <CalendarClock className="h-3 w-3 shrink-0" />;
  return <Clock className="h-3 w-3 shrink-0" />;
}

// Offers up the day's most-avoided tasks for the "Don't want to do" list, five at
// a time. Refresh pages to a different five; ticked rows are flagged on confirm
// (nothing is written until then). The mirror of SuggestSnoozeButton — it flags a
// boolean rather than picking a wake-up date, so there's no horizon/date machinery.
export function SuggestReluctantButton({
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
  // Which page of five we're showing, and the ticked rows on it. Both live in
  // modal state only — nothing is written until the user confirms.
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const suggestions = useMemo(
    () => suggestReluctant(items, snapshot_date),
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

  const total = suggestions.length;
  const pageCount = Math.max(1, Math.ceil(total / RELUCTANT_SUGGESTION_LIMIT));

  function pageItems(p: number): ReluctantSuggestion[] {
    const start = p * RELUCTANT_SUGGESTION_LIMIT;
    return suggestions.slice(start, start + RELUCTANT_SUGGESTION_LIMIT);
  }

  const visible = pageItems(page);

  function openModal() {
    setPage(0);
    setPicked(new Set(pageItems(0).map((s) => s.item.id)));
    setNote(null);
    setOpen(true);
  }

  // Show the next five, wrapping at the end. Fresh page starts fully ticked.
  function refresh() {
    const next = (page + 1) % pageCount;
    setPage(next);
    setPicked(new Set(pageItems(next).map((s) => s.item.id)));
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function confirm() {
    setBusy(true);
    try {
      const flagged = await setReluctantItems([...picked], true);
      setOpen(false);
      setNote(`Added ${flagged} task${flagged === 1 ? "" : "s"}`);
    } finally {
      setBusy(false);
    }
  }

  const rangeFrom = page * RELUCTANT_SUGGESTION_LIMIT + 1;
  const rangeTo = page * RELUCTANT_SUGGESTION_LIMIT + visible.length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={openModal} disabled={total === 0}>
          <ThumbsDown className="mr-1 h-4 w-4" />
          {total === 0 ? "Nothing to flag" : `Don't-want-to-do · ${total}`}
        </Button>
        {note && <span className="text-xs text-success">{note}</span>}
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Suggested don't want to do"
            onClick={() => (busy ? null : setOpen(false))}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <ThumbsDown className="h-5 w-5 shrink-0 text-accent" />
                  <h2 className="truncate text-base font-semibold">Suggested "don't want to do"</h2>
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
                  These look like tasks you keep putting off on {prettyDate(snapshot_date)} — sat
                  untouched, overdue, or due soon. Tick the ones you don't want to do (but still
                  need to), or Refresh for a different five. Tasks already on the list, snoozed,
                  archived or recurring are left off.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPicked(new Set(visible.map((s) => s.item.id)))}
                    disabled={busy}
                  >
                    All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPicked(new Set())}
                    disabled={busy}
                  >
                    None
                  </Button>
                  {total > RELUCTANT_SUGGESTION_LIMIT && (
                    <>
                      <button
                        type="button"
                        onClick={refresh}
                        disabled={busy}
                        className="ml-1 flex h-9 items-center gap-1 rounded-full border border-line bg-surface2 px-3 text-xs text-muted hover:text-text disabled:opacity-50"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh
                      </button>
                      <span className="text-xs text-muted">
                        {rangeFrom}–{rangeTo} of {total}
                      </span>
                    </>
                  )}
                </div>

                <ul className="mt-3 space-y-2">
                  {visible.map((s) => {
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
                            aria-label={`Flag ${s.item.title}`}
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
                              {s.item.priority_rank != null && (
                                <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] text-accent">
                                  P{s.item.priority_rank}
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                              <ReasonIcon reason={s.reason} />
                              <span>{reasonText(s)}</span>
                              {s.item.time_estimate_min != null && (
                                <span>· ~{s.item.time_estimate_min} min</span>
                              )}
                            </div>
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
                  {busy ? "Adding..." : `Add ${picked.size} task${picked.size === 1 ? "" : "s"}`}
                </Button>
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
