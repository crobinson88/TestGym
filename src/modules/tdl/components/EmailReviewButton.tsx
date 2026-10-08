import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  ExternalLink,
  Inbox,
  Loader2,
  MailQuestion,
  Plus,
  SkipForward,
  Undo2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { prettyDate } from "@/lib/utils";
import { useCategories } from "../categories";
import { loadQuickAddCategory, resolveQuickAddCategory } from "../composer";
import { createItem } from "../repo";
import {
  EMAIL_REVIEW_CATEGORY_STORAGE_KEY,
  appendCandidates,
  candidateKey,
  describeReview,
  ledgerRows,
  orderCandidates,
  resolveTitle,
  reviewNotes,
  senderName,
  summariseReview,
  type EmailCandidate,
  type ReviewAction,
  type ReviewRuling,
} from "../emailReview";
import {
  fetchEmailCandidates,
  recordEmailReviews,
  type ReviewCursors,
  type ReviewFetch,
} from "../emailReviewApi";

// Start loading the next page once the user is this close to the end of the
// queue, so a pass never stalls on a fetch at a few hundred mails a day.
const PREFETCH_AHEAD = 5;

function loadCategory(): string | null {
  try {
    // The review pass keeps its own pick, falling back to the quick-add bar's
    // so a first pass lands somewhere sensible rather than on category one.
    return localStorage.getItem(EMAIL_REVIEW_CATEGORY_STORAGE_KEY) ?? loadQuickAddCategory();
  } catch {
    // ignore unavailable storage — fall back to the initial default
    return null;
  }
}

function rememberCategory(key: string) {
  try {
    localStorage.setItem(EMAIL_REVIEW_CATEGORY_STORAGE_KEY, key);
  } catch {
    // ignore storage failures — the pick still holds for the session
  }
}

function receivedText(iso: string | null): string | null {
  if (!iso) return null;
  const date = iso.slice(0, 10);
  return prettyDate(date);
}

