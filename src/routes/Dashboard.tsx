import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft, ChevronRight, Download, Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DailyGoals } from "@/components/DailyGoals";
import { downloadSetsCsv } from "@/lib/csv";
import { syncEngine } from "@/lib/sync";
import {
  useDashboardStats,
  useSmokingLogMap,
  type SmokingDay,
  type WeekVolumePoint,
} from "@/lib/hooks";
import { useTimeDashboardStats } from "@/lib/timeHooks";
import { formatHours, type HoursPoint, type WeekHoursPoint } from "@/lib/time";
import { addDays, cn, formatFull, formatVolume, prettyDate, todayIsoDate } from "@/lib/utils";
import {
  useFrenchWeeklyAccuracy,
  useVocabMastery,
  useVocabMasteryProgress,
  type MasteryPoint,
  type WeekAccuracyPoint,
} from "@/modules/french";

const HOURS_COLOR = "#22d3ee";
const ROLLING_TARGET_LOW = 70;
const ROLLING_TARGET_HIGH = 80;
const ROLLING_EXCESSIVE = 90;
const ROLLING_RED_FLAG = 100;
const ROLLING_TARGET_COLOR = "#34d399";
const ROLLING_EXCESSIVE_COLOR = "#f59e0b";
const ROLLING_RED_FLAG_COLOR = "#ef4444";
const VOCAB_COLOR = "#22d3ee";
const RULES_COLOR = "#a855f7";
const CONJUG_COLOR = "#f59e0b";
const LISTENING_COLOR = "#f472b6";
const MASTERY_COLOR = "#34d399";

