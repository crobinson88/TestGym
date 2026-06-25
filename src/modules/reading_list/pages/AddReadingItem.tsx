import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";
import { useReadingItem } from "../hooks";
import { fetchUrlTitle } from "../title";

export default function AddReadingItem() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const existing = useReadingItem(id);
  const editing = !!id;
  const { session } = useAuth();
  const token = session?.access_token;

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingTitle, setFetchingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetched = useRef<string | null>(null);

  // Populate fields once the row loads when editing.
  useEffect(() => {
    if (editing && existing && !hydrated) {
      setUrl(existing.url);
      setTitle(existing.title);
      setDescription(existing.description ?? "");
      setHydrated(true);
    }
  }, [editing, existing, hydrated]);

  // Autopopulate the title from the pasted URL. Debounced; only fills an empty
  // title so it never clobbers what the user typed, and skips while editing an
  // existing row (which already has a title).
  useEffect(() => {
    const trimmed = url.trim();
    if (!token || !trimmed || title.trim()) return;
    let valid = false;
    try {
      const u = new URL(trimmed);
      valid = u.protocol === "http:" || u.protocol === "https:";
    } catch {
      valid = false;
    }
    if (!valid || lastFetched.current === trimmed) return;

    const handle = setTimeout(async () => {
      lastFetched.current = trimmed;
      setFetchingTitle(true);
      try {
        const fetched = await fetchUrlTitle(trimmed, token);
        if (fetched) setTitle((cur) => (cur.trim() ? cur : fetched));
      } catch {
        // Best-effort; leave the field for manual entry.
      } finally {
        setFetchingTitle(false);
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [url, title, token]);

  const valid = url.trim().length > 0 && title.trim().length > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editing && id) {
        await syncEngine.mutations.updateReadingItem(id, {
          url: url.trim(),
          title: title.trim(),
          description: description.trim() || null,
        });
      } else {
        await syncEngine.mutations.addReadingItem({
          url: url.trim(),
          title: title.trim(),
          description: description.trim() || null,
        });
      }
      navigate("/reading");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id || saving) return;
    setSaving(true);
    try {
      await syncEngine.mutations.deleteReadingItem(id);
      navigate("/reading");
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={() => navigate("/reading")}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="font-medium text-text">{editing ? "Edit" : "Save to read"}</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <Field label="URL">
          <Input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>

        <Field
          label="Title"
          hint={
            fetchingTitle ? (
              <span className="flex items-center gap-1 text-muted">
                <Loader2 className="h-3 w-3 animate-spin" /> Fetching…
              </span>
            ) : null
          }
        >
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is it?"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Why you saved it, what to look for…"
            rows={4}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-text placeholder:text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}

        <div className="space-y-3 pt-2">
          <Button onClick={save} size="lg" className="w-full" disabled={!valid || saving}>
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Check className="mr-2 h-5 w-5" /> {editing ? "Save changes" : "Save"}
              </>
            )}
          </Button>
          {editing && (
            <Button
              variant="ghost"
              size="lg"
              className="w-full text-warn"
              onClick={remove}
              disabled={saving}
            >
              <Trash2 className="mr-2 h-5 w-5" /> Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center justify-between text-xs uppercase tracking-wide text-muted">
        {label}
        {hint}
      </span>
      {children}
    </label>
  );
}
