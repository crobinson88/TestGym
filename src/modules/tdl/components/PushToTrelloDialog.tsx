import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  ExternalLink,
  ImagePlus,
  Loader2,
  Square,
  SquareCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";
import { chainIndexOf, rootItemId } from "../chain";
import { UNCATEGORISED, type SectionConfig } from "../sections";
import { tdlSignedUrlMap, uploadTdlImages } from "../storage";
import {
  describePushResults,
  draftFromItem,
  groupBoardsByWorkspace,
  labelSwatch,
  labelText,
  latestPushByThread,
  loadTrelloTarget,
  pushBlocker,
  saveTrelloTarget,
  toggleId,
  toPushCards,
  type CardDraft,
  type PushResult,
  type PushedCard,
  type TrelloBoard,
  type TrelloBoardMeta,
} from "../trello";
import {
  fetchPushedCards,
  fetchTrelloBoard,
  fetchTrelloBoards,
  pushToTrello,
} from "../trelloApi";

const selectClass =
  "h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-text outline-none focus:border-accent disabled:opacity-50";
const fieldLabel = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted";

// Sends one task — or every task in a multi-selection, one card each — to a
// Trello list. Board, list, labels and members are shared by the push; each
// card's name, description, due date and images are edited per task. Nothing is
// sent until "Push" is tapped, and a task already on Trello is flagged first.
export function PushToTrelloDialog({
  itemIds,
  categories,
  onClose,
}: {
  itemIds: string[];
  categories: SectionConfig[];
  onClose: () => void;
}) {
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const online = useOnline();

  const [drafts, setDrafts] = useState<CardDraft[] | null>(null);
  const [pushed, setPushed] = useState<Map<string, PushedCard>>(new Map());
  const [expanded, setExpanded] = useState<string | null>(null);

  const remembered = useRef(loadTrelloTarget());
  const [boards, setBoards] = useState<TrelloBoard[] | null>(null);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [meta, setMeta] = useState<TrelloBoardMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);
  const [listId, setListId] = useState<string | null>(null);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [results, setResults] = useState<PushResult[] | null>(null);

  const single = itemIds.length === 1;
  const idsKey = itemIds.join(",");

  // Drafts come from the local store (the menu only knows ids for a bulk
  // selection); the chain root keys the "already pushed" lookup.
  useEffect(() => {
    let active = true;
    void (async () => {
      const all = await db.tdl_items.toArray();
      const byId = new Map(all.map((r) => [r.id, r]));
      const chain = chainIndexOf(all);
      const labelFor = new Map(categories.map((c) => [c.key, c.label]));
      const next = itemIds
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((item) =>
          draftFromItem(
            item,
            rootItemId(item, chain),
            labelFor.get(item.section) ?? UNCATEGORISED.label,
          ),
        );
      if (!active) return;
      setDrafts(next);
      if (next.length === 1) setExpanded(next[0].itemId);
      const log = latestPushByThread(await fetchPushedCards(next.map((d) => d.threadId)));
      if (!active) return;
      setPushed(log);
      // In a multi-push, a task already on Trello starts unticked; a lone task
      // stays ticked and the button says "Push again" instead.
      if (next.length > 1 && log.size > 0) {
        setDrafts((cur) =>
          cur?.map((d) => (log.has(d.threadId) ? { ...d, include: false } : d)) ?? cur,
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [idsKey]);

  useEffect(() => {
    if (!token || !online) return;
    let active = true;
    setLoadError(null);
    fetchTrelloBoards(token)
      .then((b) => {
        if (!active) return;
        setBoards(b);
        const want = remembered.current.boardId;
        setBoardId(want && b.some((x) => x.id === want) ? want : null);
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e instanceof Error ? e.message : "Couldn't load boards");
      });
    return () => {
      active = false;
    };
  }, [token, online]);

  useEffect(() => {
    setMeta(null);
    setListId(null);
    setLabelIds([]);
    setMemberIds([]);
    if (!token || !boardId) return;
    let active = true;
    setMetaLoading(true);
    fetchTrelloBoard(token, boardId)
      .then((m) => {
        if (!active) return;
        setMeta(m);
        const want = remembered.current.listId;
        setListId(want && m.lists.some((l) => l.id === want) ? want : (m.lists[0]?.id ?? null));
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e instanceof Error ? e.message : "Couldn't load the board");
      })
      .finally(() => {
        if (active) setMetaLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, boardId]);

  const allPaths = useMemo(
    () => (drafts ?? []).flatMap((d) => d.images.map((i) => i.path)),
    [drafts],
  );
  const [urls, setUrls] = useState<Record<string, string>>({});
  const pathsKey = allPaths.join(",");
  useEffect(() => {
    const missing = allPaths.filter((p) => !urls[p]);
    if (missing.length === 0) return;
    let active = true;
    void tdlSignedUrlMap(missing).then((m) => {
      if (active) setUrls((prev) => ({ ...prev, ...m }));
    });
    return () => {
      active = false;
    };
  }, [pathsKey]);

  function patch(itemId: string, change: Partial<CardDraft>) {
    setDrafts((cur) => cur?.map((d) => (d.itemId === itemId ? { ...d, ...change } : d)) ?? cur);
  }

  const blocker = drafts ? pushBlocker(boardId, listId, drafts) : "Loading…";
  const included = drafts?.filter((d) => d.include) ?? [];
  const repush = single && drafts?.[0] && pushed.has(drafts[0].threadId);

  async function push() {
    if (!token || !drafts || !meta || !boardId || !listId || blocker) return;
    setBusy(true);
    setPushError(null);
    try {
      const list = meta.lists.find((l) => l.id === listId);
      const out = await pushToTrello(
        token,
        { boardId, boardName: meta.name, listId, listName: list?.name ?? "" },
        labelIds,
        memberIds,
        toPushCards(drafts),
      );
      saveTrelloTarget({ boardId, listId });
      setResults(out);
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Push failed");
    } finally {
      setBusy(false);
    }
  }

  const nameOf = (itemId: string) => drafts?.find((d) => d.itemId === itemId)?.name ?? "Task";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div
        role="dialog"
        aria-label="Push to Trello"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Push to Trello</h2>
            <p className="text-[11px] text-muted">
              {single ? "One card" : `${itemIds.length} tasks · one card each`} · nothing is sent
              until you push
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto h-9 w-9 shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </header>

        {results ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <p className="mb-2 text-sm">{describePushResults(results)}</p>
            <ul className="space-y-1">
              {results.map((r) => (
                <li
                  key={r.itemId}
                  className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2 text-sm"
                >
                  {r.ok ? (
                    <Check className="h-4 w-4 shrink-0 text-success" />
                  ) : (
                    <X className="h-4 w-4 shrink-0 text-danger" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{nameOf(r.itemId)}</span>
                  {r.ok && r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex shrink-0 items-center gap-1 text-xs text-accent"
                    >
                      Open card <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <span className="shrink-0 text-xs text-danger">{r.error}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            {!online && (
              <p className="rounded-lg bg-warn/15 px-3 py-2 text-xs text-warn">
                Pushing to Trello needs a connection.
              </p>
            )}
            {loadError && (
              <p className="rounded-lg bg-danger/15 px-3 py-2 text-xs text-danger">{loadError}</p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={fieldLabel}>Board</span>
                <select
                  value={boardId ?? ""}
                  onChange={(e) => setBoardId(e.target.value || null)}
                  disabled={!boards}
                  aria-label="Board"
                  className={selectClass}
                >
                  <option value="">{boards ? "Choose a board…" : "Loading boards…"}</option>
                  {boards &&
                    groupBoardsByWorkspace(boards).map((g) => (
                      <optgroup key={g.workspace} label={g.workspace}>
                        {g.boards.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className={fieldLabel}>List</span>
                <select
                  value={listId ?? ""}
                  onChange={(e) => setListId(e.target.value || null)}
                  disabled={!meta || meta.lists.length === 0}
                  aria-label="List"
                  className={selectClass}
                >
                  {!meta && <option value="">{metaLoading ? "Loading…" : "Pick a board first"}</option>}
                  {meta?.lists.length === 0 && <option value="">This board has no lists</option>}
                  {meta?.lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {meta && meta.labels.length > 0 && (
              <div>
                <span className={fieldLabel}>Labels</span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.labels.map((l) => {
                    const on = labelIds.includes(l.id);
                    return (
                      <button
                        key={l.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setLabelIds((cur) => toggleId(cur, l.id))}
                        className={cn(
                          "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs",
                          on ? "border-accent bg-accent/15 text-text" : "border-line text-muted",
                        )}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: labelSwatch(l.color) }}
                        />
                        {labelText(l)}
                        {on && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {meta && meta.members.length > 0 && (
              <div>
                <span className={fieldLabel}>Tag people</span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.members.map((m) => {
                    const on = memberIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setMemberIds((cur) => toggleId(cur, m.id))}
                        className={cn(
                          "flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs",
                          on ? "border-accent bg-accent/15 text-text" : "border-line text-muted",
                        )}
                      >
                        {m.fullName || m.username}
                        <span className="text-muted">@{m.username}</span>
                        {on && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Tagged people are added to the card, which notifies them on Trello.
                </p>
              </div>
            )}

            <div>
              <span className={fieldLabel}>{single ? "Card" : "Cards"}</span>
              {!drafts ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted" />
              ) : (
                <ul className="space-y-2">
                  {drafts.map((d) => (
                    <DraftRow
                      key={d.itemId}
                      draft={d}
                      single={single}
                      open={expanded === d.itemId}
                      pushedTo={pushed.get(d.threadId)}
                      urls={urls}
                      onToggleOpen={() => setExpanded((cur) => (cur === d.itemId ? null : d.itemId))}
                      onChange={(change) => patch(d.itemId, change)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <footer className="border-t border-line px-4 py-3">
          {results ? (
            <Button onClick={onClose} className="h-11 w-full text-sm">
              Done
            </Button>
          ) : (
            <>
              {pushError && <p className="mb-2 text-xs text-danger">{pushError}</p>}
              {blocker && drafts && <p className="mb-2 text-[11px] text-muted">{blocker}</p>}
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={onClose} className="h-11 flex-1 text-sm">
                  Cancel
                </Button>
                <Button
                  onClick={() => void push()}
                  disabled={busy || !online || !!blocker}
                  className="h-11 flex-1 text-sm"
                >
                  {busy
                    ? "Pushing…"
                    : repush
                      ? "Push again"
                      : included.length > 1
                        ? `Push ${included.length} cards`
                        : "Push to Trello"}
                </Button>
              </div>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function DraftRow({
  draft,
  single,
  open,
  pushedTo,
  urls,
  onToggleOpen,
  onChange,
}: {
  draft: CardDraft;
  single: boolean;
  open: boolean;
  pushedTo: PushedCard | undefined;
  urls: Record<string, string>;
  onToggleOpen: () => void;
  onChange: (change: Partial<CardDraft>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Extra images go to storage under the to-do prefix (the server only attaches
  // tdl/ objects) and onto this card only — the task itself is left unchanged.
  async function addImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const paths = await uploadTdlImages(Array.from(files));
      onChange({ images: [...draft.images, ...paths.map((path) => ({ path, on: true }))] });
    } catch {
      setUploadError("Upload failed — check you're online and try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const imageCount = draft.images.filter((i) => i.on).length;

  return (
    <li className="rounded-xl border border-line">
      {!single && (
        <div className="flex items-center gap-2 px-2 py-1.5">
          <button
            type="button"
            onClick={() => onChange({ include: !draft.include })}
            aria-pressed={draft.include}
            aria-label={`${draft.include ? "Leave out" : "Include"} ${draft.name}`}
            className="flex h-9 w-9 shrink-0 items-center justify-center"
          >
            {draft.include ? (
              <SquareCheck className="h-5 w-5 text-accent" />
            ) : (
              <Square className="h-5 w-5 text-muted" />
            )}
          </button>
          <button
            type="button"
            onClick={onToggleOpen}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className={cn("min-w-0 flex-1 truncate text-sm", !draft.include && "text-muted")}>
              {draft.name || "Untitled"}
            </span>
            {imageCount > 0 && <span className="text-[11px] text-muted">{imageCount} img</span>}
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
          </button>
        </div>
      )}
      {pushedTo && (
        <p className={cn("px-3 text-[11px] text-warn", single ? "pt-3" : "pb-1.5")}>
          Already on Trello{pushedTo.board_name ? ` · ${pushedTo.board_name}` : ""}
          {pushedTo.list_name ? ` › ${pushedTo.list_name}` : ""} ·{" "}
          <a href={pushedTo.card_url} target="_blank" rel="noreferrer" className="underline">
            open card
          </a>
        </p>
      )}
      {open && (
        <div className={cn("space-y-3 p-3", !single && "border-t border-line")}>
          <label className="block">
            <span className={fieldLabel}>Name</span>
            <Input
              value={draft.name}
              onChange={(e) => onChange({ name: e.target.value })}
              aria-label="Card name"
              className="h-11 text-sm"
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>Description</span>
            <textarea
              value={draft.desc}
              onChange={(e) => onChange({ desc: e.target.value })}
              aria-label="Description"
              rows={4}
              className="w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-muted outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className={fieldLabel}>Due date</span>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={draft.due}
                onChange={(e) => onChange({ due: e.target.value })}
                aria-label="Due date"
                className="h-11 flex-1 text-sm"
              />
              {draft.due && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ due: "" })}
                  className="h-11 text-xs"
                >
                  Clear
                </Button>
              )}
            </div>
          </label>
          <div>
            <span className={fieldLabel}>Images</span>
            <div className="flex flex-wrap gap-2">
              {draft.images.map((img) => {
                const url = urls[img.path];
                return (
                  <button
                    key={img.path}
                    type="button"
                    aria-pressed={img.on}
                    aria-label={img.on ? "Leave image off the card" : "Attach image to the card"}
                    onClick={() =>
                      onChange({
                        images: draft.images.map((i) =>
                          i.path === img.path ? { ...i, on: !i.on } : i,
                        ),
                      })
                    }
                    className={cn(
                      "relative h-16 w-16 overflow-hidden rounded-lg border",
                      img.on ? "border-accent" : "border-line opacity-40",
                    )}
                  >
                    {url ? (
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="block h-full w-full animate-pulse bg-surface2" />
                    )}
                    {img.on && (
                      <span className="absolute right-0.5 top-0.5 rounded-full bg-accent p-0.5 text-bg">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Add images"
                className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-line text-muted hover:text-text disabled:opacity-50"
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void addImages(e.target.files)}
              />
            </div>
            {uploadError && <p className="mt-1 text-xs text-danger">{uploadError}</p>}
          </div>
        </div>
      )}
    </li>
  );
}
