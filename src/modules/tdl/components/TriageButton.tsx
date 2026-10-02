import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  ListChecks,
  MoonStar,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { prettyDate } from "@/lib/utils";
import { useCategories } from "../categories";
import { archiveItem, deleteItem, snoozeItem, updateItem } from "../repo";
import {
  SNOOZE_HORIZONS,
  collectTriageQueue,
  describeTriage,
  horizonDate,
  summariseTriage,
  type TriageCard,
  type TriageDecision,
} from "../triage";
import type { LocalTdlItem } from "../types";
import { StatusPill } from "./StatusPill";

function staleText(card: TriageCard): string {
  if (card.stale === 0) return "Worked today";
  return `No progress in ${card.stale} day${card.stale === 1 ? "" : "s"}`;
}

function snapshotOf(item: LocalTdlItem): TriageDecision["before"] {
  return {
    is_archived: item.is_archived,
    deleted_at: item.deleted_at ?? null,
    snoozed_until: item.snoozed_until ?? null,
  };
}

// Reviews the day's open tasks one card at a time: keep it, archive it, delete it
// or snooze it, then on to the next. Unlike the propose-then-confirm flows
// (suggested snoozes, roll-forward), each ruling is written as it is made — the
// whole point is a rhythm of one decision per tap — so the last one is always
// undoable from the footer.
export function TriageButton({
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
  // The pass is snapshotted when the modal opens: its own writes drop rows out of
  // `items`, which would otherwise reshuffle the queue under the user's thumb.
  const [queue, setQueue] = useState<TriageCard[]>([]);
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<TriageDecision[]>([]);
  // Which card the snooze horizons are showing for, so the four options replace
  // the four actions in place rather than opening a second modal.
  const [snoozing, setSnoozing] = useState(false);

  const pending = useMemo(() => collectTriageQueue(items, snapshot_date), [items, snapshot_date]);

  // A day change drops a half-finished pass rather than carrying it over.
  useEffect(() => {
    setOpen(false);
    setNote(null);
  }, [snapshot_date]);

  const labelBySection = useMemo(
    () => new Map(categories.map((c) => [c.key, c.label])),
    [categories],
  );

  function openModal() {
    setQueue(pending);
    setIndex(0);
    setDecisions([]);
    setSnoozing(false);
    setNote(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setNote(decisions.length > 0 ? describeTriage(decisions) : null);
  }

  const card: TriageCard | undefined = queue[index];
  const finished = index >= queue.length;

  async function record(action: TriageDecision["action"], until?: string) {
    if (!card || busy) return;
    setBusy(true);
    try {
      const { item } = card;
      const before = snapshotOf(item);
      if (action === "archive") await archiveItem(item.id);
      else if (action === "delete") await deleteItem(item.id);
      else if (action === "snooze" && until) await snoozeItem(item.id, until);
      setDecisions((prev) => [...prev, { id: item.id, title: item.title, action, until, before }]);
      setSnoozing(false);
      setIndex((i) => i + 1);
    } finally {
      setBusy(false);
    }
  }

  // Put the last ruling back and step onto its card again. Restoring the three
  // fields the flow touches is enough — nothing else was changed.
  async function undo() {
    const last = decisions[decisions.length - 1];
    if (!last || busy) return;
    setBusy(true);
    try {
      if (last.action !== "keep") {
        await updateItem(last.id, {
          is_archived: last.before.is_archived,
          deleted_at: last.before.deleted_at,
          snoozed_until: last.before.snoozed_until,
        });
      }
      setDecisions((prev) => prev.slice(0, -1));
      setIndex((i) => Math.max(0, i - 1));
      setSnoozing(false);
    } finally {
      setBusy(false);
    }
  }

  const count = pending.length;
  const tally = summariseTriage(decisions);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={openModal} disabled={count === 0}>
          <ListChecks className="mr-1 h-4 w-4" />
          {count === 0 ? "Nothing to triage" : `Triage · ${count}`}
        </Button>
        {note && <span className="text-xs text-success">{note}</span>}
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Triage tasks"
            onClick={() => (busy ? null : closeModal())}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ListChecks className="h-5 w-5 shrink-0 text-accent" />
                    <h2 className="truncate text-base font-semibold">Triage</h2>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {finished
                        ? `${queue.length} of ${queue.length}`
                        : `${index + 1} of ${queue.length}`}
                    </span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={closeModal}
                    disabled={busy}
                    aria-label="Close"
                    className="h-9 w-9 shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div
                  className="mt-2 h-1 overflow-hidden rounded-full bg-surface2"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={queue.length}
                  aria-valuenow={Math.min(index, queue.length)}
                >
                  <div
                    className="h-full bg-accent transition-all"
                    style={{
                      width: `${queue.length === 0 ? 0 : (Math.min(index, queue.length) / queue.length) * 100}%`,
                    }}
                  />
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {finished ? (
                  <div className="py-6 text-center">
                    <Check className="mx-auto h-10 w-10 text-success" />
                    <p className="mt-3 text-base font-semibold">
                      {queue.length === 0 ? "Nothing to triage" : "Pass complete"}
                    </p>
                    <p className="mt-1 text-sm text-muted">{describeTriage(decisions)}</p>
                  </div>
                ) : card ? (
                  <>
                    <div className="rounded-xl border border-line bg-surface2 p-4">
                      <h3 className="text-lg font-semibold leading-snug">{card.item.title}</h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                          {labelBySection.get(card.item.section) ?? card.item.section}
                        </span>
                        <StatusPill status={card.item.status} section={card.item.section} compact />
                        {card.item.priority_rank != null && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                            P{card.item.priority_rank}
                          </span>
                        )}
                        {card.item.is_reluctant && (
                          <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] text-warn">
                            Don't want to do
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 shrink-0" />
                          {staleText(card)}
                        </span>
                        {card.item.due_date && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="h-3 w-3 shrink-0" />
                            due {prettyDate(card.item.due_date)}
                          </span>
                        )}
                        {card.item.time_estimate_min != null && (
                          <span>{card.item.time_estimate_min}m</span>
                        )}
                      </div>
                      {card.item.notes && (
                        <p className="mt-3 whitespace-pre-wrap border-t border-line pt-3 text-sm text-muted">
                          {card.item.notes}
                        </p>
                      )}
                    </div>

                    {snoozing ? (
                      <div className="mt-4">
                        <p className="text-xs uppercase tracking-wider text-muted">Come back</p>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {SNOOZE_HORIZONS.map((h) => {
                            const until = horizonDate(card.item, snapshot_date, h.key);
                            return (
                              <Button
                                key={h.key}
                                variant="secondary"
                                size="lg"
                                disabled={busy}
                                onClick={() => void record("snooze", until)}
                                className="h-14 flex-col items-start justify-center gap-0.5 px-4 text-left"
                              >
                                <span className="text-sm font-semibold">{h.label}</span>
                                <span className="text-[11px] font-normal text-muted">
                                  {prettyDate(until)}
                                </span>
                              </Button>
                            );
                          })}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSnoozing(false)}
                          disabled={busy}
                          className="mt-2"
                        >
                          <ArrowLeft className="mr-1 h-4 w-4" />
                          Back
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <Button
                          size="lg"
                          disabled={busy}
                          onClick={() => void record("keep")}
                          className="h-14"
                        >
                          <Check className="mr-2 h-5 w-5" />
                          Keep
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          disabled={busy}
                          onClick={() => setSnoozing(true)}
                          className="h-14"
                        >
                          <MoonStar className="mr-2 h-5 w-5" />
                          Snooze
                        </Button>
                        <Button
                          variant="secondary"
                          size="lg"
                          disabled={busy}
                          onClick={() => void record("archive")}
                          className="h-14"
                        >
                          <Archive className="mr-2 h-5 w-5" />
                          Archive
                        </Button>
                        <Button
                          variant="danger"
                          size="lg"
                          disabled={busy}
                          onClick={() => void record("delete")}
                          className="h-14"
                        >
                          <Trash2 className="mr-2 h-5 w-5" />
                          Delete
                        </Button>
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void undo()}
                  disabled={busy || decisions.length === 0}
                  aria-label="Undo last decision"
                >
                  <Undo2 className="mr-1 h-4 w-4" />
                  Undo
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] tabular-nums text-muted">
                    {tally.keep} kept · {tally.archive} archived · {tally.delete} deleted ·{" "}
                    {tally.snooze} snoozed
                  </span>
                  <Button size="sm" onClick={closeModal} disabled={busy}>
                    {finished ? "Done" : "Finish"}
                    {!finished && <ChevronRight className="ml-1 h-4 w-4" />}
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
