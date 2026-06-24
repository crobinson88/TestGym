import { useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, RotateCcw, Sparkles, X } from "lucide-react";
import type { FrenchAttemptDetail, FrenchTestKind } from "@/lib/database.types";
import { syncEngine } from "@/lib/sync";
import { cn, relativeDay, todayIsoDate } from "@/lib/utils";
import {
  checkTypedAnswer,
  clampCount,
  generateTest,
  KIND_LABELS,
  type Question,
  type VocabDirection,
} from "../quiz";
import { VOCAB } from "../data/vocab";
import { RULE_QUESTIONS } from "../data/rules";
import { CONJ_VERBS } from "../data/conjugations";
import { useVocabHistory, useVocabSchedules } from "../hooks";
import { vocabKeyFromQuestionId, type VocabWordHistory } from "../stats";

function isKind(k: string | undefined): k is FrenchTestKind {
  return k === "vocab" || k === "rules" || k === "conjug";
}

// Flags the current vocab prompt as new, or shows its prior recall (times shown,
// when last seen, % correct). Renders nothing until the history has loaded.
function WordHistoryBadge({
  questionId,
  history,
}: {
  questionId: string;
  history: Map<string, VocabWordHistory> | undefined;
}) {
  if (!history) return null;
  const key = vocabKeyFromQuestionId(questionId);
  const h = key ? history.get(key) : undefined;

  if (!h || h.seen === 0) {
    return (
      <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent">
        <Sparkles className="h-3.5 w-3.5" /> New word
      </span>
    );
  }

  return (
    <div className="mt-3 text-xs text-muted">
      Seen {h.seen}× · last {relativeDay(h.lastShownAt!.slice(0, 10))} ·{" "}
      {Math.round((h.correct / h.seen) * 100)}% correct
    </div>
  );
}

export default function TestRunner() {
  const { kind } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const dirParam = searchParams.get("dir");
  const direction: VocabDirection =
    dirParam === "fr2en" || dirParam === "en2fr" ? dirParam : "mixed";

  // Typed answers only apply to vocab; rules are always multiple choice.
  const typing = kind === "vocab" && searchParams.get("ans") === "type";

  const count = clampCount(Number(searchParams.get("n")));

  // Spaced-repetition schedule for vocab selection. Undefined until it loads; other
  // kinds don't need it. Snapshotted on mount, so the in-progress test isn't biased
  // by its own (not-yet-saved) answers.
  const vocabSchedules = useVocabSchedules();
  const schedulesReady = kind !== "vocab" || vocabSchedules !== undefined;

  // Built once the schedule is ready, then frozen for the run — the attempts table
  // isn't written until the test finishes, so the schedule won't shift mid-test.
  // `schedulesReady` (not the map identity) gates the one-time build.
  const questions = useMemo<Question[]>(() => {
    if (!isKind(kind) || !schedulesReady) return [];
    return generateTest(kind, VOCAB, RULE_QUESTIONS, CONJ_VERBS, {
      count,
      direction,
      schedules: kind === "vocab" ? vocabSchedules : undefined,
      now: todayIsoDate(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, direction, count, schedulesReady]);
  const startedAt = useRef(new Date().toISOString());
  const startedMs = useRef(Date.now());

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedResult, setTypedResult] = useState<boolean | null>(null);
  const [details, setDetails] = useState<FrenchAttemptDetail[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  // Snapshotted on mount; the in-progress test isn't persisted until it finishes,
  // so this reflects prior tests only — each prompt's "seen before" is honest.
  const vocabHistory = useVocabHistory();

  if (!isKind(kind)) return <Navigate to="/french" replace />;
  if (!schedulesReady) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  }
  if (questions.length === 0) return <Navigate to="/french" replace />;

  const q = questions[index];
  const correct = details.filter((d) => d.correct).length;
  const expected = q.choices[q.answer];

  function choose(choice: number) {
    if (picked !== null) return;
    setPicked(choice);
    setDetails((prev) => [
      ...prev,
      { questionId: q.id, prompt: q.prompt, correct: choice === q.answer },
    ]);
  }

  function submitTyped() {
    if (typedResult !== null || typed.trim() === "") return;
    const ok = checkTypedAnswer(typed, expected);
    setTypedResult(ok);
    setDetails((prev) => [...prev, { questionId: q.id, prompt: q.prompt, correct: ok }]);
  }

  async function next() {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setPicked(null);
      setTyped("");
      setTypedResult(null);
      return;
    }
    setFinished(true);
    setSaving(true);
    const finalCorrect = details.filter((d) => d.correct).length;
    try {
      await syncEngine.mutations.addFrenchAttempt({
        kind: kind as FrenchTestKind,
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
    const perfect = correct === questions.length;
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 p-6 text-center">
        {perfect && <Sparkles className="h-10 w-10 text-accent" />}
        <div>
          <div className="text-sm uppercase tracking-wider text-muted">
            {KIND_LABELS[kind]} test complete
          </div>
          <div className="mt-2 text-5xl font-bold tabular-nums">
            {correct}/{questions.length}
          </div>
          <div className="mt-1 text-lg text-muted">{Math.round(acc * 100)}%</div>
        </div>
        <div className="text-xs text-muted">{saving ? "Saving…" : "Saved to your stats"}</div>
        <div className="flex w-full max-w-xs flex-col gap-3">
          <button
            onClick={() => navigate(0)}
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-bg transition active:scale-[0.98]"
          >
            <RotateCcw className="h-5 w-5" /> Another {KIND_LABELS[kind].toLowerCase()} test
          </button>
          <button
            onClick={() => navigate("/french")}
            className="flex h-12 items-center justify-center rounded-2xl border border-line bg-surface font-semibold transition active:scale-[0.98]"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  const answered = typing ? typedResult !== null : picked !== null;

  return (
    <div className="flex min-h-[70vh] flex-col p-4 pb-24">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => navigate("/french")} className="text-sm text-muted" aria-label="Quit">
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
        <h2 className="mt-2 text-3xl font-bold leading-tight">{q.prompt}</h2>
        {kind === "vocab" && <WordHistoryBadge questionId={q.id} history={vocabHistory} />}
      </div>

      {typing ? (
        <div className="flex flex-col gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitTyped();
            }}
          >
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={answered}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              placeholder="Type your answer"
              className={cn(
                "h-14 w-full rounded-2xl border bg-surface px-4 text-lg font-medium outline-none transition placeholder:text-muted focus:border-accent",
                !answered && "border-line",
                answered && typedResult && "border-success bg-success/15 text-success",
                answered && !typedResult && "border-warn bg-warn/15 text-warn",
              )}
            />
          </form>
          {answered && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-2xl border px-4 py-3 text-base font-medium",
                typedResult
                  ? "border-success bg-success/15 text-success"
                  : "border-warn bg-warn/15 text-warn",
              )}
            >
              {typedResult ? (
                <Check className="h-5 w-5 shrink-0" />
              ) : (
                <X className="h-5 w-5 shrink-0" />
              )}
              <span>{typedResult ? "Correct" : `Answer: ${expected}`}</span>
            </div>
          )}
          {!answered && (
            <button
              onClick={submitTyped}
              disabled={typed.trim() === ""}
              className={cn(
                "flex h-12 items-center justify-center rounded-2xl font-semibold transition active:scale-[0.99]",
                typed.trim() === "" ? "bg-surface2 text-muted" : "bg-surface border border-accent text-accent",
              )}
            >
              Check
            </button>
          )}
        </div>
      ) : (
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
      )}

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
