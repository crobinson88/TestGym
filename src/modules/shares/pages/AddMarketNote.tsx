import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn, todayIsoDate } from "@/lib/utils";
import { syncEngine } from "@/lib/sync";
import { useMarketNote } from "../hooks";
import { MARKET_INDICES } from "../markets";
import type { MarketIndexKey } from "../markets";

export default function AddMarketNote() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const existing = useMarketNote(id);
  const editing = !!id;

  const [indices, setIndices] = useState<MarketIndexKey[]>([]);
  const [body, setBody] = useState("");
  const [notedAt, setNotedAt] = useState(todayIsoDate());
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate fields once the row loads when editing.
  useEffect(() => {
    if (editing && existing && !hydrated) {
      setIndices(existing.indices);
      setBody(existing.body);
      setNotedAt(existing.noted_at);
      setHydrated(true);
    }
  }, [editing, existing, hydrated]);

  function toggleIndex(key: MarketIndexKey) {
    setIndices((cur) =>
      cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key],
    );
  }

  const valid = indices.length > 0 && body.trim().length > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editing && id) {
        await syncEngine.mutations.updateMarketNote(id, {
          indices,
          body: body.trim(),
          noted_at: notedAt,
        });
      } else {
        await syncEngine.mutations.addMarketNote({
          indices,
          body: body.trim(),
          noted_at: notedAt,
        });
      }
      navigate("/shares/markets");
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
      await syncEngine.mutations.deleteMarketNote(id);
      navigate("/shares/markets");
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={() => navigate("/shares/markets")}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="font-medium text-text">
          {editing ? "Edit note" : "Add market note"}
        </span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-wide text-muted">Indices</span>
          <div className="flex flex-wrap gap-2">
            {MARKET_INDICES.map((idx) => {
              const on = indices.includes(idx.key);
              return (
                <button
                  key={idx.key}
                  type="button"
                  onClick={() => toggleIndex(idx.key)}
                  aria-pressed={on}
                  className={cn(
                    "h-11 rounded-xl border px-4 text-sm font-medium transition active:scale-95",
                    on
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-surface text-muted hover:text-text",
                  )}
                >
                  {idx.label}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Date">
          <Input type="date" value={notedAt} onChange={(e) => setNotedAt(e.target.value)} />
        </Field>

        <Field label="Note">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What you're seeing in the markets…"
            rows={6}
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
                <Check className="mr-2 h-5 w-5" /> {editing ? "Save changes" : "Add note"}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
