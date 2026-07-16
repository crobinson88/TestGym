import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Check, ChevronLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { todayIsoDate } from "@/lib/utils";
import { syncEngine } from "@/lib/sync";
import { useFoodEntry } from "../hooks";

export default function AddFoodEntry() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const existing = useFoodEntry(id);
  const editing = !!id;

  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing && existing && !hydrated) {
      setName(existing.name);
      setCalories(String(existing.calories));
      setProtein(String(existing.protein));
      setDate(existing.entry_date);
      setHydrated(true);
    }
  }, [editing, existing, hydrated]);

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
