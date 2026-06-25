import { Link, useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  LineChart,
  Lightbulb,
  PiggyBank,
  Plus,
  TrendingUp,
} from "lucide-react";
import { cn, relativeDay } from "@/lib/utils";
import { useMarketNotes, usePositions, useShareTrades, useTips } from "../hooks";
import { formatMoney, formatQty } from "../types";

export default function SharesView() {
  const trades = useShareTrades();
  const positions = usePositions();
  const tips = useTips();
  const marketNotes = useMarketNotes();
  const navigate = useNavigate();

  if (
    trades === undefined ||
    positions === undefined ||
    tips === undefined ||
    marketNotes === undefined
  ) {
    return <div className="p-6 text-center text-muted">Loading…</div>;
  }

  const watchingTips = tips.filter((t) => t.status === "watching").length;

  const openPositions = positions.filter((p) => Math.abs(p.netShares) > 1e-9);
  // Opening holdings roll into positions but aren't trade decisions, so keep
  // them out of the log.
  const tradeLog = trades.filter((t) => !t.is_opening);

  return (
    <div className="space-y-6 p-4 pb-24">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Shares</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate("/shares/add-holding")}
            className="flex h-11 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-semibold text-text transition active:scale-[0.98]"
          >
            <PiggyBank className="h-5 w-5 text-accent" /> Holding
          </button>
          <button
            onClick={() => navigate("/shares/add")}
            className="flex h-11 items-center gap-1.5 rounded-xl bg-accent px-3 text-sm font-semibold text-bg transition active:scale-[0.98]"
          >
            <Plus className="h-5 w-5" /> Trade
          </button>
        </div>
      </header>

      <Link
        to="/shares/tips"
        className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 active:bg-surface2"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Lightbulb className="h-5 w-5" />
          </span>
          <div className="font-semibold">Tip list</div>
        </div>
        <div className="flex items-center gap-2 text-muted">
          {watchingTips > 0 && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-accent">
              {watchingTips} watching
            </span>
          )}
          <ChevronRight className="h-5 w-5" />
        </div>
      </Link>

      <Link
        to="/shares/markets"
        className="flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 active:bg-surface2"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/15 text-accent">
            <LineChart className="h-5 w-5" />
          </span>
          <div className="font-semibold">Markets</div>
        </div>
        <div className="flex items-center gap-2 text-muted">
          {marketNotes.length > 0 && (
            <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-semibold text-text">
              {marketNotes.length}
            </span>
          )}
          <ChevronRight className="h-5 w-5" />
        </div>
      </Link>

      {trades.length === 0 && (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          <TrendingUp className="mx-auto mb-3 h-8 w-8 text-accent" />
          Nothing here yet. Log a buy or sell, or add a holding you already own.
        </div>
      )}

      {openPositions.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">Holdings</h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {openPositions.map((p) => (
              <li key={p.ticker} className="border-b border-line/50 last:border-b-0">
                <Link
                  to={`/shares/stock/${p.ticker}`}
                  className="flex items-center justify-between px-4 py-3 active:bg-surface2"
                >
                  <div>
                    <div className="text-base font-semibold">{p.ticker}</div>
                    <div className="text-xs text-muted">
                      {formatQty(p.netShares)} sh · avg {formatMoney(p.avgBuyPrice, p.currency)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        p.netCash >= 0 ? "text-success" : "text-text",
                      )}
                    >
                      {p.netCash >= 0 ? "+" : ""}
                      {formatMoney(p.netCash, p.currency)}
                    </div>
                    <div className="text-xs text-muted">net cash</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tradeLog.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">Trade log</h2>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {tradeLog.map((t) => (
              <li key={t.id} className="border-b border-line/50 last:border-b-0">
                <Link
                  to={`/shares/${t.id}`}
                  className="flex items-center justify-between px-4 py-3 active:bg-surface2"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-full",
                        t.side === "buy"
                          ? "bg-success/15 text-success"
                          : "bg-warn/15 text-warn",
                      )}
                    >
                      {t.side === "buy" ? (
                        <ArrowDownRight className="h-5 w-5" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5" />
                      )}
                    </span>
                    <div>
                      <div className="text-base font-semibold">{t.ticker}</div>
                      <div className="text-xs text-muted">
                        {formatQty(t.quantity)} @ {formatMoney(t.price, t.currency)} ·{" "}
                        {relativeDay(t.traded_at)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold tabular-nums">
                    {formatMoney(t.quantity * t.price, t.currency)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
