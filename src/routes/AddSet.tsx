import { useEffect, useReducer, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Check, Minus, Plus, Power, Trash2, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RestTimer } from "@/components/RestTimer";
import { syncEngine } from "@/lib/sync";
import {
  useCategories,
  useExercises,
  useExercisesWithArchived,
  useLastSet,
  useTodaySetCount,
  useTodaySetsForExercise,
  useExerciseStats,
} from "@/lib/hooks";
import { cn, formatWeight } from "@/lib/utils";
import {
  addSetReducer,
  initialAddSetState,
  type AddSetState,
} from "./addSetReducer";
import { detectPr, type FlashKind } from "./prDetection";

const WEIGHT_STEPS = [-10, -5, -2.5, 2.5, 5, 10];
const REP_STEPS = [-5, -1, 1, 5];

type Flash = FlashKind;

export function AddSet() {
  const [state, dispatch] = useReducer(addSetReducer, initialAddSetState);
  const navigate = useNavigate();
  const [flash, setFlash] = useState<Flash | null>(null);
  const [restStartedAt, setRestStartedAt] = useState<number | null>(null);

  function goBack() {
    if (state.stage === "category") {
      navigate("/");
      return;
    }
    dispatch({ type: "back" });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={goBack}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <Breadcrumb state={state} />
      </div>

      <div className="relative flex-1 overflow-y-auto p-4">
        {state.stage === "category" && (
          <CategoryStep onPick={(id) => dispatch({ type: "pickCategory", id })} />
        )}
        {state.stage === "exercise" && state.categoryId && (
          <ExerciseStep
            categoryId={state.categoryId}
            onPick={(id) => dispatch({ type: "pickExercise", id })}
          />
        )}
        {state.stage === "amount" && state.exerciseId && state.categoryId && (
          <AmountStep
            state={state}
            dispatch={dispatch}
            restStartedAt={restStartedAt}
            onClearRest={() => setRestStartedAt(null)}
            onSaved={(result) => {
              setFlash(result);
              dispatch({ type: "savedKeepExercise" });
              setRestStartedAt(Date.now());
              setTimeout(() => setFlash(null), result.kind === "saved" ? 1500 : 2500);
            }}
          />
        )}
        {flash && <FlashToast flash={flash} />}
      </div>
    </div>
  );
}

function FlashToast({ flash }: { flash: Flash }) {
  if (flash.kind === "saved") {
    return (
      <div
        role="status"
        className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-success px-4 py-2 text-sm font-medium text-bg shadow-lg"
      >
        Saved ✓
      </div>
    );
  }
  return (
    <div
      role="status"
      className="pointer-events-none absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-warn px-4 py-2 text-sm font-bold text-bg shadow-lg"
    >
      <Trophy className="h-4 w-4" />
      {flash.kind === "pr-weight" && `New weight PR · ${formatWeight(flash.weight)}`}
      {flash.kind === "pr-reps" && `New reps PR · ${flash.reps}`}
      {flash.kind === "pr-both" &&
        `New PR · ${formatWeight(flash.weight)} × ${flash.reps}`}
    </div>
  );
}

function Breadcrumb({ state }: { state: AddSetState }) {
  const categories = useCategories();
  const exercises = useExercises();
  const cat = state.categoryId
    ? categories?.find((c) => c.id === state.categoryId)
    : undefined;
  const ex = state.exerciseId
    ? exercises?.find((e) => e.id === state.exerciseId)
    : undefined;
  return (
    <div className="min-w-0 truncate text-sm text-muted">
      {!cat && <span className="font-medium text-text">Pick a category</span>}
      {cat && !ex && (
        <span>
          <span className="font-medium text-text">{cat.name}</span>
          <span className="mx-1">·</span>Pick an exercise
        </span>
      )}
      {cat && ex && (
        <span>
          {cat.name}
          <span className="mx-1">·</span>
          <span className="font-medium text-text">{ex.name}</span>
        </span>
      )}
    </div>
  );
}

