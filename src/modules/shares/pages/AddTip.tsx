import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { todayIsoDate } from "@/lib/utils";
import { useTip } from "../hooks";

export default function AddTip() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const existing = useTip(id);
  const editing = !!id;

  const [ticker, setTicker] = useState("");
  const [tippedBy, setTippedBy] = useState("");
  const [note, setNote] = useState("");
  const [receivedAt, setReceivedAt] = useState(todayIsoDate());
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate fields once the row loads when editing.
  useEffect(() => {
    if (editing && existing && !hydrated) {
      setTicker(existing.ticker);
      setTippedBy(existing.tipped_by);
      setNote(existing.note ?? "");
      setReceivedAt(existing.received_at);
      setHydrated(true);
    }
  }, [editing, existing, hydrated]);

  const valid = ticker.trim().length > 0 && tippedBy.trim().length > 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editing && id) {
        await syncEngine.mutations.updateTip(id, {
          ticker: ticker.trim(),
          tipped_by: tippedBy.trim(),
          note: note.trim() || null,
          received_at: receivedAt,
        });
      } else {
        await syncEngine.mutations.addTip({
          ticker: ticker.trim(),
          tipped_by: tippedBy.trim(),
          note: note.trim() || null,
          received_at: receivedAt,
        });
      }
      navigate("/shares/tips");
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
      await syncEngine.mutations.deleteTip(id);
      navigate("/shares/tips");
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={() => navigate("/shares/tips")}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="font-medium text-text">{editing ? "Edit tip" : "Add tip"}</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <Field label="Ticker">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="AAPL"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>

        <Field label="Tipped by">
          <Input
            value={tippedBy}
            onChange={(e) => setTippedBy(e.target.value)}
            placeholder="Who sent it?"
          />
        </Field>

        <Field label="Received">
          <Input type="date" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} />
        </Field>

        <Field label="Note">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why they like it, what to look at…"
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
                <Check className="mr-2 h-5 w-5" /> {editing ? "Save changes" : "Add tip"}
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
