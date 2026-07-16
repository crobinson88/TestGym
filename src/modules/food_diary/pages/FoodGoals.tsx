import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, Flame } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { syncEngine } from "@/lib/sync";
import type { BodySex } from "@/lib/database.types";
import { useFoodGoals } from "../hooks";
import { baselineBurn, cmToFtIn, ftInToCm, lbToKg, mifflinBmr } from "../compute";

// Base (non-exercise) activity multipliers. Logged gym cardio is added on top,
// so default to sedentary to avoid double-counting.
const ACTIVITY_LEVELS = [
  { value: 1.2, label: "Sedentary", hint: "desk job, little walking" },
  { value: 1.375, label: "Light", hint: "on your feet some" },
  { value: 1.55, label: "Moderate", hint: "active job / lots of walking" },
  { value: 1.725, label: "Very active", hint: "physical job" },
] as const;

export default function FoodGoals() {
  const navigate = useNavigate();
  const goals = useFoodGoals();

  const [calorieGoal, setCalorieGoal] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [sex, setSex] = useState<BodySex>("male");
  const [age, setAge] = useState("38");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weightLb, setWeightLb] = useState("197");
  const [activity, setActivity] = useState<number>(1.2);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (goals === undefined || hydrated) return;
    if (goals) {
      setCalorieGoal(String(goals.calorie_goal));
      setProteinGoal(String(goals.protein_goal));
      setSex(goals.sex);
      setAge(goals.age != null ? String(goals.age) : "");
      setWeightLb(goals.weight_lb != null ? String(goals.weight_lb) : "");
      setActivity(goals.activity_factor);
      if (goals.height_cm != null) {
        const { feet, inches } = cmToFtIn(goals.height_cm);
        setHeightFt(String(feet));
        setHeightIn(String(inches));
      }
    }
    setHydrated(true);
  }, [goals, hydrated]);

  const calorieNum = Number(calorieGoal);
  const proteinNum = Number(proteinGoal);
  const ageNum = age.trim() ? Number(age) : null;
  const weightNum = weightLb.trim() ? Number(weightLb) : null;
  const ftNum = heightFt.trim() ? Number(heightFt) : null;
  const inNum = heightIn.trim() ? Number(heightIn) : 0;
  const heightCm =
    ftNum != null && Number.isFinite(ftNum) ? ftInToCm(ftNum, Number.isFinite(inNum) ? inNum : 0) : null;
  const weightKg = weightNum != null && weightNum > 0 ? lbToKg(weightNum) : null;

  const bmr = mifflinBmr({ sex, age: ageNum, heightCm, weightKg });
  const baseline = baselineBurn(bmr, activity);

  const goalsValid =
    calorieGoal.trim().length > 0 &&
    proteinGoal.trim().length > 0 &&
    Number.isFinite(calorieNum) &&
    calorieNum >= 0 &&
    Number.isFinite(proteinNum) &&
    proteinNum >= 0;

  async function save() {
    if (!goalsValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await syncEngine.mutations.setFoodGoals({
        calorie_goal: calorieNum,
        protein_goal: proteinNum,
        sex,
        age: ageNum,
        height_cm: heightCm,
        weight_lb: weightNum,
        activity_factor: activity,
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
        <span className="font-medium text-text">Goals &amp; balance</span>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Daily goals</h2>
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
        </section>

        <section className="space-y-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Body profile</h2>
          <p className="-mt-2 text-sm text-muted">
            Used to estimate your baseline burn. Logged gym cardio is added on top.
          </p>

          <Field label="Sex">
            <div className="grid grid-cols-2 gap-2">
              {(["male", "female"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSex(s)}
                  className={cn(
                    "h-12 rounded-xl border text-base capitalize transition",
                    sex === s
                      ? "border-accent bg-accent/15 text-text"
                      : "border-line text-muted hover:bg-surface2",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Age">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="38"
              />
            </Field>
            <Field label="Weight (lb)">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                value={weightLb}
                onChange={(e) => setWeightLb(e.target.value)}
                placeholder="197"
              />
            </Field>
          </div>

          <Field label="Height">
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                  placeholder="5"
                  aria-label="Height feet"
                />
                <span className="text-sm text-muted">ft</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={11}
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  placeholder="10"
                  aria-label="Height inches"
                />
                <span className="text-sm text-muted">in</span>
              </div>
            </div>
          </Field>

          <Field label="Base activity">
            <div className="grid grid-cols-2 gap-2">
              {ACTIVITY_LEVELS.map((lvl) => (
                <button
                  key={lvl.value}
                  type="button"
                  onClick={() => setActivity(lvl.value)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left transition",
                    activity === lvl.value
                      ? "border-accent bg-accent/15"
                      : "border-line hover:bg-surface2",
                  )}
                >
                  <div className="text-sm font-medium text-text">{lvl.label}</div>
                  <div className="text-xs text-muted">{lvl.hint}</div>
                </button>
              ))}
            </div>
          </Field>

          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <Flame className="h-6 w-6 shrink-0 text-accent" />
            <div>
              <div className="text-xs uppercase tracking-wide text-muted">Baseline daily burn</div>
              {baseline != null ? (
                <div className="text-xl font-bold tabular-nums text-text">
                  {baseline} <span className="text-sm font-normal text-muted">kcal/day</span>
                </div>
              ) : (
                <div className="text-sm text-muted">Add age, height and weight to estimate.</div>
              )}
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}

        <div className="pt-1">
          <Button onClick={save} size="lg" className="w-full" disabled={!goalsValid || saving}>
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Check className="mr-2 h-5 w-5" /> Save
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
