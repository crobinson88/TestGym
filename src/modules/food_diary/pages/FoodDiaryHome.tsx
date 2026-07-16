import { useNavigate } from "react-router-dom";
import { Pencil, Plus, Target, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";
import { todayIsoDate, relativeDay } from "@/lib/utils";
import type { FoodEntryRow } from "@/lib/database.types";
import { useFoodEntries, useFoodGoals } from "../hooks";
import { goalProgress, groupByDate, sumEntries, type GoalProgress } from "../compute";

export default function FoodDiaryHome() {
  const entries = useFoodEntries();
  const goals = useFoodGoals();
  const navigate = useNavigate();

  if (entries === undefined || goals === undefined) {
    return <div className="p-6 text-center text-muted">Loading…</div>;
  }

  const today = todayIsoDate();
  const groups = groupByDate(entries);
  const todayTotals = sumEntries(entries.filter((e) => e.entry_date === today));
  const calorieGoal = goals?.calorie_goal ?? 0;
  const proteinGoal = goals?.protein_goal ?? 0;
  const past = groups.filter((g) => g.date !== today);
  const todayEntries = groups.find((g) => g.date === today)?.entries ?? [];

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
            progress={goalProgress(todayTotals.calories, calorieGoal)}
          />
          <Macro
            label="Protein"
            unit="g"
            progress={goalProgress(todayTotals.protein, proteinGoal)}
          />
        </div>
      </section>

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

function Macro({
  label,
  unit,
  progress,
}: {
  label: string;
  unit: string;
  progress: GoalProgress;
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
