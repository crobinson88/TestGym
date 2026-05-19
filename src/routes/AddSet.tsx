import { useEffect, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Check, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { syncEngine } from "@/lib/sync";
import {
  useCategories,
  useExercises,
  useLastSet,
  useTodaySetsForExercise,
} from "@/lib/hooks";
import { cn, formatWeight } from "@/lib/utils";
import {
  addSetReducer,
  initialAddSetState,
  type AddSetState,
} from "./addSetReducer";

const WEIGHT_STEPS = [-10, -5, -2.5, 2.5, 5, 10];
const REP_STEPS = [-5, -1, 1, 5];

export function AddSet() {
  const [state, dispatch] = useReducer(addSetReducer, initialAddSetState);
  const navigate = useNavigate();
  const [savedFlash, setSavedFlash] = useState(false);

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
            onSaved={() => {
              setSavedFlash(true);
              dispatch({ type: "savedKeepExercise" });
              setTimeout(() => setSavedFlash(false), 1500);
            }}
          />
        )}
        {savedFlash && (
          <div
            role="status"
            className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-success px-4 py-2 text-sm font-medium text-bg shadow-lg"
          >
            Saved ✓
          </div>
        )}
      </div>
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
  if (!categories) return <Loading />;
  if (categories.length === 0) return <Empty>No categories yet.</Empty>;
  return (
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
  const exercises = useExercises(categoryId);
  if (!exercises) return <Loading />;
  if (exercises.length === 0) return <Empty>No exercises in this category.</Empty>;
  return (
    <ul className="space-y-2">
      {exercises.map((e) => (
        <li key={e.id}>
          <ExerciseTile id={e.id} name={e.name} onPick={() => onPick(e.id)} />
        </li>
      ))}
    </ul>
  );
}

function ExerciseTile({
  id,
  name,
  onPick,
}: {
  id: string;
  name: string;
  onPick: () => void;
}) {
  const last = useLastSet(id);
  const subline =
    last === undefined ? "" : last === null ? "no history" : `last: ${formatWeight(last.weight)} × ${last.reps}`;
  return (
    <button
      onClick={onPick}
      className="flex w-full items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-left transition active:scale-[0.99] hover:bg-surface2"
    >
      <span className="text-base font-medium">{name}</span>
      <span className="text-sm text-muted">{subline}</span>
    </button>
  );
}

function AmountStep({
  state,
  dispatch,
  onSaved,
}: {
  state: AddSetState;
  dispatch: React.Dispatch<{ type: "adjustWeight" | "adjustReps"; delta: number } | { type: "setDefaults"; weight: number; reps: number }>;
  onSaved: () => void;
}) {
  const last = useLastSet(state.exerciseId);
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
    try {
      await syncEngine.mutations.addSet({
        exercise_id: state.exerciseId,
        category_id: state.categoryId,
        weight: state.weight,
        reps: state.reps,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const disabled = state.weight <= 0 || state.reps <= 0;

  return (
    <div className="flex h-full flex-col">
      {last && (
        <div className="mb-4 text-center text-sm text-muted">
          last: {formatWeight(last.weight)} × {last.reps} on {last.performed_at}
        </div>
      )}

      <Display label="Weight (lbs)" value={formatWeight(state.weight)} />
      <StepRow
        steps={WEIGHT_STEPS}
        onTap={(delta) => dispatch({ type: "adjustWeight", delta })}
      />

      <Display label="Reps" value={String(state.reps)} className="mt-6" />
      <StepRow
        steps={REP_STEPS}
        onTap={(delta) => dispatch({ type: "adjustReps", delta })}
      />

      {today && today.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 text-xs uppercase tracking-wide text-muted">
            Today
          </div>
          <ul className="space-y-1 text-sm">
            {today.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg bg-surface px-3 py-2"
              >
                <span className="text-muted">Set {i + 1}</span>
                <span className="font-medium">
                  {formatWeight(s.weight)} × {s.reps}
                </span>
              </li>
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
          {saving ? "Saving..." : (
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

function Display({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("text-center", className)}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-6xl font-bold tabular-nums">{value}</div>
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
