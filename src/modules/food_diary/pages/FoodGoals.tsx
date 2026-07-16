import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { useFoodGoals } from "../hooks";

export default function FoodGoals() {
  const navigate = useNavigate();
  const goals = useFoodGoals();

  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (goals === undefined || hydrated) return;
    if (goals) {
      setCalorieGoal(String(goals.calorie_goal));
      setProteinGoal(String(goals.protein_goal));
    }
    setHydrated(true);
  }, [goals, hydrated]);

  const calorieNum = Number(calorieGoal);
  const proteinNum = Number(proteinGoal);
  const valid =
    calorieGoal.trim().length > 0 &&
    proteinGoal.trim().length > 0 &&
    Number.isFinite(calorieNum) &&
    calorieNum >= 0 &&
    Number.isFinite(proteinNum) &&
    proteinNum >= 0;

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await syncEngine.mutations.setFoodGoals({
        calorie_goal: calorieNum,
        protein_goal: proteinNum,
      });
      navigate("/food");
    } catch (err) {
      setError((err as Error).message);
    } finally {
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
        <span className="font-medium text-text">Daily goals</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <p className="text-sm text-muted">
          Your daily targets. Today's totals track against these on the Food screen.
        </p>

        <Field label="Calorie goal (kcal)">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={calorieGoal}
            onChange={(e) => setCalorieGoal(e.target.value)}
            placeholder="e.g. 2200"
          />
        </Field>

        <Field label="Protein goal (g)">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            value={proteinGoal}
            onChange={(e) => setProteinGoal(e.target.value)}
            placeholder="e.g. 150"
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}

        <div className="pt-2">
          <Button onClick={save} size="lg" className="w-full" disabled={!valid || saving}>
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Check className="mr-2 h-5 w-5" /> Save goals
              </>
            )}
          </Button>
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
