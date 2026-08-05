import { useNavigate } from "react-router-dom";
import { Flame, Pencil, Plus, Target, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayIsoDate, relativeDay } from "@/lib/utils";
import type { FoodEntryRow } from "@/lib/database.types";
import { useCardioSessionsForDate, useSetsForDate } from "@/lib/hooks";
import { liftingMetMinutes } from "@/lib/met";
import { useFoodEntries, useFoodGoals } from "../hooks";
import {
  adjustedCalorieGoal,
  baselineBurn,
  cardioSessionKcal,
  dailyBalance,
  exerciseKcalFromMetMinutes,
  goalProgress,
  groupByDate,
  lbToKg,
  mifflinBmr,
  sumEntries,
  type GoalProgress,
} from "../compute";

export default function FoodDiaryHome() {
  const entries = useFoodEntries();
  const goals = useFoodGoals();
  const today = todayIsoDate();
  const todayCardio = useCardioSessionsForDate(today);
  const todaySets = useSetsForDate(today);
  const navigate = useNavigate();

  if (entries === undefined || goals === undefined) {
    return <div className="p-6 text-center text-muted">Loading…</div>;
  }

  const groups = groupByDate(entries);
  const todayTotals = sumEntries(entries.filter((e) => e.entry_date === today));
  const calorieGoal = goals?.calorie_goal ?? 0;
  const proteinGoal = goals?.protein_goal ?? 0;
  const past = groups.filter((g) => g.date !== today);
  const todayEntries = groups.find((g) => g.date === today)?.entries ?? [];

  const weightKg = goals?.weight_lb != null ? lbToKg(goals.weight_lb) : null;
  const bmr = mifflinBmr({
    sex: goals?.sex ?? "male",
    age: goals?.age ?? null,
    heightCm: goals?.height_cm ?? null,
    weightKg,
  });
  const baseline = baselineBurn(bmr, goals?.activity_factor ?? 1.2);
  // Cardio burn: a session's directly-logged calories win, else the MET
  // estimate (per session, so logged + estimated sessions can mix).
  const cardioKcal = (todayCardio ?? []).reduce(
    (sum, c) => sum + cardioSessionKcal(c, weightKg),
    0,
  );
  const liftingKcal = exerciseKcalFromMetMinutes(
    liftingMetMinutes((todaySets ?? []).length),
    weightKg,
  );
  const exercise = cardioKcal + liftingKcal;
  const balance = dailyBalance({ intake: todayTotals.calories, baseline, exercise });
  const calorieTarget = adjustedCalorieGoal(calorieGoal, exercise);

  return (
    <div className="space-y-6 p-4 pb-24">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Food</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/food/goals")}
            aria-label="Edit goals"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-text transition hover:bg-surface2 active:scale-[0.98]"
          >
            <Target className="h-5 w-5" />
          </button>
          <button
            onClick={() => navigate("/food/add")}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-bg transition active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" /> Add
          </button>
        </div>
      </header>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wider text-muted">Today</h2>
          {!goals && (
            <button
              onClick={() => navigate("/food/goals")}
              className="text-xs font-medium text-accent"
            >
              Set goals
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Macro
            label="Calories"
            unit="kcal"
            progress={goalProgress(todayTotals.calories, calorieTarget)}
            boost={calorieGoal > 0 ? exercise : 0}
          />
          <Macro
            label="Protein"
            unit="g"
            progress={goalProgress(todayTotals.protein, proteinGoal)}
          />
        </div>
      </section>

      <BalanceCard
        intake={balance.intake}
        baseline={balance.baseline}
        exercise={balance.exercise}
        burn={balance.burn}
        net={balance.net}
        onSetup={() => navigate("/food/goals")}
      />

      {entries.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          <UtensilsCrossed className="mx-auto mb-3 h-8 w-8 text-accent" />
          Nothing logged yet. Add what you ate to track calories and protein.
        </div>
      )}

      {todayEntries.length > 0 && (
        <Section title="Today's food">
          {todayEntries.map((e) => (
            <EntryRow key={e.id} entry={e} onEdit={() => navigate(`/food/add/${e.id}`)} />
          ))}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Earlier">
          {past.map((g) => (
            <li key={g.date}>
              <button
                onClick={() => navigate("/food/add")}
                className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface p-3 text-left"
              >
                <div>
                  <div className="font-semibold capitalize text-text">{relativeDay(g.date)}</div>
                  <div className="text-xs text-muted">
                    {g.totals.count} {g.totals.count === 1 ? "item" : "items"}
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-semibold text-text">{g.totals.calories} kcal</div>
                  <div className="text-muted">{formatProtein(g.totals.protein)} g protein</div>
                </div>
              </button>
            </li>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">{title}</h2>
      <ul className="space-y-3">{children}</ul>
    </section>
  );
}

function BalanceCard({
  intake,
  baseline,
  exercise,
  burn,
  net,
  onSetup,
}: {
  intake: number;
  baseline: number | null;
  exercise: number;
  burn: number | null;
  net: number | null;
  onSetup: () => void;
}) {
  if (baseline == null || burn == null || net == null) {
    return (
      <button
        onClick={onSetup}
        className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line bg-surface p-4 text-left"
      >
        <Flame className="h-6 w-6 shrink-0 text-accent" />
        <div>
          <div className="font-semibold text-text">Set up daily balance</div>
          <div className="text-sm text-muted">
            Add your body profile to track calories in vs. out.
          </div>
        </div>
      </button>
    );
  }

  const deficit = net >= 0;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted">
        <Flame className="h-3.5 w-3.5 text-accent" /> Balance today
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div
            className={cn(
              "text-3xl font-bold tabular-nums",
              deficit ? "text-success" : "text-warn",
            )}
          >
            {deficit ? "−" : "+"}
            {Math.abs(net)}
          </div>
          <div className="text-sm text-muted">
            kcal {deficit ? "deficit" : "surplus"}
          </div>
        </div>
        <div className="text-right text-sm text-muted">
          <div>
            <span className="tabular-nums text-text">{burn}</span> burned
          </div>
          <div>
            <span className="tabular-nums text-text">{intake}</span> eaten
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-4 border-t border-line pt-3 text-xs text-muted">
        <span>
          Baseline <span className="tabular-nums text-text">{baseline}</span>
        </span>
        <span>
          Exercise <span className="tabular-nums text-text">+{exercise}</span>
        </span>
      </div>
    </section>
  );
}

function Macro({
  label,
  unit,
  progress,
  boost = 0,
}: {
  label: string;
  unit: string;
  progress: GoalProgress;
  // Portion of the goal earned back from logged exercise (cardio + sets), shown
  // as a breakdown under the target. 0 when there's no exercise or no goal.
  boost?: number;
}) {
  const hasGoal = progress.goal > 0;
  const value = label === "Protein" ? formatProtein(progress.value) : progress.value;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">{label}</span>
        {hasGoal && (
          <span className={cn("text-xs", progress.over ? "text-warn" : "text-muted")}>
            {progress.over
              ? `+${label === "Protein" ? formatProtein(-progress.remaining) : -progress.remaining}`
              : `${label === "Protein" ? formatProtein(progress.remaining) : progress.remaining} left`}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-text">{value}</span>
        <span className="text-sm text-muted">
          {hasGoal ? `/ ${progress.goal} ${unit}` : unit}
        </span>
      </div>
      {hasGoal && boost > 0 && (
        <div className="mt-0.5 text-xs text-muted">
          incl. <span className="tabular-nums text-text">+{boost}</span> from exercise
        </div>
      )}
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface2">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            progress.over ? "bg-warn" : "bg-accent",
          )}
          style={{ width: `${hasGoal ? progress.pct * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

function EntryRow({ entry, onEdit }: { entry: FoodEntryRow; onEdit: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="min-w-0 flex-1">
        <div className="break-words font-semibold text-text">{entry.name}</div>
        <div className="mt-0.5 text-sm text-muted">
          {entry.calories} kcal · {formatProtein(entry.protein)} g protein
        </div>
      </div>
      <button
        onClick={onEdit}
        aria-label="Edit"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-text"
      >
        <Pencil className="h-4 w-4" />
      </button>
    </li>
  );
}

// Protein is stored as numeric — trim a trailing ".0" so whole grams read cleanly.
function formatProtein(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
