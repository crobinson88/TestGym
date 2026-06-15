import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LocalShareTrade } from "@/lib/db";
import { formatCagr, formatMoney, impliedCagr } from "../types";

// Format a date-only string without the UTC->local off-by-one shift.
function ymd(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return iso;
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function StockForecasts({ trades }: { trades: LocalShareTrade[] | undefined }) {
  const forecasts = useMemo(() => {
    return (trades ?? [])
      .filter((t) => t.target_price != null && t.target_date)
      .sort((a, b) => (a.traded_at < b.traded_at ? 1 : a.traded_at > b.traded_at ? -1 : 0));
  }, [trades]);

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-accent" />
        <h2 className="text-base font-semibold">Forecasts</h2>
      </div>

      {forecasts.length === 0 ? (
        <p className="text-center text-sm text-muted">
          No forecasts yet. Each buy captures a target price and date.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface2">
          {forecasts.map((t) => {
            const cagr = impliedCagr(t.price, t.target_price as number, t.traded_at, t.target_date as string);
            return (
              <li key={t.id} className="border-b border-line/50 last:border-b-0">
                <Link
                  to={`/shares/${t.id}`}
                  className="flex items-center justify-between gap-2 px-4 py-3 active:bg-surface"
                >
                  <div className="min-w-0">
                    <div className="text-base font-semibold tabular-nums">
                      {formatMoney(t.target_price as number, t.currency)}
                    </div>
                    <div className="text-xs text-muted">
                      by {ymd(t.target_date as string)} · made {ymd(t.traded_at)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        "text-base font-bold tabular-nums",
                        cagr == null ? "text-muted" : cagr >= 0 ? "text-success" : "text-warn",
                      )}
                    >
                      {cagr == null ? "—" : formatCagr(cagr)}
                    </div>
                    <div className="text-xs text-muted">implied CAGR</div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
