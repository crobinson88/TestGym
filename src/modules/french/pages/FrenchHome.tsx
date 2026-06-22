import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookMarked,
  BookOpen,
  ChevronRight,
  MessageCircle,
  ScrollText,
  Sparkles,
  Target,
} from "lucide-react";
import { cn, relativeDay } from "@/lib/utils";
import { useFrenchStats } from "../hooks";
import { pct, type KindStats } from "../stats";
import type { VocabAnswerMode, VocabDirection } from "../quiz";
import { RULE_QUESTIONS } from "../data/rules";
import { VOCAB } from "../data/vocab";

const DIRECTIONS: { value: VocabDirection; label: string }[] = [
  { value: "fr2en", label: "FR → EN" },
  { value: "en2fr", label: "EN → FR" },
  { value: "mixed", label: "Mixed" },
];

const ANSWER_MODES: { value: VocabAnswerMode; label: string }[] = [
  { value: "choice", label: "Multiple choice" },
  { value: "type", label: "Type answer" },
];

function StatCard({ stats, label }: { stats: KindStats; label: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      {stats.tests === 0 ? (
        <div className="mt-2 text-sm text-muted">No tests yet</div>
      ) : (
        <>
          <div className="mt-1 text-3xl font-bold tabular-nums">{pct(stats.accuracy)}</div>
          <div className="mt-1 text-xs text-muted">
            {stats.tests} test{stats.tests === 1 ? "" : "s"} · best {pct(stats.bestAccuracy)}
          </div>
        </>
      )}
    </div>
  );
}

export default function FrenchHome() {
  const navigate = useNavigate();
  const stats = useFrenchStats();
  const [dir, setDir] = useState<VocabDirection>("mixed");
  const [answerMode, setAnswerMode] = useState<VocabAnswerMode>("choice");

  return (
    <div className="space-y-6 p-4 pb-24">
      <header>
        <h1 className="text-2xl font-bold">French 🇫🇷</h1>
        <p className="mt-1 text-sm text-muted">
          {VOCAB.length} words · {RULE_QUESTIONS.length} rule questions
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3">
        <div className="space-y-2">
          <button
            onClick={() => navigate(`/french/test/vocab?dir=${dir}&ans=${answerMode}`)}
            className="flex w-full items-center gap-4 rounded-2xl bg-accent px-5 py-4 text-left text-bg shadow-lg shadow-accent/20 transition active:scale-[0.98]"
          >
            <BookOpen className="h-7 w-7 shrink-0" />
            <div>
              <div className="text-lg font-semibold">New vocab test</div>
              <div className="text-sm opacity-80">10 words from the top 1000</div>
            </div>
          </button>
          <div className="flex gap-2" role="group" aria-label="Vocab test direction">
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDir(d.value)}
                aria-pressed={dir === d.value}
                className={cn(
                  "flex-1 rounded-xl border px-2 py-2 text-sm font-medium transition",
                  dir === d.value
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-surface text-muted",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2" role="group" aria-label="Vocab answer type">
            {ANSWER_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setAnswerMode(m.value)}
                aria-pressed={answerMode === m.value}
                className={cn(
                  "flex-1 rounded-xl border px-2 py-2 text-sm font-medium transition",
                  answerMode === m.value
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-surface text-muted",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => navigate("/french/test/rules")}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left transition active:scale-[0.98]"
        >
          <ScrollText className="h-7 w-7 shrink-0 text-accent" />
          <div>
            <div className="text-lg font-semibold">New rules test</div>
            <div className="text-sm text-muted">10 grammar questions</div>
          </div>
        </button>
        <button
          onClick={() => navigate("/french/rules")}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-3.5 text-left transition active:scale-[0.98]"
        >
          <BookMarked className="h-6 w-6 shrink-0 text-muted" />
          <div className="flex-1">
            <div className="font-semibold">Review grammar rules</div>
            <div className="text-sm text-muted">Read the reference guide</div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
        </button>
        <button
          onClick={() => navigate("/french/chat")}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-3.5 text-left transition active:scale-[0.98]"
        >
          <MessageCircle className="h-6 w-6 shrink-0 text-accent" />
          <div className="flex-1">
            <div className="font-semibold">Roleplay chat</div>
            <div className="text-sm text-muted">Practise a conversation in French</div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted" />
        </button>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">Stats</h2>
        {stats === undefined ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard stats={stats.byKind.vocab} label="Vocab" />
            <StatCard stats={stats.byKind.rules} label="Rules" />
          </div>
        )}
      </section>

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
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">Recent tests</h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {stats.recent.map((a) => {
              const acc = a.total > 0 ? a.correct / a.total : 0;
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between border-b border-line/50 px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full",
                        a.kind === "vocab" ? "bg-accent/15 text-accent" : "bg-success/15 text-success",
                      )}
                    >
                      {a.kind === "vocab" ? (
                        <BookOpen className="h-5 w-5" />
                      ) : (
                        <ScrollText className="h-5 w-5" />
                      )}
                    </span>
                    <div>
                      <div className="text-sm font-semibold capitalize">{a.kind}</div>
                      <div className="text-xs text-muted">{relativeDay(a.started_at.slice(0, 10))}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-right">
                    {acc === 1 && <Sparkles className="h-4 w-4 text-accent" />}
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
