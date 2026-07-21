import { useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, RotateCcw, Sparkles, X } from "lucide-react";
import type { DrivingAttemptDetail, DrivingSection } from "@/lib/database.types";
import { syncEngine } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { clampCount, generateTest, passed, PASS_RATE, type Question } from "../quiz";
import { DRIVING_QUESTIONS } from "../data/questions";
import { sectionLabel } from "../data/sections";

function isSection(s: string | undefined): s is DrivingSection {
  return (
    s === "all" ||
    s === "signs" ||
    s === "rules" ||
    s === "rightofway" ||
    s === "speed" ||
    s === "parking" ||
    s === "safety" ||
    s === "alcohol" ||
    s === "emergencies"
  );
}

export default function DrivingTest() {
  const { section } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const count = clampCount(Number(searchParams.get("n")));

  const questions = useMemo<Question[]>(() => {
    if (!isSection(section)) return [];
    return generateTest(DRIVING_QUESTIONS, sectionLabel, { count, section });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, count]);

  const startedAt = useRef(new Date().toISOString());
  const startedMs = useRef(Date.now());

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [details, setDetails] = useState<DrivingAttemptDetail[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!isSection(section)) return <Navigate to="/driving" replace />;
  if (questions.length === 0) return <Navigate to="/driving" replace />;

  const q = questions[index];
  const correct = details.filter((d) => d.correct).length;
  const answered = picked !== null;

  function choose(choice: number) {
    if (picked !== null) return;
    setPicked(choice);
    setDetails((prev) => [
      ...prev,
      { questionId: q.id, prompt: q.prompt, correct: choice === q.answer },
    ]);
  }

  async function next() {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setPicked(null);
      return;
    }
    setFinished(true);
    setSaving(true);
    const finalCorrect = details.filter((d) => d.correct).length;
    try {
      await syncEngine.mutations.addDrivingAttempt({
        section: section as DrivingSection,
        total: questions.length,
        correct: finalCorrect,
        duration_ms: Date.now() - startedMs.current,
        details,
        started_at: startedAt.current,
      });
    } finally {
      setSaving(false);
    }
  }

  if (finished) {
    const acc = correct / questions.length;
    const didPass = passed(correct, questions.length);
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 p-6 text-center">
        {acc === 1 && <Sparkles className="h-10 w-10 text-accent" />}
        <div>
          <div className="text-sm uppercase tracking-wider text-muted">
            {sectionLabel(section)} test complete
          </div>
          <div className="mt-2 text-5xl font-bold tabular-nums">
            {correct}/{questions.length}
          </div>
          <div className="mt-1 text-lg text-muted">{Math.round(acc * 100)}%</div>
          <div
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold",
              didPass ? "bg-success/15 text-success" : "bg-warn/15 text-warn",
            )}
          >
            {didPass ? (
              <>
                <Check className="h-4 w-4" /> Pass
              </>
            ) : (
              <>
                <X className="h-4 w-4" /> Below {Math.round(PASS_RATE * 100)}% — keep studying
              </>
            )}
          </div>
        </div>
        <div className="text-xs text-muted">{saving ? "Saving…" : "Saved to your stats"}</div>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            onClick={() => navigate(0)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-bg transition active:scale-[0.98]"
          >
            <RotateCcw className="h-5 w-5" /> Another test
          </button>
          <button
            onClick={() => navigate("/driving")}
            className="flex h-12 items-center justify-center rounded-2xl border border-line bg-surface font-semibold transition active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] flex-col p-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate("/driving")} className="text-sm text-muted" aria-label="Quit">
          Quit
        </button>
        <div className="text-sm font-medium tabular-nums text-muted">
          {index + 1} / {questions.length}
        </div>
      </div>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface2">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${(index / questions.length) * 100}%` }}
        />
      </div>

      <div className="mt-6 mb-8">
        <div className="text-xs uppercase tracking-wider text-muted">{q.sub}</div>
        <h2 className="mt-2 text-2xl font-bold leading-tight">{q.prompt}</h2>
      </div>

      <div className="flex flex-col gap-3">
        {q.choices.map((choice, i) => {
          const isCorrect = i === q.answer;
          const isPicked = i === picked;
          const state = !answered
            ? "idle"
            : isCorrect
              ? "correct"
              : isPicked
                ? "wrong"
                : "muted";
          return (
            <button
              key={i}
              onClick={() => choose(i)}
              disabled={answered}
              className={cn(
                "flex min-h-[3.5rem] items-center justify-between rounded-2xl border px-4 py-3 text-left text-base font-medium transition",
                state === "idle" && "border-line bg-surface active:scale-[0.99]",
                state === "correct" && "border-success bg-success/15 text-success",
                state === "wrong" && "border-warn bg-warn/15 text-warn",
                state === "muted" && "border-line bg-surface opacity-50",
              )}
            >
              <span>{choice}</span>
              {state === "correct" && <Check className="h-5 w-5 shrink-0" />}
              {state === "wrong" && <X className="h-5 w-5 shrink-0" />}
            </button>
          );
        })}
      </div>

      {answered && q.explanation && (
        <div className="mt-5 rounded-2xl border border-line bg-surface2 px-4 py-3 text-sm text-muted">
          {q.explanation}
        </div>
      )}

      <div className="mt-auto pt-6">
        <button
          onClick={next}
          disabled={!answered}
          className={cn(
            "flex h-14 w-full items-center justify-center gap-2 rounded-2xl font-semibold transition active:scale-[0.99]",
            answered ? "bg-accent text-bg" : "bg-surface2 text-muted",
          )}
        >
          {index + 1 < questions.length ? "Next" : "Finish"}
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
