import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight } from "lucide-react";
import { prettyDate } from "@/lib/utils";
import { useHistory } from "../hooks";

export default function HistoryView() {
  const history = useHistory(90);
  if (!history) return <div className="p-6 text-center text-muted">Loading...</div>;

  const data = history.map((h) => ({
    date: h.snapshot_date,
    pct: Math.round(h.ratio * 100),
    done: h.done,
    total: h.total,
  }));

  return (
    <div className="space-y-4 p-4">
      <header>
        <h1 className="text-2xl font-bold">TDL History</h1>
        <p className="text-sm text-muted">Completion % over the last 90 days.</p>
      </header>

      {data.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
          No history yet.
        </div>
      ) : (
        <>
          <div className="h-48 w-full rounded-2xl border border-line bg-surface p-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <CartesianGrid stroke="#2a2a2a" strokeDasharray="2 2" />
                <XAxis dataKey="date" hide />
                <YAxis domain={[0, 100]} width={30} stroke="#8a8a8a" fontSize={10} />
                <Tooltip
                  contentStyle={{
                    background: "#161616",
                    border: "1px solid #2a2a2a",
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="pct"
                  stroke="#22d3ee"
                  fill="#22d3ee33"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {[...data].reverse().map((d) => (
              <li key={d.date} className="border-b border-line/50 last:border-b-0">
                <Link
                  to={`/tdl/${d.date}`}
                  className="flex items-center justify-between px-4 py-3 transition active:bg-surface2"
                >
                  <div>
                    <div className="text-base font-medium">{prettyDate(d.date)}</div>
                    <div className="text-xs text-muted">
                      {d.done}/{d.total} done · {d.pct}%
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
