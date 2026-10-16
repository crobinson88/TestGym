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
  Star,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn, prettyDate } from "@/lib/utils";
import { useCategories } from "../categories";
import { MAX_PRIORITY_RANK, usedRanks } from "../priority";
import {
  SHORTLIST_LIMIT,
  cutIds,
  describeShortlist,
  emptyShortlist,
  isNominated,
  isOverflowing,
  movePick,
  nominate,
  denominate,
  rankAssignments,
  seedFromRanked,
  togglePick,
  type Shortlist,
} from "../priorityShortlist";
import {
  applyPriorityShortlist,
  archiveItem,
  setPriorityRank,
  updateItem,
} from "../repo";
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
import { PriorityShortlistStep } from "./PriorityShortlistStep";
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
// you notice them: its **priority** (set from the card without advancing the
// pass — a priority is not a ruling, the card still wants a status) and
// **Archive**, which is a ruling: the task is done with the board, not just
// with today, so it ends the card like any status would.
//
// Priority comes in two gestures, because the two questions it answers are not
// the same. "This is P3" can be answered on the card and is written there and
// then. "This might be one of today's ten" cannot — you only know whether it
// beats the others once you have seen them all — so it is **tagged a potential
// priority** and settled later, against the rest of the shortlist. Both land on
// the same shortlist so the two can never disagree, and the shortlist is the
// one part of this flow that is propose-then-confirm: tags write nothing until
// the cut is made.
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
  // The candidates for today's ten, held in state and written only at the cut.
  const [shortlist, setShortlist] = useState<Shortlist>(emptyShortlist);
  // Whether the user has touched the shortlist at all this pass. A day that is
  // already prioritised seeds the shortlist, so without this a pass where
  // priorities were never mentioned would still end on a cut screen.
  const [touched, setTouched] = useState(false);
  // The mid-pass trim, raised the moment the tags outgrow the ten slots.
  const [trimming, setTrimming] = useState(false);
  // How many tags the user had already been shown an overflow for. Leaving a
  // trim without making room is a decision ("those are the ten"), so the same
  // overflow must not stop the pass again on the next card — only a *new* tag
  // past the line does.
  const [trimAckAt, setTrimAckAt] = useState(0);
  const [cutMade, setCutMade] = useState(false);

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

  // Every live item on the day, not just the queue: the shortlist can hold a
  // task the pass itself never shows (one already ranked but already done).
  const itemById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );

  // Live, not snapshotted: a rank taken during the pass must show as taken on
  // the cards still to come.
  const takenRanks = useMemo(() => usedRanks(items), [items]);

  function openModal() {
    setQueue(pending);
    setIndex(0);
    setDecisions([]);
    setRank(undefined);
    // Start from the day's existing priorities so a new candidate competes with
    // them for a slot, rather than silently displacing whoever held its rank.
    setShortlist(seedFromRanked(items));
    setTouched(false);
    setTrimming(false);
    setTrimAckAt(0);
    setCutMade(false);
    setNote(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    const parts = [
      decisions.length > 0 ? describeStatusPass(decisions) : null,
      cutMade ? describeShortlist(shortlist) : null,
    ].filter(Boolean);
    setNote(parts.length > 0 ? parts.join(" · ") : null);
  }

  const card: StatusCard | undefined = queue[index];
  const atEnd = index >= queue.length;
  // The end-of-pass cut: shown once the queue runs out, whether or not the tags
  // ever overflowed — the shortlist still has to be put in order.
  const needsCut = atEnd && touched && !cutMade;
  const view: "card" | "shortlist" | "summary" =
    trimming || needsCut ? "shortlist" : atEnd ? "summary" : "card";

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
      // Raised after the card is ruled rather than on the tag itself, so a tap
      // that overflows the shortlist still finishes the card it was about.
      if (isOverflowing(shortlist) && shortlist.nominated.length > trimAckAt)
        setTrimming(true);
    } finally {
      setBusy(false);
    }
  }

  // Tagging writes nothing: it nominates the task for the cut at the end of the
  // pass. Like the rank picker, it does not advance — the card still wants a
  // status.
  function toggleTag() {
    if (!card || busy) return;
    const id = card.item.id;
    setShortlist((s) => (isNominated(s, id) ? denominate(s, id) : nominate(s, id)));
    setTouched(true);
  }

  // Naming an exact rank is still written on the spot, but it also joins the
  // shortlist, so the final cut sees every candidate however it was nominated.
  async function changeRank(next: number | null) {
    if (!card || busy) return;
    setBusy(true);
    try {
      const id = card.item.id;
      await setPriorityRank(id, next);
      setRank(next);
      setShortlist((s) => (next == null ? denominate(s, id) : nominate(s, id)));
      setTouched(true);
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

  // The cut: picks take ranks 1…n in the order shown, and everyone else on the
  // shortlist is pushed to Do First. The one write the shortlist ever makes.
  async function applyCut() {
    if (busy) return;
    setBusy(true);
    try {
      await applyPriorityShortlist(
        snapshot_date,
        rankAssignments(shortlist),
        cutIds(shortlist),
      );
      setCutMade(true);
      setTrimming(false);
    } finally {
      setBusy(false);
    }
  }

  // Leaving the pass early still owes the shortlist a cut — the tags are the
  // whole reason they were collected, so "Finish" ends the walk and lands on
  // the cut screen rather than dropping them.
  function finishPass() {
    if (busy) return;
    if (touched && !cutMade) {
      setTrimming(false);
      setIndex(queue.length);
      return;
    }
    closeModal();
  }

  const count = pending.length;
  const tally = summariseStatusPass(decisions);
  const options: TdlStatus[] = card ? statusOptionsFor(card.item.section) : [];
  const currentRank =
    rank !== undefined ? rank : (card?.item.priority_rank ?? null);
  const tagged = card ? isNominated(shortlist, card.item.id) : false;
  const cutCount = cutIds(shortlist).length;

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
                    {view === "shortlist" ? (
                      <Flag className="h-5 w-5 shrink-0 text-warn" />
                    ) : (
                      <SlidersHorizontal className="h-5 w-5 shrink-0 text-accent" />
                    )}
                    <h2 className="truncate text-base font-semibold">
                      {view === "shortlist"
                        ? "Pick today's priorities"
                        : "Update statuses"}
                    </h2>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {view === "shortlist"
                        ? `${shortlist.picked.length}/${SHORTLIST_LIMIT}`
                        : atEnd
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
                {view === "shortlist" ? (
                  <PriorityShortlistStep
                    shortlist={shortlist}
                    itemById={itemById}
                    labelBySection={labelBySection}
                    final={needsCut}
                    busy={busy}
                    onTogglePick={(id) =>
                      setShortlist((s) => togglePick(s, id))
                    }
                    onMove={(id, delta) =>
                      setShortlist((s) => movePick(s, id, delta))
                    }
                    onRemove={(id) => setShortlist((s) => denominate(s, id))}
                  />
                ) : view === "summary" ? (
                  <div className="py-6 text-center">
                    <Check className="mx-auto h-10 w-10 text-success" />
                    <p className="mt-3 text-base font-semibold">
                      {queue.length === 0 ? "Nothing to update" : "Pass complete"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {describeStatusPass(decisions)}
                    </p>
                    {cutMade && (
                      <p className="mt-1 text-sm text-muted">
                        {describeShortlist(shortlist)}
                      </p>
                    )}
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
                    <button
                      type="button"
                      disabled={busy}
                      onClick={toggleTag}
                      aria-pressed={tagged}
                      className={cn(
                        "mt-2 flex h-12 w-full items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50",
                        tagged
                          ? "border-warn/50 bg-warn/15 text-warn"
                          : "border-line bg-surface2 text-muted",
                      )}
                    >
                      <Star
                        className={cn("h-4 w-4 shrink-0", tagged && "fill-current")}
                      />
                      {tagged ? "Tagged a potential priority" : "Tag as potential priority"}
                      <span className="ml-auto text-[11px] font-normal tabular-nums opacity-80">
                        {shortlist.nominated.length} tagged
                        {cutCount > 0 && ` · ${cutCount} over`}
                      </span>
                    </button>
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
                {view === "shortlist" ? (
                  <>
                    <span className="text-[11px] tabular-nums text-muted">
                      {shortlist.picked.length} priorit
                      {shortlist.picked.length === 1 ? "y" : "ies"}
                      {cutCount > 0 && ` · ${cutCount} cut`}
                    </span>
                    {needsCut ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => void applyCut()}
                      >
                        Set priorities
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setTrimAckAt(shortlist.nominated.length);
                          setTrimming(false);
                        }}
                      >
                        Back to the pass
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    )}
                  </>
                ) : (
                  <>
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
                      <Button size="sm" onClick={finishPass} disabled={busy}>
                        {atEnd ? "Done" : "Finish"}
                        {!atEnd && <ChevronRight className="ml-1 h-4 w-4" />}
                      </Button>
                    </div>
                  </>
                )}
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
