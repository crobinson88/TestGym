import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ExternalLink,
  Link2,
  Loader2,
  Mail,
  MessagesSquare,
  Radar,
  SkipForward,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { todayIsoDate } from "@/lib/utils";
import { completeItems } from "../completions";
import { appendItemNotes } from "../repo";
import {
  appendCandidates,
  defaultRange,
  describeCommsReview,
  doneCount,
  evidenceNote,
  isValidRange,
  ledgerRows,
  rangeDays,
  shiftDate,
  summariseCommsReview,
  type Comm,
  type CommsAction,
  type CommsCandidate,
  type CommsRuling,
} from "../commsReview";
import {
  fetchCommsCandidates,
  recordCommsMatches,
  type CommsCursors,
  type CommsFetch,
} from "../commsReviewApi";

// Start loading the next page once the user is this close to the end of the
// queue, so a pass never stalls on a fetch.
const PREFETCH_AHEAD = 3;

function presets(today: string): { label: string; from: string; to: string }[] {
  return [
    { label: "Last 7 days", from: shiftDate(today, -6), to: today },
    { label: "Last 14 days", from: shiftDate(today, -13), to: today },
    { label: "Last 30 days", from: shiftDate(today, -29), to: today },
    { label: "Yesterday", from: shiftDate(today, -1), to: shiftDate(today, -1) },
  ];
}

