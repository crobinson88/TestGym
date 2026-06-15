import type { LocalShareTrade } from "@/lib/db";
import type { TradeCurrency, TradeSide } from "@/lib/database.types";

export type { ShareTradeRow, TradeCurrency, TradeModel, TradeSide } from "@/lib/database.types";
export type { LocalShareTrade } from "@/lib/db";

export const CURRENCIES: readonly TradeCurrency[] = ["USD", "GBP", "EUR", "AUD"];
export const SIDES: readonly TradeSide[] = ["buy", "sell"];

const SYMBOL: Record<TradeCurrency, string> = { USD: "$", GBP: "£", EUR: "€", AUD: "A$" };

export function formatMoney(amount: number, currency: TradeCurrency): string {
  return `${SYMBOL[currency]}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatQty(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

// Compound annual growth rate implied by reaching `targetPrice` from `buyPrice`
// over the span [fromIso, toIso]. Returns null when inputs can't yield a rate.
export function impliedCagr(
  buyPrice: number,
  targetPrice: number,
  fromIso: string,
  toIso: string,
): number | null {
  if (!(buyPrice > 0) || !(targetPrice > 0)) return null;
  const days = (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86_400_000;
  if (!(days > 0)) return null;
  return Math.pow(targetPrice / buyPrice, 365.25 / days) - 1;
}

export function formatCagr(cagr: number): string {
  const pct = cagr * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

export interface Position {
  ticker: string;
  currency: TradeCurrency;
  netShares: number;
  buyCost: number;
  sellProceeds: number;
  avgBuyPrice: number;
  // Net cash flow: positive means more realised from sells than spent on buys.
  netCash: number;
  tradeCount: number;
  lastTradedAt: string;
}

// Roll a ticker's transaction log up into a single position snapshot. With no
// live price feed this stays cash-based: net shares held and net cash flow.
export function computePositions(trades: LocalShareTrade[]): Position[] {
  const byTicker = new Map<string, Position>();
  for (const t of trades) {
    const cost = t.quantity * t.price;
    const pos =
      byTicker.get(t.ticker) ??
      ({
        ticker: t.ticker,
        currency: t.currency,
        netShares: 0,
        buyCost: 0,
        sellProceeds: 0,
        avgBuyPrice: 0,
        netCash: 0,
        tradeCount: 0,
        lastTradedAt: t.traded_at,
      } satisfies Position);
    if (t.side === "buy") {
      pos.netShares += t.quantity;
      pos.buyCost += cost;
    } else {
      pos.netShares -= t.quantity;
      pos.sellProceeds += cost;
    }
    pos.tradeCount += 1;
    if (t.traded_at > pos.lastTradedAt) pos.lastTradedAt = t.traded_at;
    byTicker.set(t.ticker, pos);
  }
  const positions = [...byTicker.values()];
  for (const pos of positions) {
    const boughtShares = trades
      .filter((t) => t.ticker === pos.ticker && t.side === "buy")
      .reduce((sum, t) => sum + t.quantity, 0);
    pos.avgBuyPrice = boughtShares > 0 ? pos.buyCost / boughtShares : 0;
    pos.netCash = pos.sellProceeds - pos.buyCost;
  }
  return positions.sort((a, b) => (a.lastTradedAt < b.lastTradedAt ? 1 : -1));
}