function mdTick(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

function weekRange(points: { week_start: string }[]): string {
  if (points.length === 0) return "";
  const first = points[0].week_start;
  const last = addDays(points[points.length - 1].week_start, 6);
  return `${mdTick(first)} – ${mdTick(last)}`;
}

function dayRange(points: { date: string }[]): string {
  if (points.length === 0) return "";
  return `${mdTick(points[0].date)} – ${mdTick(points[points.length - 1].date)}`;
}

function ChartNav({
  range,
  canGoNext,
  onPrev,
  onNext,
}: {
  range: string;
  canGoNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mb-1 flex items-center justify-between">
      <button
        onClick={onPrev}
        aria-label="Earlier"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface2"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="text-xs tabular-nums text-muted">{range}</div>
      <button
        onClick={onNext}
        disabled={!canGoNext}
        aria-label="Later"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface2 disabled:opacity-30"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  Back: "#22d3ee",
  Chest: "#ef4444",
  Legs: "#f59e0b",
  Shoulder: "#a855f7",
};
const FALLBACK_COLOR = "#8a8a8a";

export default function Dashboard() {
  const [volumeOffset, setVolumeOffset] = useState(0);
  const [dailyOffset, setDailyOffset] = useState(0);
  const [weeklyHoursOffset, setWeeklyHoursOffset] = useState(0);
  const [rollingOffset, setRollingOffset] = useState(0);
  const stats = useDashboardStats(volumeOffset);
  const smokingLogs = useSmokingLogMap();
  const timeStats = useTimeDashboardStats({
    daily: dailyOffset,
    weekly: weeklyHoursOffset,
    rolling: rollingOffset,
  });
  const frenchAccuracy = useFrenchWeeklyAccuracy();
  const vocabMastery = useVocabMastery();
  const masteryProgress = useVocabMasteryProgress();
  const [exporting, setExporting] = useState(false);
  if (!stats) return <div className="p-6 text-center text-muted">Loading...</div>;

  async function onExport() {
    setExporting(true);
    try {
      await downloadSetsCsv();
    } finally {
      setExporting(false);
    }
  }

  const lastSessionDelta =
    stats.lastSession && stats.maxSession
      ? Math.round((stats.lastSession.volume / stats.maxSession.volume) * 100)
      : null;

  return (
    <div className="space-y-6 p-4 pb-12">
      <header>
        <h1 className="text-2xl font-bold">Stats</h1>
      </header>

      <section>
        <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">Today's goals</h2>
        <DailyGoals date={todayIsoDate()} />
      </section>

      <section className="grid grid-cols-3 gap-3">
        <StatTile
          label="Daily total"
          value={formatFull(stats.today.volume)}
          sub={`${stats.today.sets} sets`}
        />
        <StatTile
          label="Last session"
          value={stats.lastSession ? formatFull(stats.lastSession.volume) : "—"}
          sub={stats.lastSession ? prettyDate(stats.lastSession.date) : "no history"}
        />
        <StatTile
          label="Max session"
          value={stats.maxSession ? formatFull(stats.maxSession.volume) : "—"}
          sub={
            stats.maxSession && lastSessionDelta !== null
              ? `last @ ${lastSessionDelta}%`
              : "—"
          }
        />
      </section>

      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">This week</div>
            <div className="mt-1 text-3xl font-bold tabular-nums">
              {stats.thisWeek.days}
              <span className="ml-1 text-base font-medium text-muted">
                {stats.thisWeek.days === 1 ? "day" : "days"}
              </span>
            </div>
          </div>
          <div className="text-right text-sm text-muted">
            <div className="font-semibold text-text">
              {formatFull(stats.thisWeek.volume)} lb
            </div>
            <div>volume</div>
          </div>
        </div>
        <div className="mt-3 border-t border-line/70 pt-3 text-sm text-muted">
          Last week: {stats.lastWeek.days}{" "}
          {stats.lastWeek.days === 1 ? "day" : "days"} · {formatFull(stats.lastWeek.volume)} lb
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
          Weekly volume · last 8 weeks
        </h2>
        <div className="rounded-2xl border border-line bg-surface p-3">
          <ChartNav
            range={weekRange(stats.weekly)}
            canGoNext={volumeOffset < 0}
            onPrev={() => setVolumeOffset((o) => o - 1)}
            onNext={() => setVolumeOffset((o) => o + 1)}
          />
          <WeeklyChart data={stats.weekly} categories={stats.categories.map((c) => c.name)} />
        </div>
      </section>

      {timeStats && (
        <>
          <section>
            <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
              Hours logged per day · last 14 days
            </h2>
            <div className="rounded-2xl border border-line bg-surface p-3">
              <ChartNav
                range={dayRange(timeStats.daily)}
                canGoNext={dailyOffset < 0}
                onPrev={() => setDailyOffset((o) => o - 1)}
                onNext={() => setDailyOffset((o) => o + 1)}
              />
              <DailyHoursChart data={timeStats.daily} />
            </div>
          </section>

          <section>
            <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
              Weekly hours · last 8 weeks
            </h2>
            <div className="rounded-2xl border border-line bg-surface p-3">
              <ChartNav
                range={weekRange(timeStats.weekly)}
                canGoNext={weeklyHoursOffset < 0}
                onPrev={() => setWeeklyHoursOffset((o) => o - 1)}
                onNext={() => setWeeklyHoursOffset((o) => o + 1)}
              />
              <WeeklyHoursChart data={timeStats.weekly} />
            </div>
          </section>

          <section>
            <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
              Rolling 7-day hours
            </h2>
            <div className="rounded-2xl border border-line bg-surface p-3">
              <ChartNav
                range={dayRange(timeStats.rolling)}
                canGoNext={rollingOffset < 0}
                onPrev={() => setRollingOffset((o) => o - 1)}
                onNext={() => setRollingOffset((o) => o + 1)}
              />
              <RollingHoursChart data={timeStats.rolling} />
            </div>
          </section>
        </>
      )}

      {frenchAccuracy && (
        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
            French accuracy · last 8 weeks
          </h2>
          <div className="rounded-2xl border border-line bg-surface p-3">
            {frenchAccuracy.some(
              (d) => d.vocab !== null || d.rules !== null || d.conjug !== null || d.listening !== null,
            ) ? (
              <FrenchAccuracyChart data={frenchAccuracy} />
            ) : (
              <div className="py-10 text-center text-sm text-muted">
                No French tests yet — take a vocab or rules test to start tracking accuracy.
              </div>
            )}
          </div>
        </section>
      )}

      {vocabMastery && masteryProgress && (
        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
            French vocab mastery · top {vocabMastery.total.toLocaleString()}
          </h2>
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="mb-3 flex items-end justify-between px-1">
              <div>
                <div className="text-3xl font-bold tabular-nums">{vocabMastery.pct}%</div>
                <div className="text-xs text-muted">
                  {vocabMastery.mastered.toLocaleString()} of{" "}
                  {vocabMastery.total.toLocaleString()} mastered · {vocabMastery.attempted.toLocaleString()} seen
                </div>
              </div>
              <div className="text-right text-xs text-muted">mastered = &gt;90% correct</div>
            </div>
            {vocabMastery.attempted > 0 ? (
              <MasteryChart data={masteryProgress} />
            ) : (
              <div className="py-10 text-center text-sm text-muted">
                No vocab answered yet — take a vocab test to start mastering the top{" "}
                {vocabMastery.total.toLocaleString()}.
              </div>
            )}
          </div>
        </section>
      )}

      {smokingLogs && (
        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">Smoking</h2>
          <div className="rounded-2xl border border-line bg-surface p-3">
            <SmokingCalendar logs={smokingLogs} />
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">All-time</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Sets" value={stats.allTime.sets.toLocaleString()} />
          <StatTile label="Volume" value={`${formatFull(stats.allTime.volume)} lb`} />
          <StatTile label="Days" value={stats.allTime.days.toString()} />
        </div>
      </section>

      <section>
        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          onClick={onExport}
          disabled={exporting}
        >
          <Download className="mr-2 h-5 w-5" />
          {exporting ? "Building CSV..." : "Export all sets to CSV"}
        </Button>
      </section>
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_YEAR = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function SmokingCalendar({ logs }: { logs: Map<string, SmokingDay> }) {
  const today = todayIsoDate();
  const [ty, tm] = today.split("-").map((p) => parseInt(p, 10));
  const [view, setView] = useState({ year: ty, month: tm });
  const [selected, setSelected] = useState<string | null>(null);
  const { year, month } = view;

  // Monday-first leading blanks + one cell per day of the visible month.
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const lead = firstDow === 0 ? 6 : firstDow - 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${year}-${pad2(month)}-${pad2(d)}`);

  let freeDays = 0;
  let smokedDays = 0;
  let cigarettes = 0;
  for (const iso of cells) {
    if (!iso) continue;
    const v = logs.get(iso);
    if (!v) continue;
    if (v.smoked) {
      smokedDays++;
      cigarettes += v.cigarettes ?? 0;
    } else {
      freeDays++;
    }
  }

  const atCurrentMonth = year === ty && month === tm;
  const changeMonth = (delta: 1 | -1) => {
    setSelected(null);
    setView((v) => {
      const next = v.month + delta;
      if (next < 1) return { year: v.year - 1, month: 12 };
      if (next > 12) return { year: v.year + 1, month: 1 };
      return { year: v.year, month: next };
    });
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => changeMonth(-1)}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold">
          {MONTH_YEAR.format(new Date(year, month - 1, 1))}
        </div>
        <button
          onClick={() => changeMonth(1)}
          disabled={atCurrentMonth}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface2 disabled:opacity-30"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={i} className="pb-1 text-center text-[10px] font-medium uppercase text-muted">
            {w}
          </div>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <div key={`b${i}`} />;
          const day = parseInt(iso.slice(8), 10);
          const future = iso > today;
          const v = logs.get(iso);
          if (future) {
            return (
              <div
                key={iso}
                className="flex aspect-square items-center justify-center rounded-md border border-transparent text-xs tabular-nums text-muted/30"
              >
                {day}
              </div>
            );
          }
          const hasCount = v?.smoked && v.cigarettes != null;
          return (
            <button
              key={iso}
              onClick={() => setSelected((s) => (s === iso ? null : iso))}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-md border text-xs tabular-nums transition",
                v?.smoked === false
                  ? "border-success/40 bg-success/20 font-semibold text-success"
                  : v?.smoked
                    ? "border-danger/40 bg-danger/20 font-semibold text-danger"
                    : "border-line/60 bg-surface2 text-muted hover:bg-surface",
                selected === iso && "ring-2 ring-accent",
              )}
              title={`${prettyDate(iso)}: ${
                v?.smoked === false
                  ? "smoke-free"
                  : v?.smoked
                    ? `smoked${v.cigarettes != null ? ` (${v.cigarettes})` : ""}`
                    : "no data"
              }`}
            >
              <span className={cn(hasCount && "leading-none")}>{day}</span>
              {hasCount && (
                <span className="text-[9px] font-normal leading-none opacity-80">
                  {v!.cigarettes}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <SmokingDayEditor
          key={selected}
          date={selected}
          entry={logs.get(selected)}
          onClose={() => setSelected(null)}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3 text-xs text-muted">
        <span className="font-medium text-success">{freeDays} smoke-free</span>
        <span className="font-medium text-danger">{smokedDays} smoked</span>
        <span className="font-medium">{cigarettes} cigarettes</span>
      </div>
      {!selected && (
        <div className="mt-1 text-center text-[11px] text-muted">
          Tap a day to log cigarettes
        </div>
      )}
    </div>
  );
}

function SmokingDayEditor({
  date,
  entry,
  onClose,
}: {
  date: string;
  entry: SmokingDay | undefined;
  onClose: () => void;
}) {
  const [count, setCount] = useState<number>(entry?.cigarettes ?? 0);

  const save = async (n: number | null) => {
    await syncEngine.mutations.setCigaretteCount(date, n);
    onClose();
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface2/60 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">{prettyDate(date)}</div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-surface2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setCount((c) => Math.max(0, c - 1))}
          aria-label="Decrease"
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-line text-muted hover:bg-surface2"
        >
          <Minus className="h-5 w-5" />
        </button>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          value={count}
          onChange={(e) => setCount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          className="w-20 text-center text-lg font-semibold tabular-nums"
          aria-label="Cigarettes"
        />
        <button
          onClick={() => setCount((c) => c + 1)}
          aria-label="Increase"
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-line text-muted hover:bg-surface2"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
      <div className="mt-1 text-center text-xs text-muted">cigarettes · 0 = smoke-free</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="primary" onClick={() => save(count)}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => save(null)} disabled={!entry}>
          Clear
        </Button>
      </div>
    </div>
  );
}

interface ChartDatum {
  week_start: string;
  total: number;
  [category: string]: number | string;
}

function WeeklyChart({
  data,
  categories,
}: {
  data: WeekVolumePoint[];
  categories: string[];
}) {
  const chartData: ChartDatum[] = data.map((d) => {
    const out: ChartDatum = { week_start: d.week_start, total: d.total };
    for (const c of categories) out[c] = d.byCategory[c] ?? 0;
    return out;
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#2a2a2a" vertical={false} />
        <XAxis
          dataKey="week_start"
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          tickFormatter={(iso) => {
            const [, m, d] = (iso as string).split("-");
            return `${m}/${d}`;
          }}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          width={44}
          tickFormatter={(v) => formatVolume(v as number)}
        />
        <Tooltip
          contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8 }}
          labelStyle={{ color: "#8a8a8a" }}
          formatter={(value, name) => [formatFull(value as number), name as string]}
          labelFormatter={(label) => `Week of ${prettyDate(label as string)}`}
        />
        <Legend
          wrapperStyle={{ fontSize: 12 }}
          iconType="circle"
          iconSize={8}
        />
        {categories.map((cat) => (
          <Bar
            key={cat}
            dataKey={cat}
            stackId="vol"
            fill={CATEGORY_COLORS[cat] ?? FALLBACK_COLOR}
            radius={[0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function DailyHoursChart({ data }: { data: HoursPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#2a2a2a" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          tickFormatter={(iso) => mdTick(iso as string)}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          width={36}
          allowDecimals={false}
          tickFormatter={(v) => formatHours(v as number)}
        />
        <Tooltip
          contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8 }}
          labelStyle={{ color: "#8a8a8a" }}
          formatter={(value) => [`${formatHours(value as number)} h`, "Hours"]}
          labelFormatter={(label) => prettyDate(label as string)}
        />
        <Bar dataKey="hours" fill={HOURS_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function WeeklyHoursChart({ data }: { data: WeekHoursPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#2a2a2a" vertical={false} />
        <XAxis
          dataKey="week_start"
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          tickFormatter={(iso) => mdTick(iso as string)}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          width={36}
          tickFormatter={(v) => formatHours(v as number)}
        />
        <Tooltip
          contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8 }}
          labelStyle={{ color: "#8a8a8a" }}
          formatter={(value) => [`${formatHours(value as number)} h`, "Hours"]}
          labelFormatter={(label) => `Week of ${prettyDate(label as string)}`}
        />
        <Bar dataKey="hours" fill={HOURS_COLOR} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function FrenchAccuracyChart({ data }: { data: WeekAccuracyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke="#2a2a2a" vertical={false} />
        <XAxis
          dataKey="week_start"
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          tickFormatter={(iso) => mdTick(iso as string)}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          width={40}
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8 }}
          labelStyle={{ color: "#8a8a8a" }}
          formatter={(value, name) => [`${value as number}%`, name as string]}
          labelFormatter={(label) => `Week of ${prettyDate(label as string)}`}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" iconSize={8} />
        <Line
          type="monotone"
          dataKey="vocab"
          name="Vocab"
          stroke={VOCAB_COLOR}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="rules"
          name="Grammar"
          stroke={RULES_COLOR}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="conjug"
          name="Conjugation"
          stroke={CONJUG_COLOR}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="listening"
          name="Listening"
          stroke={LISTENING_COLOR}
          strokeWidth={2}
          dot={{ r: 3 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MasteryChart({ data }: { data: MasteryPoint[] }) {
  const peak = Math.max(1, ...data.map((d) => d.pct));
  const top = Math.min(100, Math.ceil(peak / 5) * 5 + 5);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="masteryFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={MASTERY_COLOR} stopOpacity={0.5} />
            <stop offset="100%" stopColor={MASTERY_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2a2a2a" vertical={false} />
        <XAxis
          dataKey="week_start"
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          tickFormatter={(iso) => mdTick(iso as string)}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          width={40}
          domain={[0, top]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8 }}
          labelStyle={{ color: "#8a8a8a" }}
          formatter={(value, _name, item) => [
            `${value as number}% · ${(item?.payload as MasteryPoint).mastered} words`,
            "Mastered",
          ]}
          labelFormatter={(label) => `Week of ${prettyDate(label as string)}`}
        />
        <Area
          type="monotone"
          dataKey="pct"
          stroke={MASTERY_COLOR}
          strokeWidth={2}
          fill="url(#masteryFill)"
          dot={{ r: 3 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function RollingHoursChart({ data }: { data: HoursPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="rollingHours" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={HOURS_COLOR} stopOpacity={0.5} />
            <stop offset="100%" stopColor={HOURS_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2a2a2a" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          minTickGap={28}
          tickFormatter={(iso) => mdTick(iso as string)}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#8a8a8a" }}
          width={36}
          domain={[0, (max: number) => Math.max(max, 105)]}
          tickFormatter={(v) => formatHours(v as number)}
        />
        <ReferenceArea
          y1={ROLLING_TARGET_LOW}
          y2={ROLLING_TARGET_HIGH}
          fill={ROLLING_TARGET_COLOR}
          fillOpacity={0.12}
          stroke={ROLLING_TARGET_COLOR}
          strokeOpacity={0.35}
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
        />
        <ReferenceLine
          y={ROLLING_EXCESSIVE}
          stroke={ROLLING_EXCESSIVE_COLOR}
          strokeDasharray="5 4"
          strokeOpacity={0.8}
          ifOverflow="extendDomain"
          label={{
            value: "Excessive · 90h",
            position: "insideTopRight",
            fill: ROLLING_EXCESSIVE_COLOR,
            fontSize: 10,
          }}
        />
        <ReferenceLine
          y={ROLLING_RED_FLAG}
          stroke={ROLLING_RED_FLAG_COLOR}
          strokeDasharray="5 4"
          strokeOpacity={0.85}
          ifOverflow="extendDomain"
          label={{
            value: "Red flag · 100h",
            position: "insideTopRight",
            fill: ROLLING_RED_FLAG_COLOR,
            fontSize: 10,
          }}
        />
        <Tooltip
          contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8 }}
          labelStyle={{ color: "#8a8a8a" }}
          formatter={(value) => [`${formatHours(value as number)} h`, "7-day total"]}
          labelFormatter={(label) => prettyDate(label as string)}
        />
        <Area
          type="monotone"
          dataKey="hours"
          stroke={HOURS_COLOR}
          strokeWidth={2}
          fill="url(#rollingHours)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