function CommRow({ comm }: { comm: Comm }) {
  const Icon = comm.source === "slack" ? MessagesSquare : Mail;
  return (
    <li className="rounded-lg border border-line bg-surface2/50 px-3 py-2">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
            <span className="truncate">{comm.accountLabel}</span>
            <span className="truncate font-medium text-text">{comm.heading}</span>
            {comm.at && <span className="tabular-nums">{comm.at.slice(0, 10)}</span>}
          </div>
          <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-text">
            {comm.text.trim() || "(no text)"}
          </p>
          {comm.url && (
            <a
              href={comm.url}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
            >
              Open <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

// Review what you actually wrote across Slack and email over a date range, and
// rule on the to-do tasks it matches — one card per task, carrying the
// communications that evidence it.
//
// Propose-then-confirm, like the email review pass and the suggested snoozes
// rather than triage's write-as-you-tap: the server call writes nothing, every
// ruling is held here, and confirming the pass completes the tasks, attaches
// the evidence and writes the match ledger in one go. So "Undo" costs nothing,
// and closing the modal half-way through leaves the board exactly as it was.
export function CommsReviewButton({ snapshot_date }: { snapshot_date: string }) {
  const { session } = useAuth();
  const today = todayIsoDate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fetched, setFetched] = useState<CommsFetch | null>(null);
  const [queue, setQueue] = useState<CommsCandidate[]>([]);
  const [cursors, setCursors] = useState<CommsCursors>({});
  const [done, setDone] = useState(true);
  const [readSoFar, setReadSoFar] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [index, setIndex] = useState(0);
  const [rulings, setRulings] = useState<CommsRuling[]>([]);
  const [range, setRange] = useState(() => defaultRange(today));

  const current = queue[index] ?? null;
  const exhausted = index >= queue.length;
  const finished = fetched !== null && exhausted && done;
  const tally = summariseCommsReview(rulings);

  // Read the first page for the chosen range. Writes nothing server-side.
  async function run() {
    if (!session) return;
    if (!isValidRange(range.from, range.to)) {
      setError("Pick a start date on or before the end date");
      return;
    }
    setLoading(true);
    setError(null);
    setNote(null);
    try {
      const result = await fetchCommsCandidates(session.access_token, range.from, range.to);
      setFetched(result);
      setQueue(appendCandidates([], result.candidates));
      setCursors(result.cursors);
      setDone(result.done);
      setReadSoFar(result.scanned);
      setIndex(0);
      setRulings([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read your comms");
    } finally {
      setLoading(false);
    }
  }

  const loadMore = useCallback(async () => {
    if (!session || loadingMore || done) return;
    setLoadingMore(true);
    try {
      const result = await fetchCommsCandidates(
        session.access_token,
        range.from,
        range.to,
        cursors,
      );
      setQueue((prev) => appendCandidates(prev, result.candidates));
      setCursors(result.cursors);
      setDone(result.done);
      setReadSoFar((n) => n + result.scanned);
      // Later pages can surface a mailbox that has since failed; keep the
      // newest error list so a dead grant is still reported.
      setFetched((prev) => (prev ? { ...prev, errors: result.errors } : prev));
    } catch (e) {
      // A failed page must not end the pass: what is already queued still
      // rules fine, so surface it and stop paging.
      setError(e instanceof Error ? e.message : "Could not read the next page");
      setDone(true);
    } finally {
      setLoadingMore(false);
    }
  }, [session, loadingMore, done, range.from, range.to, cursors]);

  useEffect(() => {
    if (!open || done || loadingMore) return;
    if (queue.length - index <= PREFETCH_AHEAD) void loadMore();
  }, [open, done, loadingMore, queue.length, index, loadMore]);

  function rule(action: CommsAction) {
    if (!current) return;
    setRulings((prev) => [...prev, { candidate: current, action }]);
    setIndex((i) => i + 1);
  }

  function undo() {
    if (rulings.length === 0) return;
    setRulings((prev) => prev.slice(0, -1));
    setIndex((i) => Math.max(0, i - 1));
  }

  // Nothing has been written until here. Complete the "done" tasks through the
  // Completed-list path so they leave the board and the week gets the credit,
  // attach the evidence to the "connected" ones, then record every ruling bar
  // the left-for-later ones so those pairs come back next pass.
  async function confirm() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const completing = rulings
        .filter((r) => r.action === "done")
        .map((r) => r.candidate.itemId);
      if (completing.length > 0) await completeItems(completing, snapshot_date);

      for (const ruling of rulings) {
        if (ruling.action !== "connected") continue;
        await appendItemNotes(ruling.candidate.itemId, evidenceNote(ruling.candidate));
      }

      await recordCommsMatches(ledgerRows(rulings));
      setNote(describeCommsReview(rulings));
      setOpen(false);
      setRulings([]);
      setIndex(0);
      setFetched(null);
      setQueue([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the pass");
    } finally {
      setSaving(false);
    }
  }

  // Closing without confirming writes nothing — which is the safe outcome, but
  // it would be dishonest to leave it unsaid when a pass was half-made.
  function close() {
    if (saving) return;
    setOpen(false);
    if (rulings.length > 0) {
      setNote(
        `Closed without saving — ${rulings.length} decision${rulings.length === 1 ? "" : "s"} discarded`,
      );
    }
    setRulings([]);
    setIndex(0);
    setFetched(null);
    setQueue([]);
  }

  const ruled = rulings.length;
  const label = ruled > 0 && !exhausted ? `Review comms · ${ruled}/${queue.length}` : "Review comms";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setOpen(true)}
          disabled={!session}
        >
          <Radar className="mr-1 h-4 w-4" />
          {label}
        </Button>
        {note && (
          <span
            className={note.startsWith("Closed") ? "text-xs text-warn" : "text-xs text-success"}
          >
            {note}
          </span>
        )}
      </div>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Review comms"
            onClick={close}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Radar className="h-5 w-5 shrink-0 text-accent" />
                    <h2 className="truncate text-base font-semibold">Review comms</h2>
                    {queue.length > 0 && (
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {exhausted
                          ? `${queue.length} of ${queue.length}`
                          : `${index + 1} of ${queue.length}${done ? "" : "+"}`}
                      </span>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={close}
                    disabled={saving}
                    aria-label="Close"
                    className="h-9 w-9 shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {fetched && (
                  <p className="mt-1 text-[11px] text-muted">
                    {range.from} → {range.to} · {readSoFar} of {fetched.matched} comms read ·
                    weighed against {fetched.tasks} open task{fetched.tasks === 1 ? "" : "s"}
                  </p>
                )}
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {error && (
                  <p className="mb-3 flex items-start gap-2 rounded-lg bg-danger/15 px-3 py-2 text-sm text-danger">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    {error}
                  </p>
                )}

                {fetched?.errors.map((e) => (
                  <p
                    key={`${e.source}-${e.label}`}
                    className="mb-2 flex items-start gap-2 rounded-lg bg-warn/15 px-3 py-2 text-xs text-warn"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      {e.source === "slack" ? "Slack" : "Mailbox"} “{e.label}” could not be read:{" "}
                      {e.message}
                    </span>
                  </p>
                ))}

                {/* Step 1 — pick the range. Nothing is read until asked. */}
                {!fetched && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted">
                      Read everything you wrote across Slack and email over a date range, and match
                      it against the tasks still open on your board.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {presets(today).map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setRange({ from: p.from, to: p.to })}
                          className={`rounded-full border px-3 py-1 text-xs ${
                            range.from === p.from && range.to === p.to
                              ? "border-accent bg-accent/15 text-accent"
                              : "border-line bg-surface2 text-muted hover:text-text"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="flex flex-col gap-1 text-xs text-muted">
                        From
                        <Input
                          type="date"
                          value={range.from}
                          max={range.to}
                          onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-muted">
                        To
                        <Input
                          type="date"
                          value={range.to}
                          min={range.from}
                          onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                        />
                      </label>
                      <span className="pb-3 text-xs tabular-nums text-muted">
                        {rangeDays(range.from, range.to)} day
                        {rangeDays(range.from, range.to) === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                )}

                {/* Step 2 — one card per matched task. */}
                {current && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          current.verdict === "done"
                            ? "bg-success/15 text-success"
                            : "bg-accent/15 text-accent"
                        }`}
                      >
                        {current.verdict === "done" ? "Looks finished" : "Related"}
                      </span>
                      <span className="text-[11px] text-muted">{current.categoryLabel}</span>
                      <span className="text-[11px] text-muted">{current.status}</span>
                    </div>
                    <h3 className="text-lg font-semibold leading-snug">{current.itemTitle}</h3>
                    <p className="text-sm text-muted">{current.reason}</p>
                    <ul className="space-y-2">
                      {current.comms.map((c) => (
                        <CommRow key={`${c.source}:${c.key}`} comm={c} />
                      ))}
                    </ul>
                  </div>
                )}

                {/* Step 3 — the pass is worked out; confirm or close. */}
                {fetched && !current && (
                  <div className="space-y-2 py-4 text-center">
                    <CheckCheck className="mx-auto h-8 w-8 text-success" />
                    <p className="text-sm font-medium">
                      {queue.length === 0
                        ? "No tasks matched what you wrote in this range"
                        : finished
                          ? "That is every match in the range"
                          : "Caught up with what has been read"}
                    </p>
                    <p className="text-sm text-muted">{describeCommsReview(rulings)}</p>
                    {loadingMore && (
                      <p className="flex items-center justify-center gap-2 text-xs text-muted">
                        <Loader2 className="h-3 w-3 animate-spin" /> reading more…
                      </p>
                    )}
                  </div>
                )}
              </div>

              <footer className="border-t border-line px-4 py-3">
                {current ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Button size="sm" onClick={() => rule("done")}>
                        <Check className="mr-1 h-4 w-4" />
                        Mark done
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => rule("connected")}>
                        <Link2 className="mr-1 h-4 w-4" />
                        Link evidence
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => rule("skip")}>
                        <X className="mr-1 h-4 w-4" />
                        Not a match
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => rule("later")}>
                        <SkipForward className="mr-1 h-4 w-4" />
                        Decide later
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[11px] tabular-nums text-muted">
                        {tally.done} done · {tally.connected} linked · {tally.skipped} not a match
                        {doneCount(queue) > 0 ? ` · ${doneCount(queue)} look finished` : ""}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={undo}
                        disabled={rulings.length === 0}
                      >
                        <Undo2 className="mr-1 h-4 w-4" />
                        Undo
                      </Button>
                    </div>
                  </>
                ) : !fetched ? (
                  <Button
                    className="w-full"
                    onClick={() => void run()}
                    disabled={loading || !isValidRange(range.from, range.to)}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Reading your comms…
                      </>
                    ) : (
                      "Read comms"
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button
                      className="flex-1"
                      onClick={() => void confirm()}
                      disabled={saving || rulings.length === 0}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : (
                        `Save pass (${rulings.length})`
                      )}
                    </Button>
                    <Button variant="ghost" onClick={close} disabled={saving}>
                      Close
                    </Button>
                  </div>
                )}
              </footer>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
