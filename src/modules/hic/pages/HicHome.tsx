import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight, HardHat, Sparkles, Target } from "lucide-react";
import { cn, relativeDay } from "@/lib/utils";
import { useHicStats } from "../hooks";
import { pct, type HicStats } from "../stats";
import { PASS_RATE, TEST_SIZE, TEST_SIZES, passed } from "../quiz";
import { SECTIONS, sectionLabel, topicLabel } from "../data/sections";
import { HIC_QUESTIONS } from "../data/questions";

function Headline({ stats }: { stats: HicStats }) {
  if (stats.totalTests === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="text-sm text-muted">No exams yet — take your first practice exam.</div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="text-xs uppercase tracking-wider text-muted">Overall accuracy</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">{pct(stats.accuracy)}</div>
        <div className="mt-1 text-xs text-muted">
          {stats.totalTests} exam{stats.totalTests === 1 ? "" : "s"} · best{" "}
          {pct(stats.bestAccuracy)}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="text-xs uppercase tracking-wider text-muted">Exams passed</div>
        <div className="mt-1 text-3xl font-bold tabular-nums">
          {stats.passes}
          <span className="text-lg text-muted">/{stats.totalTests}</span>
        </div>
        <div className="mt-1 text-xs text-muted">pass mark {Math.round(PASS_RATE * 100)}%</div>
      </div>
    </div>
  );
}

export default function HicHome() {
  const navigate = useNavigate();
  const stats = useHicStats();
  const [count, setCount] = useState<number>(TEST_SIZE);

  return (
    <div className="space-y-6 p-4 pb-24">
      <header>
        <h1 className="text-2xl font-bold">HIC Exam 🔨</h1>
        <p className="mt-1 text-sm text-muted">
          {HIC_QUESTIONS.length} questions · NYC Home Improvement Contractor licence · pass at{" "}
          {Math.round(PASS_RATE * 100)}%
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3">
        <div className="space-y-1.5">
          <div className="px-1 text-xs uppercase tracking-wider text-muted">Questions per exam</div>
          <div className="flex gap-2" role="group" aria-label="Questions per exam">
            {TEST_SIZES.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                aria-pressed={count === n}
                className={cn(
                  "flex-1 rounded-xl border px-2 py-2 text-sm font-semibold tabular-nums transition",
                  count === n
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-surface text-muted",
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => navigate(`/hic/test/all?n=${count}`)}
          className="flex w-full items-center gap-4 rounded-2xl bg-accent px-5 py-4 text-left text-bg shadow-lg shadow-accent/20 transition active:scale-[0.98]"
        >
          <HardHat className="h-7 w-7 shrink-0" />
          <div>
            <div className="text-lg font-semibold">Full practice exam</div>
            <div className="text-sm opacity-80">{count} questions across every section</div>
          </div>
        </button>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
          Practice by section
        </h2>
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
          {SECTIONS.map((s) => {
            const sect = stats?.bySection[s.key];
            return (
              <li key={s.key}>
                <button
                  onClick={() => navigate(`/hic/test/${s.key}?n=${count}`)}
                  className="flex w-full items-center justify-between gap-3 border-b border-line/50 px-4 py-3 text-left transition last:border-b-0 active:bg-surface2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{s.label}</div>
                    <div className="truncate text-xs text-muted">{s.blurb}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {sect && sect.questions > 0 && (
                      <span className="text-xs font-medium tabular-nums text-muted">
                        {pct(sect.accuracy)}
                      </span>
                    )}
                    <ChevronRight className="h-5 w-5 text-muted" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {stats && (
        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">Progress</h2>
          <Headline stats={stats} />
        </section>
      )}

      {stats && stats.weakTopics.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">Weakest topics</h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {stats.weakTopics.map((t) => (
              <li
                key={t.topic}
                className="flex items-center justify-between gap-3 border-b border-line/50 px-4 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 truncate text-sm">{topicLabel(t.topic)}</span>
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted">
                  {pct(t.accuracy)} · {t.correct}/{t.questions}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats && stats.missed.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-xs uppercase tracking-wider text-muted">
            <Target className="h-3.5 w-3.5" /> Most missed
          </h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {stats.missed.map((m) => (
              <li
                key={m.questionId}
                className="flex items-center justify-between gap-3 border-b border-line/50 px-4 py-2.5 last:border-b-0"
              >
                <span className="min-w-0 truncate text-sm">{m.prompt}</span>
                <span className="shrink-0 text-xs font-medium text-warn">
                  {m.wrong}/{m.seen} wrong
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats && stats.recent.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">Recent exams</h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {stats.recent.map((a) => {
              const ok = passed(a.correct, a.total);
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between border-b border-line/50 px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full",
                        ok ? "bg-success/15 text-success" : "bg-warn/15 text-warn",
                      )}
                    >
                      {ok ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <HardHat className="h-5 w-5" />
                      )}
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{sectionLabel(a.section)}</div>
                      <div className="text-xs text-muted">
                        {relativeDay(a.started_at.slice(0, 10))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-right">
                    {a.correct === a.total && <Sparkles className="h-4 w-4 text-accent" />}
                    <span className="text-sm font-semibold tabular-nums">
                      {a.correct}/{a.total}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
