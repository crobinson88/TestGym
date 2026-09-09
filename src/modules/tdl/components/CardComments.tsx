import { useEffect, useRef, useState } from "react";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { addComment, deleteComment, updateComment, useComments } from "../comments";

// When a comment was left, in the shorthand a thread reads best in.
function timeAgo(iso: string, now = Date.now()): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

// The comment thread on a card. Threads hang off the roll-forward chain (see
// comments.ts), so what you write today is still here on tomorrow's card.
export function CardComments({
  threadId,
  itemId,
  autoFocus = false,
}: {
  threadId: string | undefined;
  itemId: string;
  // Opened straight from the card's comment button: scroll the thread into view
  // and put the cursor in the box so a reply is one tap away.
  autoFocus?: boolean;
}) {
  const comments = useComments(threadId);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!autoFocus) return;
    const el = draftRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus();
  }, [autoFocus]);

  async function submit() {
    if (!threadId || !draft.trim()) return;
    setBusy(true);
    try {
      await addComment(threadId, itemId, draft);
      setDraft("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <MessageSquare className="h-3.5 w-3.5" />
        Comments
        {(comments?.length ?? 0) > 0 && (
          <span className="tabular-nums">{comments!.length}</span>
        )}
      </h4>

      {comments && comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => {
            const editing = editingId === c.id;
            return (
              <li key={c.id} className="rounded-xl border border-line bg-surface p-2.5">
                {editing ? (
                  <div className="space-y-2">
                    <textarea
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      aria-label="Edit comment"
                      className="w-full resize-y rounded-lg border border-line bg-surface2 px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          void updateComment(c.id, editDraft);
                          setEditingId(null);
                        }}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                      <span>{timeAgo(c.created_at)}</span>
                      {c.updated_at > c.created_at && <span>· edited</span>}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditDraft(c.body);
                        }}
                        className="ml-auto inline-flex items-center gap-1 hover:text-text"
                        aria-label="Edit comment"
                      >
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteComment(c.id)}
                        className="inline-flex items-center gap-1 hover:text-danger"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-2">
        <textarea
          ref={draftRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a comment…"
          aria-label="New comment"
          rows={2}
          onKeyDown={(e) => {
            // ⌘/Ctrl+Enter posts, so a plain Enter can still make a paragraph.
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          className={cn(
            "w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent",
          )}
        />
        <Button size="sm" onClick={() => void submit()} disabled={!draft.trim() || busy}>
          Comment
        </Button>
      </div>
    </section>
  );
}
