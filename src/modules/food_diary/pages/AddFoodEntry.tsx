import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Camera, Check, ChevronLeft, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { todayIsoDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";
import { useFoodEntry } from "../hooks";
import { estimateFoodPhoto } from "../photo";

export default function AddFoodEntry() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const existing = useFoodEntry(id);
  const editing = !!id;
  const { session } = useAuth();

  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [estimating, setEstimating] = useState(false);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && existing && !hydrated) {
      setName(existing.name);
      setCalories(String(existing.calories));
      setProtein(String(existing.protein));
      setDate(existing.entry_date);
      setHydrated(true);
    }
  }, [editing, existing, hydrated]);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !session) return;
    setEstimating(true);
    setError(null);
    setEstimateNote(null);
    try {
      // Pass the typed name (if any) as a hint to sharpen the estimate.
      const est = await estimateFoodPhoto(file, session.access_token, name.trim() || undefined);
      if (est.error) {
        setError(est.error);
        return;
      }
      if (est.name && !name.trim()) setName(est.name);
      setCalories(String(est.calories));
      setProtein(String(est.protein));
      const pct = Math.round(est.confidence * 100);
      setEstimateNote(
        `AI estimate${Number.isFinite(pct) ? ` · ${pct}% confidence` : ""} — check and adjust before saving.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Estimate failed");
    } finally {
      setEstimating(false);
    }
  }

  const caloriesNum = Number(calories);
  const proteinNum = Number(protein);
  const valid =
    name.trim().length > 0 &&
    calories.trim().length > 0 &&
    protein.trim().length > 0 &&
    Number.isFinite(caloriesNum) &&
    caloriesNum >= 0 &&
    Number.isFinite(proteinNum) &&
    proteinNum >= 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editing && id) {
        await syncEngine.mutations.updateFoodEntry(id, {
          name: name.trim(),
          calories: caloriesNum,
          protein: proteinNum,
          entry_date: date,
        });
      } else {
        await syncEngine.mutations.addFoodEntry({
          name: name.trim(),
          calories: caloriesNum,
          protein: proteinNum,
          entry_date: date,
        });
      }
      navigate("/food");
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
      await syncEngine.mutations.deleteFoodEntry(id);
      navigate("/food");
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={() => navigate("/food")}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="font-medium text-text">{editing ? "Edit food" : "Log food"}</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onPhoto}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPhoto}
        />

        {!editing && (
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Estimate with a photo
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => cameraRef.current?.click()}
                disabled={estimating || !session}
              >
                {estimating ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-5 w-5" />
                )}
                {estimating ? "Reading…" : "Photo"}
              </Button>
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => libraryRef.current?.click()}
                disabled={estimating || !session}
              >
                <ImagePlus className="mr-2 h-5 w-5" /> Library
              </Button>
            </div>
            {estimateNote && <p className="mt-2 text-xs text-accent">{estimateNote}</p>}
          </div>
        )}

        <Field label="Food">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What did you eat?"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Calories (kcal)">
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Protein (g)">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>

        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
                <Check className="mr-2 h-5 w-5" /> {editing ? "Save changes" : "Log it"}
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
