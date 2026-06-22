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
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { downloadSetsCsv } from "@/lib/csv";
import { useDashboardStats, type WeekVolumePoint } from "@/lib/hooks";
import { useTimeDashboardStats } from "@/lib/timeHooks";
import { formatHours, type HoursPoint, type WeekHoursPoint } from "@/lib/time";
import { formatFull, formatVolume, prettyDate } from "@/lib/utils";
import { useFrenchWeeklyAccuracy, type WeekAccuracyPoint } from "@/modules/french";

const HOURS_COLOR = "#22d3ee";
const VOCAB_COLOR = "#22d3ee";
const RULES_COLOR = "#a855f7";

function mdTick(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

const CATEGORY_COLORS: Record<string, string> = {
  Back: "#22d3ee",
  Chest: "#ef4444",
  Legs: "#f59e0b",
  Shoulder: "#a855f7",
};
const FALLBACK_COLOR = "#8a8a8a";

export default function Dashboard() {
  const stats = useDashboardStats();
  const timeStats = useTimeDashboardStats();
  const frenchAccuracy = useFrenchWeeklyAccuracy();
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
          <WeeklyChart data={stats.weekly} categories={stats.categories.map((c) => c.name)} />
        </div>
      </section>

      {timeStats && (
        <>
          <section>
            <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
              Weekly hours · last 8 weeks
            </h2>
            <div className="rounded-2xl border border-line bg-surface p-3">
              <WeeklyHoursChart data={timeStats.weekly} />
            </div>
          </section>

          <section>
            <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
              Rolling 7-day hours · through today
            </h2>
            <div className="rounded-2xl border border-line bg-surface p-3">
              <RollingHoursChart data={timeStats.rolling} />
            </div>
          </section>
        </>
      )}

      {frenchAccuracy && frenchAccuracy.some((d) => d.vocab !== null || d.rules !== null) && (
        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
            French accuracy · last 8 weeks
          </h2>
          <div className="rounded-2xl border border-line bg-surface p-3">
            <FrenchAccuracyChart data={frenchAccuracy} />
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
      </LineChart>
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
          tickFormatter={(v) => formatHours(v as number)}
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
