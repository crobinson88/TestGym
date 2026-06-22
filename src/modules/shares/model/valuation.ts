// Pure valuation math for price-target forecasts: target price = multiple ×
// metric. Kept free of UI/sync imports so it's unit-testable in isolation.
import type { TradeCurrency } from "../types";
import { formatMoney } from "../types";

export type ValMethod = "pe" | "ev_ebitda" | "ev_ebit" | "ev_sales";

export const METHODS: {
  value: ValMethod;
  label: string;
  metricLabel: string;
  enterprise: boolean;
}[] = [
  { value: "pe", label: "P/E", metricLabel: "EPS", enterprise: false },
  { value: "ev_ebitda", label: "EV/EBITDA", metricLabel: "EBITDA", enterprise: true },
  { value: "ev_ebit", label: "EV/EBIT", metricLabel: "EBIT", enterprise: true },
  { value: "ev_sales", label: "EV/Sales", metricLabel: "Revenue", enterprise: true },
];

export const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// P/E gives price per share directly; enterprise multiples give EV, bridged to
// equity (− net debt) and per share (÷ shares).
export function computeTarget(
  method: ValMethod,
  multiple: number,
  metric: number,
  netDebt: number,
  shares: number,
): number | null {
  if (!(multiple > 0) || !(metric > 0)) return null;
  if (method === "pe") return multiple * metric;
  if (!(shares > 0) || !Number.isFinite(netDebt)) return null;
  return (multiple * metric - netDebt) / shares;
}

export function derivation(
  method: ValMethod,
  multiple: number,
  metric: number,
  netDebt: number,
  shares: number,
  price: number,
  currency: TradeCurrency,
): string {
  const m = METHODS.find((x) => x.value === method)!;
  const head = `Target = ${fmtNum(multiple)}x ${m.label} × ${fmtNum(metric)} ${m.metricLabel}`;
  if (method === "pe") return `${head} = ${formatMoney(price, currency)}`;
  return `${head} − ${fmtNum(netDebt)} net debt ÷ ${fmtNum(shares)} sh = ${formatMoney(price, currency)}`;
}