// Review the mail sitting in every configured account and decide, one email at
// a time, which of it is actually a task.
//
// Propose-then-confirm, like the suggested snoozes and the roll-forward modal
// rather than triage's write-as-you-tap: the server call writes nothing, every
// ruling is held here, and confirming the pass creates the tasks and the ledger
// rows in one go. So "Undo" costs nothing, and closing the modal half-way
// through leaves the inbox exactly as it was.
export function EmailReviewButton({ snapshot_date }: { snapshot_date: string }) {
  const { session } = useAuth();
  const categories = useCategories();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [fetched, setFetched] = useState<ReviewFetch | null>(null);
  const [queue, setQueue] = useState<EmailCandidate[]>([]);
  // Paging state: where each mailbox got to, whether the window is exhausted,
  // how much has been read so far, and whether a page is in flight.
  const [cursors, setCursors] = useState<ReviewCursors>({});
  const [done, setDone] = useState(true);
  const [readSoFar, setReadSoFar] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [index, setIndex] = useState(0);
  const [rulings, setRulings] = useState<ReviewRuling[]>([]);
  // The title and category for the card on screen, seeded from the suggestion.
  const [title, setTitle] = useState("");
  const [section, setSection] = useState("");

  const card: EmailCandidate | undefined = queue[index];
  // Out of cards AND out of window. With pages left, the queue running dry is a
  // wait, not the end of the pass.
  const exhausted = index >= queue.length;
  const finished = exhausted && done;
  const waiting = exhausted && !done;
  const tally = summariseReview(rulings);
  const saved = note !== null;

  function seedCard(next: EmailCandidate | undefined, keepSection: string) {
    setTitle(next ? resolveTitle(next, null) : "");
    setSection(resolveQuickAddCategory(keepSection || loadCategory(), categories));
  }

  async function run() {
    if (!session || loading) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    setNote(null);
    setRulings([]);
    setIndex(0);
    try {
      const result = await fetchEmailCandidates(session.access_token);
      const ordered = orderCandidates(result.candidates);
      setFetched(result);
      setQueue(ordered);
      setCursors(result.cursors);
      setDone(result.done);
      setReadSoFar(result.scanned);
      seedCard(ordered[0], "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
      setQueue([]);
      setFetched(null);
      setDone(true);
    } finally {
      setLoading(false);
    }
  }

  // Walk the next page. Appends rather than re-sorting, so cards the user has
  // not reached yet stay where they were.
  async function loadMore() {
    if (!session || loadingMore || done) return;
    setLoadingMore(true);
    try {
      const result = await fetchEmailCandidates(session.access_token, cursors);
      setQueue((prev) => {
        const next = appendCandidates(prev, result.candidates);
        // Seed the card if the user is sitting on an empty queue waiting.
        if (prev.length === index && next.length > index) seedCard(next[index], section);
        return next;
      });
      setCursors(result.cursors);
      setDone(result.done);
      setReadSoFar((n) => n + result.scanned);
      setFetched((prev) => (prev ? { ...prev, errors: result.errors } : result));
    } catch (e) {
      // A failed page does not end the pass: what is already queued still
      // stands, and the next prefetch retries from the same cursor.
      setError(e instanceof Error ? e.message : "Could not load more email");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!open || loading || done || loadingMore || error) return;
    if (index >= queue.length - PREFETCH_AHEAD) void loadMore();
    // loadMore is stable enough for this guard set; re-running on queue/index
    // movement is exactly the trigger we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, loading, done, loadingMore, error, index, queue.length]);

  function rule(action: ReviewAction) {
    if (!card || saving) return;
    if (action === "add") rememberCategory(section);
    setRulings((prev) => [
      ...prev,
      { candidate: card, action, title: resolveTitle(card, title), section },
    ]);
    const next = index + 1;
    setIndex(next);
    seedCard(queue[next], section);
  }

  function undo() {
    if (rulings.length === 0 || saving) return;
    const back = index - 1;
    setRulings((prev) => prev.slice(0, -1));
    setIndex(back);
    const last = rulings[rulings.length - 1];
    setTitle(last.title);
    setSection(last.section);
  }

  // Nothing has been written until here: create one task per "add" through the
  // normal offline-first path, then record every ruling bar the left-for-later
  // ones so those threads come back next pass.
  async function confirm() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const itemIdByKey = new Map<string, string>();
      for (const ruling of rulings) {
        if (ruling.action !== "add") continue;
        const item = await createItem({
          snapshot_date,
          section: ruling.section,
          is_recurring: false,
          title: ruling.title,
          notes: reviewNotes(ruling.candidate),
        });
        itemIdByKey.set(candidateKey(ruling.candidate), item.id);
      }
      await recordEmailReviews(ledgerRows(rulings, itemIdByKey));
      setNote(describeReview(rulings));
      setOpen(false);
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
      setNote(`Closed without saving — ${rulings.length} decision${rulings.length === 1 ? "" : "s"} discarded`);
    }
    setRulings([]);
    setIndex(0);
  }

  const ruled = rulings.length;
  const label = ruled > 0 && !finished ? `Review email · ${ruled}/${queue.length}` : "Review email";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => void run()} disabled={!session || loading}>
          {loading ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <MailQuestion className="mr-1 h-4 w-4" />
          )}
          {loading ? "Reading inbox…" : label}
        </Button>
        {saved && (
          <span className={note.startsWith("Closed") ? "text-xs text-warn" : "text-xs text-success"}>
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
            aria-label="Review email"
            onClick={close}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Inbox className="h-5 w-5 shrink-0 text-accent" />
                    <h2 className="truncate text-base font-semibold">Review email</h2>
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
                {error && (
                  <p className="mb-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error}
                  </p>
                )}

                {/* A mailbox that could not be read is named rather than looking empty. */}
                {fetched?.errors.map((e) => (
                  <p
                    key={e.accountId}
                    className="mb-3 flex items-start gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {e.label} could not be read — {e.message}
                    </span>
                  </p>
                ))}

                {/* How big the window is and how far into it we are. The pass
                    is a queue you stop whenever you like, so this is progress,
                    not a truncation warning — but it must be stated, or a
                    pass ended early would read as a handled inbox. */}
                {fetched && fetched.matched > 0 && (
                  <p className="mb-3 rounded-lg border border-line bg-surface2 px-3 py-2 text-xs text-muted">
                    ~{fetched.matched.toLocaleString()} emails addressed to you in the window ·{" "}
                    {readSoFar.toLocaleString()} read so far, newest first
                    {done ? " · end of the window" : " · more load as you go"}
                  </p>
                )}

                {loading ? (
                  <p className="py-10 text-center text-sm text-muted">Reading your inbox…</p>
                ) : waiting ? (
                  <div className="py-10 text-center">
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted" />
                    <p className="mt-3 text-sm text-muted">Loading the next batch…</p>
                  </div>
                ) : finished ? (
                  <div className="py-6 text-center">
                    <Check className="mx-auto h-10 w-10 text-success" />
                    <p className="mt-3 text-base font-semibold">
                      {queue.length === 0 ? "Nothing new to review" : "Pass complete"}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {queue.length === 0
                        ? `${readSoFar} email${readSoFar === 1 ? "" : "s"} read, all of them already ruled on`
                        : describeReview(rulings)}
                    </p>
                    {tally.added > 0 && (
                      <p className="mt-1 text-xs text-muted">
                        Confirm to add {tally.added === 1 ? "it" : "them"} to {prettyDate(snapshot_date)}.
                      </p>
                    )}
                  </div>
                ) : card ? (
                  <>
                    <div className="rounded-xl border border-line bg-surface2 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                          {card.accountLabel}
                        </span>
                        {card.suggested ? (
                          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-semibold text-accent">
                            Looks like a task
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                            Probably not a task
                          </span>
                        )}
                        {receivedText(card.receivedAt) && (
                          <span className="text-[11px] text-muted">{receivedText(card.receivedAt)}</span>
                        )}
                      </div>
                      <h3 className="mt-2 text-base font-semibold leading-snug">
                        {card.subject || "(no subject)"}
                      </h3>
                      <p className="mt-1 text-xs text-muted">{senderName(card.from) || card.from}</p>
                      {card.action && <p className="mt-2 text-sm">{card.action}</p>}
                      {card.snippet && (
                        <p className="mt-2 line-clamp-4 border-t border-line pt-2 text-xs text-muted">
                          {card.snippet}
                        </p>
                      )}
                      <a
                        href={card.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-accent"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open in Gmail
                      </a>
                    </div>

                    <div className="mt-4 space-y-2">
                      <label className="block text-xs uppercase tracking-wider text-muted">
                        Task title
                        <Input
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="mt-1"
                          placeholder="What needs doing?"
                        />
                      </label>
                      <label className="block text-xs uppercase tracking-wider text-muted">
                        Category
                        <select
                          value={section}
                          onChange={(e) => setSection(e.target.value)}
                          className="mt-1 h-11 w-full rounded-lg border border-line bg-surface px-2 text-sm text-text outline-none focus:border-accent"
                        >
                          {categories.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <Button
                        size="lg"
                        disabled={saving}
                        onClick={() => rule("add")}
                        className="h-14"
                      >
                        <Plus className="mr-2 h-5 w-5" />
                        Add to to-do
                      </Button>
                      <Button
                        variant="secondary"
                        size="lg"
                        disabled={saving}
                        onClick={() => rule("skip")}
                        className="h-14"
                      >
                        <SkipForward className="mr-2 h-5 w-5" />
                        Not a task
                      </Button>
                      <Button
                        variant="ghost"
                        size="lg"
                        disabled={saving}
                        onClick={() => rule("later")}
                        className="h-14"
                      >
                        <ChevronRight className="mr-2 h-5 w-5" />
                        Decide later
                      </Button>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      "Not a task" keeps the thread out of future passes. "Decide later" writes
                      nothing, so it comes back next time.
                    </p>
                  </>
                ) : null}
              </div>

              <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={undo}
                  disabled={saving || rulings.length === 0}
                  aria-label="Undo last decision"
                >
                  <Undo2 className="mr-1 h-4 w-4" />
                  Undo
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] tabular-nums text-muted">
                    {tally.added} added · {tally.skipped} skipped · {tally.later} later
                    {loadingMore && " · loading…"}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => void confirm()}
                    disabled={saving || loading || rulings.length === 0}
                  >
                    {saving ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : null}
                    {saving ? "Saving…" : `Confirm ${ruled}`}
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
