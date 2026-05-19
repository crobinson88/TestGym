import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronLeft } from "lucide-react";
import { useExercise, useExerciseStats, type ExerciseHistoryPoint } from "@/lib/hooks";
import { useCategories } from "@/lib/hooks";
import { cn, formatVolume, formatWeight, prettyDate, relativeDay } from "@/lib/utils";

type Tab = "weight" | "reps" | "volume";

export default function ExerciseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const exercise = useExercise(id);
  const categories = useCategories();
  const stats = useExerciseStats(id);
  const [tab, setTab] = useState<Tab>("weight");

  if (!exercise || !stats || !categories) {
    return <div className="p-6 text-center text-muted">Loading...</div>;
  }
  if (stats === null) {
    return (
      <div className="space-y-4 p-6 text-center">
        <p className="text-muted">No sets logged for this exercise yet.</p>
        <Link to="/add" className="text-accent underline">
          Log one now
        </Link>
      </div>
    );
  }
  const category = categories.find((c) => c.id === exercise.category_id);

  return (
    <div className="space-y-6 p-4 pb-12">
      <header className="flex items-center gap-2">
        <button
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted">
            {category?.name}
          </div>
          <h1 className="truncate text-lg font-semibold">{exercise.name}</h1>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="PR weight"
          value={`${formatWeight(stats.prWeight)} lb`}
          sub={prettyDate(stats.prWeightDate)}
        />
        <StatCard
          label="PR reps"
          value={`${stats.prReps} reps`}
          sub={`@ ${formatWeight(stats.prRepsWeight)} · ${prettyDate(stats.prRepsDate)}`}
        />
        <StatCard
          label="Total volume"
          value={`${formatVolume(stats.totalVolume)}`}
          sub={`${stats.totalSets} sets`}
        />
        <StatCard
          label="Last session"
          value={relativeDay(stats.lastSession)}
          sub={`${stats.sessionCount} sessions`}
        />
      </div>

      <div className="space-y-2">
        <Tabs tab={tab} onChange={setTab} />
        <div className="rounded-2xl border border-line bg-surface p-3">
          {tab === "weight" && <WeightChart data={stats.history} />}
          {tab === "reps" && <RepsChart data={stats.history} />}
          {tab === "volume" && <VolumeChart data={stats.history} />}
        </div>
      </div>

      <RecentSessions data={stats.history.slice(-10).reverse()} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Tabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "weight", label: "Max weight" },
    { id: "reps", label: "Max reps" },
    { id: "volume", label: "Volume" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "h-10 rounded-lg text-sm font-medium transition",
            tab === t.id ? "bg-surface2 text-text" : "text-muted",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const CHART_HEIGHT = 220;
const AXIS_STYLE = { fontSize: 11, fill: "#8a8a8a" };
const GRID_STROKE = "#2a2a2a";

function tickDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${m}/${d}`;
}

function WeightChart({ data }: { data: ExerciseHistoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="date" tick={AXIS_STYLE} tickFormatter={tickDate} />
        <YAxis tick={AXIS_STYLE} width={36} />
        <Tooltip
          contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8 }}
          labelStyle={{ color: "#8a8a8a" }}
          formatter={(value) => [`${value} lb`, "Max"]}
          labelFormatter={(label) => prettyDate(label as string)}
        />
        <Line
          type="monotone"
          dataKey="max_weight"
          stroke="#22d3ee"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function RepsChart({ data }: { data: ExerciseHistoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="date" tick={AXIS_STYLE} tickFormatter={tickDate} />
        <YAxis tick={AXIS_STYLE} width={28} allowDecimals={false} />
        <Tooltip
          contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8 }}
          labelStyle={{ color: "#8a8a8a" }}
          formatter={(value) => [`${value}`, "Max"]}
          labelFormatter={(label) => prettyDate(label as string)}
        />
        <Line type="monotone" dataKey="max_reps" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function VolumeChart({ data }: { data: ExerciseHistoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="date" tick={AXIS_STYLE} tickFormatter={tickDate} />
        <YAxis tick={AXIS_STYLE} width={44} tickFormatter={(v) => formatVolume(v as number)} />
        <Tooltip
          contentStyle={{ background: "#161616", border: "1px solid #2a2a2a", borderRadius: 8 }}
          labelStyle={{ color: "#8a8a8a" }}
          formatter={(value) => [formatVolume(value as number), "Volume"]}
          labelFormatter={(label) => prettyDate(label as string)}
        />
        <Bar dataKey="volume" fill="#f59e0b" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function RecentSessions({ data }: { data: ExerciseHistoryPoint[] }) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
        Recent sessions
      </h2>
      <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
        {data.map((p) => (
          <li
            key={p.date}
            className="flex items-center justify-between border-b border-line/50 px-4 py-3 last:border-b-0"
          >
            <div>
              <div className="font-medium">{prettyDate(p.date)}</div>
              <div className="text-xs text-muted">
                {p.sets} {p.sets === 1 ? "set" : "sets"} · {relativeDay(p.date)}
              </div>
            </div>
            <div className="text-right tabular-nums">
              <div className="font-semibold">
                {formatWeight(p.max_weight)} × {p.max_reps}
              </div>
              <div className="text-xs text-muted">{formatVolume(p.volume)}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
