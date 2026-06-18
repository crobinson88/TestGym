import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { useCategories, useExercises } from "@/lib/hooks";
import { formatFull, formatWeight, relativeDay } from "@/lib/utils";

interface PerExerciseSummary {
  prWeight: number;
  prReps: number;
  lastSession: string;
  sessionCount: number;
}

interface HistoryData {
  summaries: Map<string, PerExerciseSummary>;
  totalVolume: number;
  totalSets: number;
}

function useHistoryData(from: string, to: string): HistoryData | undefined {
  return useLiveQuery(async () => {
    const all = await db.sets.toArray();
    const live = all.filter(
      (s) =>
        !s.deleted_at &&
        (from ? s.performed_at >= from : true) &&
        (to ? s.performed_at <= to : true),
    );
    const out = new Map<string, PerExerciseSummary>();
    const sessionsByEx = new Map<string, Set<string>>();
    let totalVolume = 0;
    for (const s of live) {
      const prev = out.get(s.exercise_id) ?? {
        prWeight: 0,
        prReps: 0,
        lastSession: "",
        sessionCount: 0,
      };
      if (s.weight > prev.prWeight) prev.prWeight = s.weight;
      if (s.reps > prev.prReps) prev.prReps = s.reps;
      if (s.performed_at > prev.lastSession) prev.lastSession = s.performed_at;
      out.set(s.exercise_id, prev);

      const set = sessionsByEx.get(s.exercise_id) ?? new Set();
      set.add(s.performed_at);
      sessionsByEx.set(s.exercise_id, set);

      totalVolume += s.weight * s.reps;
    }
    for (const [id, set] of sessionsByEx) {
      const prev = out.get(id);
      if (prev) prev.sessionCount = set.size;
    }
    return { summaries: out, totalVolume, totalSets: live.length };
  }, [from, to]);
}

export function History() {
  const categories = useCategories();
  const exercises = useExercises();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const data = useHistoryData(from, to);

  const grouped = useMemo(() => {
    if (!categories || !exercises) return [];
    return categories.map((cat) => ({
      category: cat,
      exercises: exercises.filter((e) => e.category_id === cat.id),
    }));
  }, [categories, exercises]);

  if (!categories || !exercises || !data) {
    return <div className="p-6 text-center text-muted">Loading...</div>;
  }

  const { summaries } = data;
  const filtered = Boolean(from || to);

  return (
    <div className="space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-muted">Tap an exercise to see its chart.</p>
      </header>

      <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-muted">From</span>
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base text-text"
              aria-label="From date"
            />
          </label>
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-muted">To</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="mt-1 h-12 w-full rounded-xl border border-line bg-surface2 px-3 text-base text-text"
              aria-label="To date"
            />
          </label>
        </div>
        {filtered && (
          <button
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="text-xs uppercase tracking-wide text-muted underline"
          >
            Clear filter
          </button>
        )}
        <div className="flex items-baseline justify-between border-t border-line/70 pt-3">
          <span className="text-xs uppercase tracking-wide text-muted">
            Total volume · {filtered ? "filtered" : "all time"}
          </span>
          <span className="text-lg font-semibold tabular-nums">
            {formatFull(data.totalVolume)} lb
          </span>
        </div>
        <div className="text-xs text-muted">{data.totalSets.toLocaleString()} sets</div>
      </section>

      {grouped.map(({ category, exercises: exs }) => (
        <section key={category.id}>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
            {category.name}
          </h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {exs.length === 0 && (
              <li className="px-4 py-3 text-sm text-muted">No exercises.</li>
            )}
            {exs.map((e) => {
              const s = summaries.get(e.id);
              return (
                <li key={e.id} className="border-b border-line/50 last:border-b-0">
                  <Link
                    to={`/history/${e.id}`}
                    className="flex items-center justify-between px-4 py-3 transition active:bg-surface2"
                  >
                    <div>
                      <div className="text-base font-medium">{e.name}</div>
                      <div className="text-xs text-muted">
                        {s
                          ? `PR ${formatWeight(s.prWeight)} · last ${relativeDay(s.lastSession)} · ${s.sessionCount} sessions`
                          : "no history"}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
