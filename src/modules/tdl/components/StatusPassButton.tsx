import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Archive,
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  Flag,
  Repeat,
  SkipForward,
  SlidersHorizontal,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, prettyDate } from "@/lib/utils";
import { useCategories } from "../categories";
import { MAX_PRIORITY_RANK, usedRanks } from "../priority";
import { archiveItem, setPriorityRank, updateItem } from "../repo";
import { statusLabel, statusOptionsFor } from "../status";
import {
  collectStatusQueue,
  describeStatusPass,
  isNoOp,
  rankChanged,
  summariseStatusPass,
  type StatusCard,
  type StatusDecision,
  type StatusPassAction,
} from "../statusPass";
import type { LocalTdlItem, TdlItemRow, TdlStatus } from "../types";
import { STATUS_CLASSES, StatusPill } from "./StatusPill";

function staleText(card: StatusCard): string {
  if (card.stale === 0) return "Worked today";
  return `No progress in ${card.stale} day${card.stale === 1 ? "" : "s"}`;
}

function snapshotOf(item: LocalTdlItem): StatusDecision["before"] {
  return {
    status: item.status,
    last_worked_at: item.last_worked_at ?? null,
    is_archived: item.is_archived,
    priority_rank: item.priority_rank ?? null,
  };
}

// Walks the day's live tasks one card at a time and sets each one's status —
// the Triage flow's rhythm (one decision per tap, each written as it is made,
// the last one always undoable) aimed at the status rather than at whether the
// task stays on the board. Recurring dailies are included, since re-stating
// them is exactly what they are for.
//
// Two things ride alongside the status, because re-reading a task is also when
// you notice them: its **priority rank**, set from the card without advancing
// the pass (a rank is not a ruling — the card still wants a status), and
// **Archive**, which is a ruling: the task is done with the board, not just
// with today, so it ends the card like any status would.
export function StatusPassButton({
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
  // The pass is snapshotted when the modal opens: its own writes drop rows out
  // of `items`, which would otherwise reshuffle the queue under the user's thumb.
  const [queue, setQueue] = useState<StatusCard[]>([]);
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<StatusDecision[]>([]);
  // The rank set while the current card is up. `undefined` = untouched, so the
  // picker falls back to the snapshot's own rank.
  const [rank, setRank] = useState<number | null | undefined>(undefined);

  const pending = useMemo(
    () => collectStatusQueue(items, snapshot_date),
    [items, snapshot_date],
  );

  // A day change drops a half-finished pass rather than carrying it over.
  useEffect(() => {
    setOpen(false);
    setNote(null);
  }, [snapshot_date]);

  const labelBySection = useMemo(
    () => new Map(categories.map((c) => [c.key, c.label])),
    [categories],
  );

  // Live, not snapshotted: a rank taken during the pass must show as taken on
  // the cards still to come.
  const takenRanks = useMemo(() => usedRanks(items), [items]);

  function openModal() {
    setQueue(pending);
    setIndex(0);
    setDecisions([]);
    setRank(undefined);
    setNote(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    setNote(decisions.length > 0 ? describeStatusPass(decisions) : null);
  }

  const card: StatusCard | undefined = queue[index];
  const finished = index >= queue.length;

  async function record(action: StatusPassAction) {
    if (!card || busy) return;
    setBusy(true);
    try {
      const { item } = card;
      const before = snapshotOf(item);
      if (action === "archive") await archiveItem(item.id);
      else if (!isNoOp(item, action))
        await updateItem(item.id, { status: action as TdlStatus });
      setDecisions((prev) => [
        ...prev,
        { id: item.id, title: item.title, action, rank, before },
      ]);
      setIndex((i) => i + 1);
      setRank(undefined);
    } finally {
      setBusy(false);
    }
  }

  // Ranking a task does not advance the pass: the card still wants a status,
  // and the rank is folded into whichever ruling it eventually gets.
  async function changeRank(next: number | null) {
    if (!card || busy) return;
    setBusy(true);
    try {
      await setPriorityRank(card.item.id, next);
      setRank(next);
    } finally {
      setBusy(false);
    }
  }

  // Put the last ruling back and step onto its card again. Status, its
  // last-worked stamp, the archive flag and the rank are the only fields the
  // flow touches; the stamp is restored explicitly so a rewind can't leave
  // today's date on a task that was never actually worked. A rank goes back
  // through setPriorityRank so per-day uniqueness still holds — it does not
  // hand the rank back to whatever sibling was displaced to free it.
  async function undo() {
    const last = decisions[decisions.length - 1];
    if (!last || busy) return;
    setBusy(true);
    try {
      const patch: Partial<TdlItemRow> = {};
      if (last.action === "archive")
        patch.is_archived = last.before.is_archived;
      else if (last.action !== "skip" && last.action !== last.before.status) {
        patch.status = last.before.status;
        patch.last_worked_at = last.before.last_worked_at;
      }
      if (Object.keys(patch).length > 0) await updateItem(last.id, patch);
      if (rankChanged(last))
        await setPriorityRank(last.id, last.before.priority_rank);
      setDecisions((prev) => prev.slice(0, -1));
      setIndex((i) => Math.max(0, i - 1));
      setRank(undefined);
    } finally {
      setBusy(false);
    }
  }

  const count = pending.length;
  const tally = summariseStatusPass(decisions);
  const options: TdlStatus[] = card ? statusOptionsFor(card.item.section) : [];
  const currentRank =
    rank !== undefined ? rank : (card?.item.priority_rank ?? null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={openModal}
          disabled={count === 0}
        >
          <SlidersHorizontal className="mr-1 h-4 w-4" />
          {count === 0 ? "Nothing to update" : `Statuses · ${count}`}
        </Button>
        {note && <span className="text-xs text-success">{note}</span>}
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Update statuses"
            onClick={() => (busy ? null : closeModal())}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <SlidersHorizontal className="h-5 w-5 shrink-0 text-accent" />
                    <h2 className="truncate text-base font-semibold">
                      Update statuses
                    </h2>
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
                      {queue.length === 0
                        ? "Nothing to update"
                        : "Pass complete"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {describeStatusPass(decisions)}
                    </p>
                  </div>
                ) : card ? (
                  <>
                    <div className="rounded-xl border border-line bg-surface2 p-4">
                      <h3 className="text-lg font-semibold leading-snug">
                        {card.item.title}
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                          {labelBySection.get(card.item.section) ??
                            card.item.section}
                        </span>
                        <StatusPill
                          status={card.item.status}
                          section={card.item.section}
                          compact
                        />
                        {currentRank != null && (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                            P{currentRank}
                          </span>
                        )}
                        {card.item.is_recurring && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                            <Repeat className="h-3 w-3 shrink-0" />
                            Daily
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

                    <p className="mt-4 text-xs uppercase tracking-wider text-muted">
                      Priority
                    </p>
                    <div className="relative mt-2">
                      <Flag
                        className={cn(
                          "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                          currentRank != null ? "text-warn" : "text-muted",
                        )}
                      />
                      <select
                        value={currentRank ?? ""}
                        disabled={busy}
                        onChange={(e) => {
                          const v = e.currentTarget.value;
                          void changeRank(v === "" ? null : Number(v));
                        }}
                        aria-label="Priority rank"
                        className={cn(
                          "h-12 w-full cursor-pointer appearance-none rounded-xl border border-line bg-surface2 pl-10 pr-3 text-sm font-semibold outline-none focus:border-accent disabled:opacity-50",
                          currentRank != null ? "text-warn" : "text-muted",
                        )}
                      >
                        <option value="">Not a priority</option>
                        {Array.from(
                          { length: MAX_PRIORITY_RANK },
                          (_, i) => i + 1,
                        ).map((n) => (
                          <option
                            key={n}
                            value={n}
                            disabled={takenRanks.has(n) && n !== currentRank}
                          >
                            Priority {n}
                            {takenRanks.has(n) && n !== currentRank
                              ? " (taken)"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <p className="mt-4 text-xs uppercase tracking-wider text-muted">
                      Set status
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {options.map((status) => {
                        const current = status === card.item.status;
                        return (
                          <button
                            key={status}
                            type="button"
                            disabled={busy}
                            onClick={() => void record(status)}
                            className={cn(
                              "flex h-14 flex-col items-start justify-center gap-0.5 rounded-xl px-4 text-left text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50",
                              STATUS_CLASSES[status],
                              current && "ring-2 ring-accent",
                            )}
                          >
                            <span>
                              {statusLabel(status, card.item.section)}
                            </span>
                            {current && (
                              <span className="text-[11px] font-normal opacity-70">
                                Current
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Button
                        variant="secondary"
                        size="lg"
                        disabled={busy}
                        onClick={() => void record("archive")}
                        className="h-12 text-base"
                      >
                        <Archive className="mr-2 h-5 w-5" />
                        Archive
                      </Button>
                      <Button
                        variant="ghost"
                        size="lg"
                        disabled={busy}
                        onClick={() => void record("skip")}
                        className="h-12 text-base"
                      >
                        <SkipForward className="mr-2 h-5 w-5" />
                        Skip
                      </Button>
                    </div>
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
                    {tally.updated} updated
                    {tally.archived > 0 && ` · ${tally.archived} archived`}
                    {tally.prioritised > 0 &&
                      ` · ${tally.prioritised} ranked`}{" "}
                    · {tally.skipped} skipped
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
