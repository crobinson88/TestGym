import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { syncEngine } from "@/lib/sync";
import type { LocalFoodGoal } from "@/lib/db";
import { cn } from "@/lib/utils";
import { addDays, prettyDate, relativeDay, todayIsoDate } from "@/lib/utils";
import type { FoodEntryRow } from "@/lib/database.types";
import { useCardioSessionsForDate, useSetsForDate } from "@/lib/hooks";
import { liftingMetMinutes } from "@/lib/met";
import { useFoodEntries, useFoodGoals } from "../hooks";
import {
  adjustedCalorieGoal,
  baselineBurn,
  cardioSessionKcal,
  coverageByEntry,
  dailyBalance,
  effectiveBaseline,
  exerciseKcalFromMetMinutes,
  foodDayPath,
  goalProgress,
  groupByDate,
  lbToKg,
  mifflinBmr,
  parseDayParam,
  sumEntries,
  type GoalProgress,
} from "../compute";

export default function FoodDiaryHome() {
  const entries = useFoodEntries();
  const goals = useFoodGoals();
  const today = todayIsoDate();
  const [params, setParams] = useSearchParams();
  const day = parseDayParam(params.get("date"), today);
  const isToday = day === today;
  const dayCardio = useCardioSessionsForDate(day);
  const daySets = useSetsForDate(day);
  const navigate = useNavigate();

  function goToDay(next: string) {
    const target = parseDayParam(next, today);
    setParams(target === today ? {} : { date: target }, { replace: true });
  }

  if (entries === undefined || goals === undefined) {
    return <div className="p-6 text-center text-muted">Loading…</div>;
  }

  const groups = groupByDate(entries);
  const dayTotals = sumEntries(entries.filter((e) => e.entry_date === day));
  const calorieGoal = goals?.calorie_goal ?? 0;
  const proteinGoal = goals?.protein_goal ?? 0;
  const otherDays = groups.filter((g) => g.date !== day);
  const dayEntries = groups.find((g) => g.date === day)?.entries ?? [];
  const dayName = isToday ? "Today" : capitalise(relativeDay(day, today));

  const weightKg = goals?.weight_lb != null ? lbToKg(goals.weight_lb) : null;
  const bmr = mifflinBmr({
    sex: goals?.sex ?? "male",
    age: goals?.age ?? null,
    heightCm: goals?.height_cm ?? null,
    weightKg,
  });
  const estimate = baselineBurn(bmr, goals?.activity_factor ?? 1.2);
  const baseline = effectiveBaseline(goals?.baseline_kcal, estimate);
  // Cardio burn: a session's directly-logged calories win, else the MET
  // estimate (per session, so logged + estimated sessions can mix).
  const cardioKcal = (dayCardio ?? []).reduce(
    (sum, c) => sum + cardioSessionKcal(c, weightKg),
    0,
  );
  const liftingKcal = exerciseKcalFromMetMinutes(
    liftingMetMinutes((daySets ?? []).length),
    weightKg,
  );
  const exercise = cardioKcal + liftingKcal;
  const balance = dailyBalance({ intake: dayTotals.calories, baseline, exercise });
  const calorieTarget = adjustedCalorieGoal(calorieGoal, exercise);
  // Per-item calorie coverage against the day's energy burn: how much of each
  // food falls within what the body burns that day. Only when the burn is known.
  const coverage =
    balance.burn != null && balance.burn > 0
      ? coverageByEntry(dayEntries, balance.burn)
      : null;

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
            onClick={() => navigate(foodDayPath(day, today, "/food/add"))}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-bg transition active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" /> Add
          </button>
        </div>
      </header>

      <DayNav day={day} today={today} onChange={goToDay} />

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-wider text-muted">{dayName}</h2>
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
            progress={goalProgress(dayTotals.calories, calorieTarget)}
            boost={calorieGoal > 0 ? exercise : 0}
          />
          <Macro
            label="Protein"
            unit="g"
            progress={goalProgress(dayTotals.protein, proteinGoal)}
          />
        </div>
      </section>

      <BalanceCard
        intake={balance.intake}
        baseline={balance.baseline}
        exercise={balance.exercise}
        burn={balance.burn}
        net={balance.net}
        title={isToday ? "Balance today" : `Balance · ${prettyDate(day)}`}
        goals={goals}
        estimate={estimate}
        onSetup={() => navigate("/food/goals")}
      />

      {entries.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          <UtensilsCrossed className="mx-auto mb-3 h-8 w-8 text-accent" />
          Nothing logged yet. Add what you ate to track calories and protein.
        </div>
      )}

      {entries.length > 0 && dayEntries.length === 0 && (
        <button
          onClick={() => navigate(foodDayPath(day, today, "/food/add"))}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface p-6 text-muted"
        >
          <Plus className="h-5 w-5 text-accent" />
          Nothing logged {isToday ? "today" : `on ${prettyDate(day)}`} — add food
        </button>
      )}

      {dayEntries.length > 0 && (
        <Section title={isToday ? "Today's food" : `Food · ${prettyDate(day)}`}>
          {dayEntries.map((e) => (
            <EntryRow
              key={e.id}
              entry={e}
              coverage={coverage?.get(e.id) ?? null}
              isToday={isToday}
              onEdit={() => navigate(`/food/add/${e.id}`)}
            />
          ))}
        </Section>
      )}

      {otherDays.length > 0 && (
        <Section title={isToday ? "Earlier" : "Other days"}>
          {otherDays.map((g) => (
            <li key={g.date}>
              <button
                onClick={() => {
                  goToDay(g.date);
                  window.scrollTo({ top: 0 });
                }}
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

function DayNav({
  day,
  today,
  onChange,
}: {
  day: string;
  today: string;
  onChange: (next: string) => void;
}) {
  const isToday = day === today;
  const relative = relativeDay(day, today);
  const pretty = prettyDate(day);
  const navBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line text-text transition hover:bg-surface2 active:scale-[0.98] disabled:opacity-30";
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(addDays(day, -1))} aria-label="Previous day" className={navBtn}>
        <ChevronLeft className="h-5 w-5" />
      </button>
      <label className="relative flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl border border-line bg-surface px-3 text-sm">
        <span className="truncate font-semibold text-text">
          {isToday ? "Today" : capitalise(relative)}
          {!isToday && relative !== pretty && (
            <span className="ml-1.5 font-normal text-muted">{pretty}</span>
          )}
        </span>
        <input
          type="date"
          value={day}
          max={today}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          aria-label="Pick a day"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <button
        onClick={() => onChange(addDays(day, 1))}
        disabled={isToday}
        aria-label="Next day"
        className={navBtn}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      {!isToday && (
        <button
          onClick={() => onChange(today)}
          className="h-11 shrink-0 rounded-xl border border-line px-3 text-sm font-medium text-accent transition hover:bg-surface2"
        >
          Today
        </button>
      )}
    </div>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  title,
  goals,
  estimate,
  onSetup,
}: {
  intake: number;
  baseline: number | null;
  exercise: number;
  burn: number | null;
  net: number | null;
  title: string;
  goals: LocalFoodGoal | null;
  estimate: number | null;
  onSetup: () => void;
}) {
  const [editing, setEditing] = useState(false);

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
        <Flame className="h-3.5 w-3.5 text-accent" /> {title}
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
      {editing && goals ? (
        <BaselineEditor goals={goals} baseline={baseline} estimate={estimate} onDone={() => setEditing(false)} />
      ) : (
        <div className="mt-3 flex items-center gap-4 border-t border-line pt-3 text-xs text-muted">
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={!goals}
            aria-label="Edit baseline burn"
            className="-my-2 flex min-h-[44px] items-center gap-1 rounded-lg pr-1 transition hover:text-text"
          >
            Baseline <span className="tabular-nums text-text">{baseline}</span>
            {goals?.baseline_kcal != null && <span className="text-[10px] text-muted">(set)</span>}
            <Pencil className="ml-0.5 h-3 w-3" />
          </button>
          <span>
            Exercise <span className="tabular-nums text-text">+{exercise}</span>
          </span>
        </div>
      )}
    </section>
  );
}

function BaselineEditor({
  goals,
  baseline,
  estimate,
  onDone,
}: {
  goals: LocalFoodGoal;
  baseline: number;
  estimate: number | null;
  onDone: () => void;
}) {
  const [value, setValue] = useState(String(baseline));
  const [saving, setSaving] = useState(false);
  const num = value.trim() ? Number(value) : null;
  const valid = num != null && Number.isFinite(num) && num >= 0;

  async function save(baselineKcal: number | null) {
    if (saving) return;
    setSaving(true);
    try {
      await syncEngine.mutations.setFoodGoals({
        calorie_goal: goals.calorie_goal,
        protein_goal: goals.protein_goal,
        baseline_kcal: baselineKcal,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="mt-3 space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void save(num);
      }}
    >
      <div className="text-xs uppercase tracking-wide text-muted">Baseline burn (kcal/day)</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Baseline burn"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface2 px-3 text-base tabular-nums text-text outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!valid || saving}
          aria-label="Save baseline"
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-bg transition disabled:opacity-50"
        >
          <Check className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onDone}
          aria-label="Cancel"
          className="flex h-11 w-11 items-center justify-center rounded-xl border border-line text-muted transition hover:bg-surface2"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {goals.baseline_kcal != null && estimate != null && (
        <button
          type="button"
          onClick={() => void save(null)}
          disabled={saving}
          className="flex min-h-[44px] items-center gap-1.5 text-xs text-accent"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Use estimate ({estimate})
        </button>
      )}
    </form>
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

function EntryRow({
  entry,
  coverage,
  isToday,
  onEdit,
}: {
  entry: FoodEntryRow;
  isToday: boolean;
  // Fraction [0, 1] of this food's calories covered by the day's burn, or null
  // when the burn is unknown (no body profile) — then no pie is shown.
  coverage: number | null;
  onEdit: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
      <div className="min-w-0 flex-1">
        <div className="break-words font-semibold text-text">{entry.name}</div>
        <div className="mt-0.5 text-sm text-muted">
          {entry.calories} kcal · {formatProtein(entry.protein)} g protein
        </div>
      </div>
      {coverage != null && <CoveragePie pct={coverage} isToday={isToday} />}
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

// A small pie showing what share of a food's calories the day's burn covers.
// Full (100%, in deficit) reads success-green; a partial slice reads accent.
function CoveragePie({ pct, isToday }: { pct: number; isToday: boolean }) {
  const clamped = Math.max(0, Math.min(1, pct));
  const deg = clamped * 360;
  const full = clamped >= 0.999;
  const fill = full ? "#10b981" : "#22d3ee";
  const label = `${Math.round(clamped * 100)}% of calories covered by ${isToday ? "today's" : "the day's"} burn`;
  return (
    <div
      role="img"
      aria-label={label}
      title={label}
      className="h-6 w-6 shrink-0 rounded-full ring-1 ring-line"
      style={{ background: `conic-gradient(${fill} ${deg}deg, #222222 ${deg}deg)` }}
    />
  );
}

// Protein is stored as numeric — trim a trailing ".0" so whole grams read cleanly.
function formatProtein(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