function CategoryStep({ onPick }: { onPick: (id: string) => void }) {
  const categories = useCategories();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!categories) return <Loading />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (categories!.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError("A category with that name already exists.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const max = categories!.reduce((m, c) => Math.max(m, c.sort_order), 0);
      const created = await syncEngine.mutations.addCategory({
        name: trimmed,
        sort_order: max + 1,
      });
      setName("");
      setAdding(false);
      onPick(created.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.id)}
            className="flex h-32 items-center justify-center rounded-2xl border border-line bg-surface text-2xl font-semibold transition active:scale-[0.98] hover:bg-surface2"
          >
            {c.name}
          </button>
        ))}
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex h-32 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-muted transition active:scale-[0.98] hover:border-accent hover:text-accent"
          >
            <Plus className="h-7 w-7" />
            <span className="text-sm">New category</span>
          </button>
        )}
      </div>
      {adding && (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-line bg-surface p-4"
        >
          <label className="block space-y-2">
            <span className="text-sm text-muted">Category name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Cardio"
              disabled={busy}
              maxLength={32}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="md" disabled={busy || !name.trim()}>
              {busy ? "Adding..." : "Add category"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => {
                setAdding(false);
                setName("");
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ExerciseStep({
  categoryId,
  onPick,
}: {
  categoryId: string;
  onPick: (id: string) => void;
}) {
  const exercises = useExercisesWithArchived(categoryId);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!exercises) return <Loading />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    if (exercises!.some((ex) => ex.name.toLowerCase() === trimmed.toLowerCase())) {
      setError("That exercise already exists in this category.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await syncEngine.mutations.addExercise({
        name: trimmed,
        category_id: categoryId,
      });
      setName("");
      setAdding(false);
      onPick(created.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {exercises.length === 0 && !adding && (
        <Empty>No exercises in this category yet.</Empty>
      )}
      <ul className="space-y-2">
        {exercises.map((e) => (
          <li key={e.id} className="flex items-stretch gap-2">
            <ExerciseTile
              id={e.id}
              name={e.name}
              active={!e.is_archived}
              onPick={() => onPick(e.id)}
            />
            <ActiveToggle
              active={!e.is_archived}
              name={e.name}
              onToggle={() =>
                syncEngine.mutations.setExerciseActive(e.id, e.is_archived)
              }
            />
          </li>
        ))}
      </ul>
      {!adding && (
        <button
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line py-4 text-muted transition active:scale-[0.99] hover:border-accent hover:text-accent"
        >
          <Plus className="h-5 w-5" />
          <span className="text-base">Add new exercise</span>
        </button>
      )}
      {adding && (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-line bg-surface p-4"
        >
          <label className="block space-y-2">
            <span className="text-sm text-muted">Exercise name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="e.g. Cable Row"
              disabled={busy}
              maxLength={64}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="md" disabled={busy || !name.trim()}>
              {busy ? "Adding..." : "Add exercise"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => {
                setAdding(false);
                setName("");
                setError(null);
              }}
              disabled={busy}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ExerciseTile({
  id,
  name,
  active,
  onPick,
}: {
  id: string;
  name: string;
  active: boolean;
  onPick: () => void;
}) {
  const last = useLastSet(id);
  const todayCount = useTodaySetCount(id) ?? 0;
  const subline =
    last === undefined
      ? ""
      : last === null
        ? "no history"
        : `last: ${formatWeight(last.weight)} × ${last.reps}`;
  const tone = !active
    ? "border-line bg-surface opacity-50 hover:bg-surface2"
    : todayCount >= 3
      ? "border-success bg-success/30 hover:bg-success/40"
      : todayCount >= 1
        ? "border-success/50 bg-success/10 hover:bg-success/20"
        : "border-line bg-surface hover:bg-surface2";
  return (
    <button
      onClick={onPick}
      className={cn(
        "flex flex-1 items-center justify-between rounded-2xl border px-4 py-3 text-left transition active:scale-[0.99]",
        tone,
      )}
    >
      <span className="flex items-center gap-2 text-base font-medium">
        {name}
        {active && todayCount > 0 && (
          <span className="text-xs font-semibold text-success">
            {todayCount} today
          </span>
        )}
      </span>
      <span className="text-sm text-muted">{subline}</span>
    </button>
  );
}

function ActiveToggle({
  active,
  name,
  onToggle,
}: {
  active: boolean;
  name: string;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`Mark ${name} ${active ? "inactive" : "active"}`}
      title={active ? "Active — tap to hide" : "Inactive — tap to activate"}
      className={cn(
        "flex w-12 shrink-0 items-center justify-center rounded-2xl border transition active:scale-[0.96]",
        active
          ? "border-success/50 bg-success/10 text-success"
          : "border-line bg-surface text-muted hover:bg-surface2",
      )}
    >
      <Power className="h-5 w-5" />
    </button>
  );
}

function AmountStep({
  state,
  dispatch,
  restStartedAt,
  onClearRest,
  onSaved,
}: {
  state: AddSetState;
  dispatch: React.Dispatch<
    | { type: "adjustWeight" | "adjustReps"; delta: number }
    | { type: "setDefaults"; weight: number; reps: number }
  >;
  restStartedAt: number | null;
  onClearRest: () => void;
  onSaved: (flash: Flash) => void;
}) {
  const last = useLastSet(state.exerciseId);
  const stats = useExerciseStats(state.exerciseId);
  const today = useTodaySetsForExercise(state.exerciseId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (last === undefined) return;
    const w = last?.weight ?? 100;
    const r = last?.reps ?? 8;
    dispatch({ type: "setDefaults", weight: w, reps: r });
  }, [last, dispatch]);

  async function save() {
    if (!state.exerciseId || !state.categoryId) return;
    if (state.weight <= 0 || state.reps <= 0) return;
    setSaving(true);
    const newWeight = state.weight;
    const newReps = state.reps;
    const flash = detectPr(stats ?? null, newWeight, newReps);
    try {
      await syncEngine.mutations.addSet({
        exercise_id: state.exerciseId,
        category_id: state.categoryId,
        weight: newWeight,
        reps: newReps,
      });
      onSaved(flash);
    } finally {
      setSaving(false);
    }
  }

  const disabled = state.weight <= 0 || state.reps <= 0;

  return (
    <div className="flex h-full flex-col">
      <RestTimer startedAt={restStartedAt} onClear={onClearRest} />

      {last && (
        <div className="mb-4 text-center text-sm text-muted">
          last: {formatWeight(last.weight)} × {last.reps} on {last.performed_at}
        </div>
      )}

      <Display
        label="Weight (lbs)"
        value={formatWeight(state.weight)}
        subline={
          stats && stats.prWeight > 0
            ? `max: ${formatWeight(stats.prWeight)} × ${stats.prWeightReps} on ${stats.prWeightDate}`
            : undefined
        }
      />
      <StepRow
        steps={WEIGHT_STEPS}
        onTap={(delta) => dispatch({ type: "adjustWeight", delta })}
      />

      <Display
        label="Reps"
        value={String(state.reps)}
        subline={
          stats && stats.prReps > 0
            ? `max: ${stats.prReps} × ${formatWeight(stats.prRepsWeight)} on ${stats.prRepsDate}`
            : undefined
        }
        className="mt-6"
      />
      <StepRow
        steps={REP_STEPS}
        onTap={(delta) => dispatch({ type: "adjustReps", delta })}
      />

      {today && today.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">Today</div>
          <ul className="space-y-1 text-sm">
            {today.map((s, i) => (
              <TodaySetRow
                key={s.id}
                setId={s.id}
                index={i + 1}
                weight={s.weight}
                reps={s.reps}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="mt-auto pt-6">
        <Button
          onClick={save}
          size="lg"
          className="w-full"
          disabled={disabled || saving}
        >
          {saving ? (
            "Saving..."
          ) : (
            <>
              <Check className="mr-2 h-5 w-5" />
              Save set
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function TodaySetRow({
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
    <li className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
      <span className="text-muted">Set {index}</span>
      <div className="flex items-center gap-3">
        <span className="font-medium">
          {formatWeight(weight)} × {reps}
        </span>
        {confirm ? (
          <div className="flex gap-1">
            <button
              onClick={doDelete}
              className="h-8 rounded-md bg-danger px-2 text-xs font-medium text-bg"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirm(false)}
              className="h-8 rounded-md bg-surface2 px-2 text-xs text-text"
            >
              Keep
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface2"
            aria-label={`Delete set ${index}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

function Display({
  label,
  value,
  subline,
  className,
}: {
  label: string;
  value: string;
  subline?: string;
  className?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-6xl font-bold tabular-nums">{value}</div>
      {subline && <div className="mt-1 text-xs text-muted">{subline}</div>}
    </div>
  );
}

function StepRow({
  steps,
  onTap,
}: {
  steps: readonly number[];
  onTap: (delta: number) => void;
}) {
  return (
    <div className="mt-3 flex justify-center gap-2">
      {steps.map((delta) => {
        const positive = delta > 0;
        return (
          <button
            key={delta}
            onClick={() => onTap(delta)}
            className={cn(
              "flex h-14 min-w-tap flex-1 items-center justify-center gap-1 rounded-xl border border-line bg-surface text-base font-semibold transition active:scale-[0.96]",
              positive ? "text-success" : "text-warn",
            )}
            aria-label={`${positive ? "Add" : "Subtract"} ${Math.abs(delta)}`}
          >
            {positive ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            {formatWeight(Math.abs(delta))}
          </button>
        );
      })}
    </div>
  );
}

function Loading() {
  return <div className="py-12 text-center text-muted">Loading...</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-12 text-center text-muted">{children}</div>;
}
