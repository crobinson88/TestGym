import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { ACTION_TARGET, PRIORITY_TARGET } from "../targets";

function TargetPie({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number;
  color: string;
}) {
  const filled = Math.max(0, Math.min(value, target));
  // An empty target (no reluctant tasks flagged today) draws a plain grey ring
  // rather than a met goal.
  const remaining = target === 0 ? 1 : Math.max(0, target - filled);
  const pct = target === 0 ? 0 : Math.round((value / target) * 100);
  const met = target > 0 && value >= target;
  const ringColor = met ? "#10b981" : color;
  const data = [
    { name: "engaged", value: filled },
    { name: "remaining", value: remaining },
  ];

  return (
    <div className="flex min-w-0 flex-col items-center">
      <div className="relative h-16 w-16">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={ringColor} />
              <Cell fill="#222222" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] leading-none text-muted">{pct}%</span>
        </div>
      </div>
      <span className="mt-1 text-center text-[10px] uppercase leading-tight tracking-wider text-muted">
        {label}
      </span>
      <span
        className={`text-sm font-bold leading-none tabular-nums ${met ? "text-success" : ""}`}
      >
        {value}/{target}
      </span>
    </div>
  );
}

export function TargetPies({
  engaged,
  priorityEngaged,
  reluctantDone,
  reluctantTotal,
}: {
  engaged: number;
  priorityEngaged: number;
  reluctantDone: number;
  // "Did Anyway" runs against the day's own flagged count, not a fixed goal —
  // it's a progress bar over the "Don't want to do" column, so the two read the
  // same numbers.
  reluctantTotal: number;
}) {
  return (
    <div className="flex items-start justify-center gap-6">
      <TargetPie label="Action Items" value={engaged} target={ACTION_TARGET} color="#22d3ee" />
      <TargetPie label="Priority" value={priorityEngaged} target={PRIORITY_TARGET} color="#f59e0b" />
      <TargetPie
        label="Did Anyway"
        value={reluctantDone}
        target={reluctantTotal}
        color="#a78bfa"
      />
    </div>
  );
}
