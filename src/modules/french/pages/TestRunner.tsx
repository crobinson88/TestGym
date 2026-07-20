import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronRight, Loader2, RotateCcw, Sparkles, Volume2, X } from "lucide-react";
import type { FrenchAttemptDetail, FrenchTestKind } from "@/lib/database.types";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";
import { cn, relativeDay, todayIsoDate } from "@/lib/utils";
import {
  checkOrder,
  checkTypedAnswer,
  clampCount,
  clampStudyMode,
  clampWordsPerRound,
  generateTest,
  KIND_LABELS,
  makeSentenceQuestion,
  speedRate,
  type Question,
  type VocabDirection,
} from "../quiz";
import { VOCAB } from "../data/vocab";
import { RULE_QUESTIONS } from "../data/rules";
import { CONJ_VERBS } from "../data/conjugations";
import { PRON_QUESTIONS } from "../data/pronunciation";
import {
  useListeningSchedules,
  useMasteredVocab,
  useVocabHistory,
  useVocabSchedules,
} from "../hooks";
import { fetchSentences } from "../sentences";
import { cancelSpeech, speakFrench } from "../speech";
import { vocabKeyFromQuestionId, type VocabWordHistory } from "../stats";

function isKind(k: string | undefined): k is FrenchTestKind {
  return (
    k === "vocab" ||
    k === "rules" ||
    k === "conjug" ||
    k === "listening" ||
    k === "pronun" ||
    k === "speak"
  );
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

  // Listening only: words spoken per round (>1 = multi-word phrase rounds).
  const wordsPerRound = clampWordsPerRound(Number(searchParams.get("words")));

  // Which slice of the pool to draw: mixed / review / new. Listening only in the UI.
  const mode = clampStudyMode(searchParams.get("mode"));

  // Playback rate for the listening test (1 = normal); ignored by other kinds.
  const rate = speedRate(searchParams.get("speed"));

  // Spaced-repetition schedule for vocab and listening selection — each kind has its
  // own. Undefined until it loads; other kinds don't need it. Snapshotted on mount,
  // so the in-progress test isn't biased by its own (not-yet-saved) answers.
  const vocabSchedules = useVocabSchedules();
  const listeningSchedules = useListeningSchedules();
  const schedules = kind === "listening" ? listeningSchedules : vocabSchedules;
  const needsSchedule = kind === "vocab" || kind === "listening";
  const schedulesReady = !needsSchedule || schedules !== undefined;

  // Listening draws only from words already mastered in the written vocab tests.
  const masteredPool = useMasteredVocab();
  const needsMastered = kind === "listening";
  const masteredReady = !needsMastered || masteredPool !== undefined;
  const ready = schedulesReady && masteredReady;

  // Multi-word listening rounds are natural French sentences generated server-side
  // from the learner's mastered words — fetched async, not built from static data.
  const sentenceMode = kind === "listening" && wordsPerRound > 1;

  const { session } = useAuth();
  const token = session?.access_token;

  // Sentence rounds, once generated; undefined while generating, error string on
  // failure. Bumping `genNonce` re-runs the fetch (retry / "another test").
  const [sentenceQuestions, setSentenceQuestions] = useState<Question[] | undefined>(undefined);
  const [genError, setGenError] = useState<string | null>(null);
  const [genNonce, setGenNonce] = useState(0);

  useEffect(() => {
    if (!sentenceMode || !masteredReady || !token) return;
    const pool = masteredPool ?? [];
    if (pool.length === 0) {
      setGenError("Master some words in the vocab tests first.");
      return;
    }
    let cancelled = false;
    setSentenceQuestions(undefined);
    setGenError(null);
    const distractors = pool.map((w) => w.fr);
    (async () => {
      try {
        const sentences = await fetchSentences(distractors, count, wordsPerRound, token);
        if (cancelled) return;
        setSentenceQuestions(sentences.map((s) => makeSentenceQuestion(s, distractors, Math.random)));
      } catch (e) {
        if (cancelled) return;
        setGenError(e instanceof Error ? e.message : "Sentence generation failed");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sentenceMode, masteredReady, token, count, wordsPerRound, genNonce]);

  // Static (non-sentence) tests are built once the pool + schedule are ready, then
  // frozen for the run — the attempts table isn't written until the test finishes,
  // so selection won't shift mid-test. `ready` (not the map/array identity) gates
  // the one-time build. Sentence rounds come from `sentenceQuestions` instead.
  const syncQuestions = useMemo<Question[]>(() => {
    if (!isKind(kind) || !ready || sentenceMode) return [];
    const pool = kind === "listening" ? (masteredPool ?? []) : VOCAB;
    return generateTest(kind, pool, RULE_QUESTIONS, CONJ_VERBS, PRON_QUESTIONS, {
      count,
      direction,
      wordsPerRound,
      mode,
      schedules: needsSchedule ? schedules : undefined,
      now: todayIsoDate(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, direction, count, wordsPerRound, mode, ready, sentenceMode]);

  const questions = sentenceMode ? (sentenceQuestions ?? []) : syncQuestions;
  const startedAt = useRef(new Date().toISOString());
  const startedMs = useRef(Date.now());

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [typedResult, setTypedResult] = useState<boolean | null>(null);
  // Word-assembly (listening) state: indices into q.choices placed so far, in
  // order, plus the graded result once the learner checks.
  const [built, setBuilt] = useState<number[]>([]);
  const [orderResult, setOrderResult] = useState<boolean | null>(null);
  // Listening only: after rebuilding what they heard, the learner types the English
  // meaning. Graded separately, but the question counts correct only if both the
  // order and the meaning are right.
  const [meaningTyped, setMeaningTyped] = useState("");
  const [meaningResult, setMeaningResult] = useState<boolean | null>(null);
  // Speaking (self-assessed) state: the learner's own mark for the current form.
  const [selfResult, setSelfResult] = useState<boolean | null>(null);
  const [details, setDetails] = useState<FrenchAttemptDetail[]>([]);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);

  // Snapshotted on mount; the in-progress test isn't persisted until it finishes,
  // so this reflects prior tests only — each prompt's "seen before" is honest.
  const vocabHistory = useVocabHistory();

  // Speak each listening prompt as it appears (and on replay-by-advancing). Cancels
  // any in-flight utterance when the question changes or the runner unmounts.
  useEffect(() => {
    if (finished) return;
    const cur = questions[index];
    if (cur?.audioText) speakFrench(cur.audioText, rate);
    return () => cancelSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, finished, questions]);

  if (!isKind(kind)) return <Navigate to="/french" replace />;
  if (!ready) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center text-sm text-muted">
        Loading…
      </div>
    );
  }
  if (sentenceMode) {
    if (genError) {
      return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 p-6 text-center">
          <div className="text-sm text-warn">{genError}</div>
          <div className="flex w-full max-w-xs flex-col gap-3">
            <button
              onClick={() => setGenNonce((n) => n + 1)}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-semibold text-bg transition active:scale-[0.98]"
            >
              <RotateCcw className="h-5 w-5" /> Try again
            </button>
            <button
              onClick={() => navigate("/french")}
              className="flex h-12 items-center justify-center rounded-2xl border border-line bg-surface font-semibold transition active:scale-[0.98]"
            >
              Back
            </button>
          </div>
        </div>
      );
    }
    if (sentenceQuestions === undefined) {
      return (
        <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-sm text-muted">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
          Writing sentences from your mastered words…
        </div>
      );
    }
  }
  if (questions.length === 0) return <Navigate to="/french" replace />;

  const q = questions[index];
  const correct = details.filter((d) => d.correct).length;
  const expected = q.choices[q.answer];
  const isOrdering = q.sequence != null;
  const speaking = kind === "speak";

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

  function submitOrder() {
    if (orderResult !== null || !q.sequence || built.length !== q.sequence.length) return;
    const ok = checkOrder(
      built.map((i) => q.choices[i]),
      q.sequence,
    );
    // The detail isn't recorded yet — the meaning step finalizes the question.
    setOrderResult(ok);
  }

  // Grade the typed English meaning, then record the question: correct only if the
  // order was rebuilt right AND the meaning matches.
  function submitMeaning() {
    if (meaningResult !== null || meaningTyped.trim() === "") return;
    const ok = checkTypedAnswer(meaningTyped, q.meaning ?? "");
    setMeaningResult(ok);
    setDetails((prev) => [
      ...prev,
      { questionId: q.id, prompt: q.prompt, correct: orderResult === true && ok },
    ]);
  }

  // Self-assessed grade for a speaking prompt — the learner marks whether they said
  // it right after hearing the model pronunciation.
  function markSelf(ok: boolean) {
    if (selfResult !== null) return;
    setSelfResult(ok);
    setDetails((prev) => [...prev, { questionId: q.id, prompt: q.prompt, correct: ok }]);
  }

  async function next() {
    if (index + 1 < questions.length) {
      setIndex((i) => i + 1);
      setPicked(null);
      setTyped("");
      setTypedResult(null);
      setBuilt([]);
      setOrderResult(null);
      setMeaningTyped("");
      setMeaningResult(null);
      setSelfResult(null);
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

  // For listening rounds the question is only fully answered once the meaning has
  // also been graded; `orderResult` gates the intermediate (order-only) state.
  const orderDone = orderResult !== null;
  const answered = typing
    ? typedResult !== null
    : isOrdering
      ? meaningResult !== null
      : speaking
        ? selfResult !== null
        : picked !== null;

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

      {q.audioText ? (
        <div className="mt-6 mb-8 flex flex-col items-center text-center">
          <div className="text-xs uppercase tracking-wider text-muted">{q.sub}</div>
          <button
            type="button"
            onClick={() => speakFrench(q.audioText!, rate)}
            className="mt-4 flex h-28 w-28 items-center justify-center rounded-full bg-accent/15 text-accent transition active:scale-95"
            aria-label="Replay audio"
          >
            <Volume2 className="h-12 w-12" />
          </button>
          <div className="mt-3 text-sm text-muted">Tap to replay</div>
          {(answered || orderDone) && <div className="mt-4 text-2xl font-bold">{q.prompt}</div>}
        </div>
      ) : (
        <div className="mt-6 mb-8">
          <div className="text-xs uppercase tracking-wider text-muted">{q.sub}</div>
          <h2 className="mt-2 text-3xl font-bold leading-tight">{q.prompt}</h2>
          {kind === "conjug" && q.meaning && (
            <div className="mt-1 text-lg text-muted">{q.meaning}</div>
          )}
          {kind === "vocab" && <WordHistoryBadge questionId={q.id} history={vocabHistory} />}
          {kind === "pronun" && q.example && (
            <button
              type="button"
              onClick={() => speakFrench(q.example!)}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3.5 py-2 text-sm font-medium text-accent transition active:scale-95"
            >
              <Volume2 className="h-4 w-4" /> Hear « {q.example} »
            </button>
          )}
        </div>
      )}

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
      ) : isOrdering ? (
        <div className="flex flex-col gap-4">
          <div className="flex min-h-[3.5rem] flex-wrap content-start items-center gap-2 rounded-2xl border border-line bg-surface2 p-3">
            {built.length === 0 ? (
              <span className="px-1 text-sm text-muted">
                Tap the words below in the order you heard them
              </span>
            ) : (
              built.map((ci, pos) => {
                const state = !orderDone
                  ? "idle"
                  : q.choices[ci] === q.sequence![pos]
                    ? "correct"
                    : "wrong";
                return (
                  <button
                    key={pos}
                    onClick={() => setBuilt((b) => b.filter((_, p) => p !== pos))}
                    disabled={orderDone}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-base font-medium transition",
                      state === "idle" && "border-accent bg-accent/15 text-accent active:scale-95",
                      state === "correct" && "border-success bg-success/15 text-success",
                      state === "wrong" && "border-warn bg-warn/15 text-warn",
                    )}
                  >
                    <span className="text-xs tabular-nums opacity-60">{pos + 1}</span>
                    {q.choices[ci]}
                  </button>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {q.choices.map((choice, i) => {
              const used = built.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => setBuilt((b) => (b.includes(i) ? b : [...b, i]))}
                  disabled={orderDone || used}
                  className={cn(
                    "min-h-[3rem] rounded-xl border px-4 py-2 text-base font-medium transition",
                    used
                      ? "border-line bg-surface opacity-30"
                      : "border-line bg-surface active:scale-95",
                  )}
                >
                  {choice}
                </button>
              );
            })}
          </div>

          {!orderDone ? (
            <div className="flex gap-2">
              {built.length > 0 && (
                <button
                  onClick={() => setBuilt([])}
                  className="flex h-12 items-center justify-center rounded-2xl border border-line bg-surface px-5 font-semibold text-muted transition active:scale-[0.99]"
                >
                  Clear
                </button>
              )}
              <button
                onClick={submitOrder}
                disabled={built.length !== q.sequence!.length}
                className={cn(
                  "flex h-12 flex-1 items-center justify-center rounded-2xl font-semibold transition active:scale-[0.99]",
                  built.length !== q.sequence!.length
                    ? "bg-surface2 text-muted"
                    : "border border-accent bg-surface text-accent",
                )}
              >
                Check
              </button>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-2xl border px-4 py-3 text-base font-medium",
                  orderResult
                    ? "border-success bg-success/15 text-success"
                    : "border-warn bg-warn/15 text-warn",
                )}
              >
                {orderResult ? (
                  <Check className="h-5 w-5 shrink-0" />
                ) : (
                  <X className="h-5 w-5 shrink-0" />
                )}
                <span>{orderResult ? "Correct" : `Answer: ${q.sequence!.join(" ")}`}</span>
              </div>

              <div className="flex flex-col gap-3">
                <div className="text-sm font-medium">What does it mean in English?</div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitMeaning();
                  }}
                >
                  <input
                    type="text"
                    value={meaningTyped}
                    onChange={(e) => setMeaningTyped(e.target.value)}
                    disabled={meaningResult !== null}
                    autoFocus
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Type the meaning"
                    className={cn(
                      "h-14 w-full rounded-2xl border bg-surface px-4 text-lg font-medium outline-none transition placeholder:text-muted focus:border-accent",
                      meaningResult === null && "border-line",
                      meaningResult === true && "border-success bg-success/15 text-success",
                      meaningResult === false && "border-warn bg-warn/15 text-warn",
                    )}
                  />
                </form>
                {meaningResult !== null ? (
                  <div
                    className={cn(
                      "flex items-center gap-2 rounded-2xl border px-4 py-3 text-base font-medium",
                      meaningResult
                        ? "border-success bg-success/15 text-success"
                        : "border-warn bg-warn/15 text-warn",
                    )}
                  >
                    {meaningResult ? (
                      <Check className="h-5 w-5 shrink-0" />
                    ) : (
                      <X className="h-5 w-5 shrink-0" />
                    )}
                    <span>{meaningResult ? "Correct" : `Answer: ${q.meaning}`}</span>
                  </div>
                ) : (
                  <button
                    onClick={submitMeaning}
                    disabled={meaningTyped.trim() === ""}
                    className={cn(
                      "flex h-12 items-center justify-center rounded-2xl font-semibold transition active:scale-[0.99]",
                      meaningTyped.trim() === ""
                        ? "bg-surface2 text-muted"
                        : "border border-accent bg-surface text-accent",
                    )}
                  >
                    Check
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      ) : speaking ? (
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => speakFrench(q.example ?? q.prompt)}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl border border-accent bg-accent/10 font-semibold text-accent transition active:scale-[0.99]"
          >
            <Volume2 className="h-5 w-5" /> Hear it
          </button>
          <p className="text-center text-sm text-muted">
            Say it aloud, tap to hear the model, then mark yourself.
          </p>
          {answered ? (
            <div
              className={cn(
                "flex items-center gap-2 rounded-2xl border px-4 py-3 text-base font-medium",
                selfResult
                  ? "border-success bg-success/15 text-success"
                  : "border-warn bg-warn/15 text-warn",
              )}
            >
              {selfResult ? (
                <Check className="h-5 w-5 shrink-0" />
              ) : (
                <X className="h-5 w-5 shrink-0" />
              )}
              <span>{selfResult ? "Nice — got it" : "Keep practising this one"}</span>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => markSelf(false)}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-warn bg-surface font-semibold text-warn transition active:scale-[0.99]"
              >
                <X className="h-5 w-5" /> Missed it
              </button>
              <button
                onClick={() => markSelf(true)}
                className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl border border-success bg-surface font-semibold text-success transition active:scale-[0.99]"
              >
                <Check className="h-5 w-5" /> Got it
              </button>
            </div>
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
