import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookMarked,
  BookOpen,
  ChevronRight,
  Headphones,
  MessageCircle,
  Mic,
  Repeat,
  ScrollText,
  Sparkles,
  Target,
  Volume2,
} from "lucide-react";
import type { FrenchTestKind } from "@/lib/database.types";
import { cn, relativeDay } from "@/lib/utils";
import {
  useFrenchStats,
  useListeningDueCount,
  useMasteredVocab,
  useVocabDueCount,
} from "../hooks";
import { pct, type KindStats } from "../stats";
import {
  KIND_LABELS,
  LISTENING_SIZES,
  LISTENING_SPEEDS,
  LISTENING_WORDS_PER_ROUND,
  STUDY_MODES,
  TEST_SIZE,
  TEST_SIZES,
  type ListeningSpeed,
  type StudyMode,
  type VocabAnswerMode,
  type VocabDirection,
} from "../quiz";
import { RULE_QUESTIONS } from "../data/rules";
import { VOCAB } from "../data/vocab";
import { CONJ_VERBS } from "../data/conjugations";
import { PRON_QUESTIONS } from "../data/pronunciation";

// Icon + accent colour per kind, shared by the recent-tests list.
const KIND_VISUAL: Record<FrenchTestKind, { Icon: typeof BookOpen; tint: string }> = {
  vocab: { Icon: BookOpen, tint: "bg-accent/15 text-accent" },
  rules: { Icon: ScrollText, tint: "bg-success/15 text-success" },
  conjug: { Icon: Repeat, tint: "bg-warn/15 text-warn" },
  listening: { Icon: Headphones, tint: "bg-accent/15 text-accent" },
  pronun: { Icon: Volume2, tint: "bg-accent/15 text-accent" },
  speak: { Icon: Mic, tint: "bg-warn/15 text-warn" },
};

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
  const dueCount = useVocabDueCount();
  const listenDue = useListeningDueCount();
  const mastered = useMasteredVocab();
  const [dir, setDir] = useState<VocabDirection>("mixed");
  const [answerMode, setAnswerMode] = useState<VocabAnswerMode>("choice");
  const [vocabMode, setVocabMode] = useState<StudyMode>("mixed");
  const [count, setCount] = useState<number>(TEST_SIZE);
  const [listenCount, setListenCount] = useState<number>(10);
  const [wordsPerRound, setWordsPerRound] = useState<number>(1);
  const [speed, setSpeed] = useState<ListeningSpeed>("normal");
  const [listenMode, setListenMode] = useState<StudyMode>("mixed");

  // Listening only speaks words already mastered in the written vocab tests.
  const masteredCount = mastered?.length ?? 0;
  const canListen = mastered === undefined || masteredCount > 0;

  return (
    <div className="space-y-6 p-4 pb-24">
      <header>
        <h1 className="text-2xl font-bold">French 🇫🇷</h1>
        <p className="mt-1 text-sm text-muted">
          {VOCAB.length} words · {RULE_QUESTIONS.length} rule questions · {PRON_QUESTIONS.length}{" "}
          pronunciation · {CONJ_VERBS.length} verbs
        </p>
      </header>

      <section className="grid grid-cols-1 gap-3">
        <div className="space-y-1.5">
          <div className="px-1 text-xs uppercase tracking-wider text-muted">Questions per test</div>
          <div className="flex gap-2" role="group" aria-label="Questions per test">
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
        <div className="space-y-2">
          <button
            onClick={() =>
              navigate(`/french/test/vocab?dir=${dir}&ans=${answerMode}&n=${count}&mode=${vocabMode}`)
            }
            className="flex w-full items-center gap-4 rounded-2xl bg-accent px-5 py-4 text-left text-bg shadow-lg shadow-accent/20 transition active:scale-[0.98]"
          >
            <BookOpen className="h-7 w-7 shrink-0" />
            <div>
              <div className="text-lg font-semibold">Vocab test</div>
              <div className="text-sm opacity-80">
                {vocabMode === "new" ? (
                  <>New words · {count} per test</>
                ) : vocabMode === "review" ? (
                  <>
                    {dueCount} due for review · {count} per test
                  </>
                ) : dueCount ? (
                  <>
                    {dueCount} due for review · {count} per test
                  </>
                ) : (
                  <>
                    {count} words from the top {VOCAB.length.toLocaleString()}
                  </>
                )}
              </div>
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
          <div className="flex gap-2" role="group" aria-label="Vocab word selection">
            {STUDY_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setVocabMode(m.value)}
                aria-pressed={vocabMode === m.value}
                className={cn(
                  "flex-1 rounded-xl border px-2 py-2 text-sm font-medium transition",
                  vocabMode === m.value
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
          onClick={() => navigate(`/french/test/rules?n=${count}`)}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left transition active:scale-[0.98]"
        >
          <ScrollText className="h-7 w-7 shrink-0 text-accent" />
          <div>
            <div className="text-lg font-semibold">New rules test</div>
            <div className="text-sm text-muted">{count} grammar questions</div>
          </div>
        </button>
        <button
          onClick={() => navigate(`/french/test/conjug?n=${count}`)}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left transition active:scale-[0.98]"
        >
          <Repeat className="h-7 w-7 shrink-0 text-warn" />
          <div>
            <div className="text-lg font-semibold">New conjugation test</div>
            <div className="text-sm text-muted">{count} prompts · present + near future</div>
          </div>
        </button>
        <button
          onClick={() => navigate(`/french/test/pronun?n=${count}`)}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left transition active:scale-[0.98]"
        >
          <Volume2 className="h-7 w-7 shrink-0 text-accent" />
          <div>
            <div className="text-lg font-semibold">Pronunciation test</div>
            <div className="text-sm text-muted">{count} questions · how letters sound</div>
          </div>
        </button>
        <button
          onClick={() => navigate(`/french/test/speak?n=${count}`)}
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left transition active:scale-[0.98]"
        >
          <Mic className="h-7 w-7 shrink-0 text-warn" />
          <div>
            <div className="text-lg font-semibold">Speaking test</div>
            <div className="text-sm text-muted">
              {count} conjugations · say them aloud, self-assessed
            </div>
          </div>
        </button>
        <div className="space-y-2">
          <button
            onClick={() =>
              navigate(
                `/french/test/listening?n=${listenCount}&words=${wordsPerRound}&speed=${speed}&mode=${listenMode}`,
              )
            }
            disabled={!canListen}
            className={cn(
              "flex w-full items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left transition active:scale-[0.98]",
              !canListen && "opacity-50",
            )}
          >
            <Headphones className="h-7 w-7 shrink-0 text-accent" />
            <div>
              <div className="text-lg font-semibold">Listening test</div>
              <div className="text-sm text-muted">
                {!canListen
                  ? "Master words in vocab tests to unlock listening"
                  : wordsPerRound > 1
                    ? `Hear a ~${wordsPerRound}-word sentence built from your mastered words · ${listenCount} per test`
                    : listenMode === "new"
                      ? `New mastered words · ${listenCount} per test`
                      : listenMode === "review"
                        ? `${listenDue} due for review · ${listenCount} per test`
                        : listenDue
                          ? `${listenDue} due for review · ${listenCount} per test`
                          : `Hear ${listenCount} of ${masteredCount} mastered word${masteredCount === 1 ? "" : "s"}`}
              </div>
            </div>
          </button>
          {wordsPerRound > 1 ? (
            <p className="px-1 text-xs text-muted">
              Sentences are generated from words you’ve mastered, spoken for you to rebuild in order.
            </p>
          ) : (
            <div className="flex gap-2" role="group" aria-label="Listening word selection">
              {STUDY_MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setListenMode(m.value)}
                  aria-pressed={listenMode === m.value}
                  className={cn(
                    "flex-1 rounded-xl border px-2 py-2 text-sm font-medium transition",
                    listenMode === m.value
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-surface text-muted",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1">
            <div className="px-1 text-xs uppercase tracking-wider text-muted">Rounds per test</div>
            <div className="flex gap-2" role="group" aria-label="Rounds per test">
              {LISTENING_SIZES.map((n) => (
                <button
                  key={n}
                  onClick={() => setListenCount(n)}
                  aria-pressed={listenCount === n}
                  className={cn(
                    "flex-1 rounded-xl border px-2 py-2 text-sm font-semibold tabular-nums transition",
                    listenCount === n
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-surface text-muted",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <div className="px-1 text-xs uppercase tracking-wider text-muted">Words per round</div>
            <div className="flex gap-2" role="group" aria-label="Words per round">
              {LISTENING_WORDS_PER_ROUND.map((n) => (
                <button
                  key={n}
                  onClick={() => setWordsPerRound(n)}
                  aria-pressed={wordsPerRound === n}
                  className={cn(
                    "flex-1 rounded-xl border px-2 py-2 text-sm font-semibold tabular-nums transition",
                    wordsPerRound === n
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-line bg-surface text-muted",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2" role="group" aria-label="Listening speed">
            {LISTENING_SPEEDS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSpeed(s.value)}
                aria-pressed={speed === s.value}
                className={cn(
                  "flex-1 rounded-xl border px-2 py-2 text-sm font-medium transition",
                  speed === s.value
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-surface text-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
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
            <StatCard stats={stats.byKind.vocab} label={KIND_LABELS.vocab} />
            <StatCard stats={stats.byKind.listening} label={KIND_LABELS.listening} />
            <StatCard stats={stats.byKind.rules} label={KIND_LABELS.rules} />
            <StatCard stats={stats.byKind.conjug} label={KIND_LABELS.conjug} />
            <StatCard stats={stats.byKind.pronun} label={KIND_LABELS.pronun} />
            <StatCard stats={stats.byKind.speak} label={KIND_LABELS.speak} />
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
              const { Icon, tint } = KIND_VISUAL[a.kind];
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between border-b border-line/50 px-4 py-3 last:border-b-0"
                >
                  <div className="flex items-center gap-3">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-full", tint)}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{KIND_LABELS[a.kind]}</div>
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
