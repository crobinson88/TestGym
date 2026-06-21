import { useMemo } from "react";
import { Link } from "react-router-dom";
import { LineChart } from "lucide-react";
import type { LocalShareTrade } from "@/lib/db";
import { basisLabel, buildModel } from "../model/engine";
import { latestGeneratedModel } from "../model/saved";
import { formatCagr } from "../types";

interface Row {
  label: string;
  values: number[];
  emphasis?: boolean;
}

function fmt(n: number): string {
  const r = Math.round(n);
  if (Object.is(r, -0) || r === 0) return "0";
  return r < 0 ? `(${Math.abs(r).toLocaleString()})` : r.toLocaleString();
}

// Year-over-year growth; null where there's no prior year or it isn't meaningful
// (non-positive base).
function yoy(values: number[], t: number): number | null {
  if (t === 0) return null;
  const prev = values[t - 1];
  if (!(prev > 0)) return null;
  return values[t] / prev - 1;
}

function savedOn(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function ForecastTable({ title, rows, years }: { title?: string; rows: Row[]; years: number[] }) {
  return (
    <div className="space-y-1">
      {title && <h3 className="px-1 text-xs uppercase tracking-wider text-muted">{title}</h3>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs tabular-nums">
          <thead>
            <tr className="text-muted">
              <th className="sticky left-0 bg-surface px-2 py-1 text-left font-medium">Line</th>
              {years.map((y) => (
                <th key={y} className="px-2 py-1 text-right font-medium">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className={row.emphasis ? "border-t border-line/60 font-semibold" : ""}
              >
                <td className="sticky left-0 bg-surface px-2 py-1 text-left text-muted">
                  {row.label}
                </td>
                {row.values.map((v, t) => {
                  const g = yoy(row.values, t);
                  return (
                    <td key={t} className="px-2 py-1 text-right align-top">
                      <div>{fmt(v)}</div>
                      <div
                        className={
                          "text-[10px] font-normal " +
                          (g == null ? "text-muted/50" : g >= 0 ? "text-success" : "text-warn")
                        }
                      >
                        {g == null ? "—" : formatCagr(g)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Revenue + the earnings ladder from the company's latest saved model, with
// per-line YoY growth and (for multi-segment models) revenue/earnings broken out
// by segment. Rebuilt locally from the stashed assumptions, so it stays live and
// offline.
export function CompanyForecasts({
  ticker,
  trades,
}: {
  ticker: string;
  trades: LocalShareTrade[] | undefined;
}) {
  const saved = useMemo(() => latestGeneratedModel(trades), [trades]);
  const model = useMemo(() => (saved ? buildModel(saved.assumptions) : null), [saved]);

  const lines: Row[] = useMemo(() => {
    if (!model) return [];
    const out: Row[] = [{ label: "Revenue", values: model.revenue, emphasis: true }];
    if (model.basis === "gross_profit") out.push({ label: "Gross profit", values: model.grossProfit });
    out.push({ label: "EBITDA", values: model.ebitda });
    out.push({ label: "EBIT", values: model.ebit });
    out.push({ label: "Net income", values: model.netIncome, emphasis: true });
    return out;
  }, [model]);

  const hasSegments = !!model && model.segmentNames.length > 1;
  const revenueBySegment: Row[] = useMemo(() => {
    if (!model || !hasSegments) return [];
    return [
      ...model.segmentNames.map((name, i) => ({ label: name, values: model.segmentRevenue[i] })),
      { label: "Total revenue", values: model.revenue, emphasis: true },
    ];
  }, [model, hasSegments]);
  const earningsBySegment: Row[] = useMemo(() => {
    if (!model || !hasSegments) return [];
    return [
      ...model.segmentNames.map((name, i) => ({ label: name, values: model.segmentProfit[i] })),
      { label: "Total", values: model.basisProfit, emphasis: true },
    ];
  }, [model, hasSegments]);

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <LineChart className="h-5 w-5 text-accent" />
        <h2 className="text-base font-semibold">Company financial forecasts</h2>
      </div>

      {!model || !saved ? (
        <div className="space-y-3">
          <p className="text-center text-sm text-muted">
            No model yet. Build a 3-statement model to see revenue & earnings forecasts here.
          </p>
          <Link
            to={`/shares/stock/${ticker}/model`}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface2 text-sm font-semibold text-text transition active:scale-[0.98]"
          >
            Build a model
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">
            {basisLabel(saved.assumptions.basis)} basis · from model saved {savedOn(saved.createdAt)}
          </p>

          <ForecastTable rows={lines} years={model.years} />

          {hasSegments && (
            <>
              <ForecastTable title="Revenue by segment" rows={revenueBySegment} years={model.years} />
              <ForecastTable
                title={`${basisLabel(model.basis)} by segment`}
                rows={earningsBySegment}
                years={model.years}
              />
            </>
          )}

          <Link
            to={`/shares/stock/${ticker}/model`}
            className="block text-center text-xs text-accent"
          >
            Open model builder
          </Link>
        </>
      )}
    </section>
  );
}
