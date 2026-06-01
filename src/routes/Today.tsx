import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { syncEngine } from "@/lib/sync";
import {
  useExercises,
  useCategories,
  useCardioSessionsForDate,
  useScoreForDate,
  useSetsForDate,
  useMetActivities,
} from "@/lib/hooks";
import {
  cn,
  formatVolume,
  formatWeight,
  prettyDate,
  relativeDay,
  addDays,
  todayIsoDate,
} from "@/lib/utils";

const INT_FMT = new Intl.NumberFormat();

export function Today() {
  const today = todayIsoDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const isToday = selectedDate === today;
  const atLatest = selectedDate >= today;

  const sets = useSetsForDate(selectedDate);
  const exercises = useExercises();
  const categories = useCategories();
  const cardio = useCardioSessionsForDate(selectedDate);
  const activities = useMetActivities();
  const score = useScoreForDate(selectedDate);

  if (
    sets === undefined ||
    exercises === undefined ||
    categories === undefined ||
    cardio === undefined ||
    activities === undefined ||
    score === undefined
  ) {
    return <div className="p-6 text-center text-muted">Loading...</div>;
  }

  const exById = new Map(exercises.map((e) => [e.id, e]));
  const catById = new Map(categories.map((c) => [c.id, c]));
  const activityById = new Map(activities.map((a) => [a.id, a]));

  const grouped = new Map<string, { exercise: string; category: string; sets: typeof sets }>();
  for (const s of sets) {
    const key = s.exercise_id;
    const ex = exById.get(s.exercise_id);
    const cat = catById.get(s.category_id);
    const entry = grouped.get(key) ?? {
      exercise: ex?.name ?? "Unknown",
      category: cat?.name ?? "",
      sets: [] as typeof sets,
    };
    entry.sets.push(s);
    grouped.set(key, entry);
  }
  const groups = Array.from(grouped.values()).sort((a, b) =>
    a.exercise.localeCompare(b.exercise),
  );

  const nothingLogged = sets.length === 0 && cardio.length === 0;
  const title = isToday ? "Today" : relativeDay(selectedDate, today);

  return (
    <div className="p-4">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
            aria-label="Previous day"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface2"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <label className="relative flex cursor-pointer flex-col items-center">
            <span className="text-xs uppercase tracking-wide text-muted">
              {prettyDate(selectedDate)}
            </span>
            <span className="flex items-center gap-1.5 text-2xl font-bold">
              {title}
              <Calendar className="h-4 w-4 text-muted" />
            </span>
            <input
              type="date"
              value={selectedDate}
              max={today}
              onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Select date"
            />
          </label>

          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            disabled={atLatest}
            aria-label="Next day"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted hover:bg-surface2 disabled:opacity-30"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Today's score</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-bold tabular-nums">
              {INT_FMT.format(Math.round(score.total))}
            </span>
            <span className="text-sm text-muted">MET-min</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="text-xs uppercase tracking-wide text-muted">Volume</div>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-xl font-semibold tabular-nums">
                {INT_FMT.format(Math.round(score.liftingVolume))}
              </span>
              <span className="text-xs text-muted">lb</span>
            </div>
            <div className="text-xs text-muted">
              {sets.length} {sets.length === 1 ? "set" : "sets"}
            </div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="text-xs uppercase tracking-wide text-muted">Cardio</div>
            <div className="mt-1 flex items-baseline gap-1">
              {cardio.length === 0 ? (
                <span className="text-xl font-semibold text-muted">—</span>
              ) : (
                <>
                  <span className="text-xl font-semibold tabular-nums">
                    {score.cardioMinutes}
                  </span>
                  <span className="text-xs text-muted">min</span>
                </>
              )}
            </div>
            <div className="text-xs text-muted">
              {cardio.length === 0
                ? "nothing logged"
                : `${cardio.length} ${cardio.length === 1 ? "session" : "sessions"}`}
            </div>
          </div>
        </div>
      </header>

      {nothingLogged && (
        <div className="space-y-4 py-12 text-center">
          <p className="text-muted">
            {isToday ? "No sets logged yet today." : "Nothing logged on this day."}
          </p>
          {isToday && (
            <Link to="/add" className="inline-block">
              <Button size="lg" className="px-8">
                <Plus className="mr-2 h-5 w-5" />
                Log your first set
              </Button>
            </Link>
          )}
        </div>
      )}

      <div className="space-y-4">
        {groups.map((g) => (
          <ExerciseGroup
            key={g.exercise + g.category}
            exercise={g.exercise}
            category={g.category}
            sets={g.sets}
          />
        ))}

        {cardio.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-line bg-surface">
            <header className="border-b border-line px-4 py-3">
              <div className="text-xs uppercase tracking-wide text-muted">Cardio</div>
              <h2 className="text-base font-semibold">
                {isToday ? "Today's sessions" : "Sessions"}
              </h2>
            </header>
            <ul>
              {cardio.map((c, i) => (
                <CardioRow
                  key={c.id}
                  sessionId={c.id}
                  index={i + 1}
                  activityName={activityById.get(c.activity_id)?.name ?? "Activity"}
                  minutes={c.minutes}
                  metMinutes={c.met_minutes ?? c.met_value_snapshot * c.minutes}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function ExerciseGroup({
  exercise,
  category,
  sets,
}: {
  exercise: string;
  category: string;
  sets: ReturnType<typeof useSetsForDate> extends (infer T)[] | undefined ? T[] : never;
}) {
  const subtotal = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">{category}</div>
          <h2 className="text-base font-semibold">{exercise}</h2>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-muted">Volume</div>
          <div className="font-semibold tabular-nums">{formatVolume(subtotal)}</div>
        </div>
      </header>
      <ul>
        {sets.map((s, i) => (
          <SetRow key={s.id} setId={s.id} index={i + 1} weight={s.weight} reps={s.reps} />
        ))}
      </ul>
    </section>
  );
}

function CardioRow({
  sessionId,
  index,
  activityName,
  minutes,
  metMinutes,
}: {
  sessionId: string;
  index: number;
  activityName: string;
  minutes: number;
  metMinutes: number;
}) {
  const [confirm, setConfirm] = useState(false);

  async function doDelete() {
    await syncEngine.mutations.deleteCardioSession(sessionId);
  }

  return (
    <li className="flex items-center justify-between border-b border-line/50 px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-baseline gap-3">
        <span className="w-8 shrink-0 text-sm text-muted">#{index}</span>
        <div className="min-w-0">
          <div className="truncate text-base font-medium">{activityName}</div>
          <div className="text-xs text-muted tabular-nums">
            {minutes} min · {Math.round(metMinutes)} MET-min
          </div>
        </div>
      </div>
      {confirm ? (
        <div className="flex gap-2">
          <button
            onClick={doDelete}
            className="h-10 rounded-lg bg-danger px-3 text-sm font-medium text-bg"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirm(false)}
            className="h-10 rounded-lg bg-surface2 px-3 text-sm text-text"
          >
            Keep
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirm(true)}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface2",
          )}
          aria-label={`Delete cardio session ${index}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

function SetRow({
  setId,
  index,
  weight,
  reps,
}: {
  setId: string;
  index: number;
  weight: number;
  reps: number;
}) {
  const [confirm, setConfirm] = useState(false);

  async function doDelete() {
    await syncEngine.mutations.deleteSet(setId);
  }

  return (
    <li className="flex items-center justify-between border-b border-line/50 px-4 py-3 last:border-b-0">
      <div className="flex items-baseline gap-3">
        <span className="w-8 text-sm text-muted">#{index}</span>
        <span className="text-lg font-medium tabular-nums">
          {formatWeight(weight)} × {reps}
        </span>
        <span className="text-sm text-muted">{formatVolume(weight * reps)}</span>
      </div>
      {confirm ? (
        <div className="flex gap-2">
          <button
            onClick={doDelete}
            className="h-10 rounded-lg bg-danger px-3 text-sm font-medium text-bg"
          >
            Delete
          </button>
          <button
            onClick={() => setConfirm(false)}
            className="h-10 rounded-lg bg-surface2 px-3 text-sm text-text"
          >
            Keep
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirm(true)}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface2",
          )}
          aria-label={`Delete set ${index}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
