import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Plus, Target, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { cn, todayIsoDate } from "@/lib/utils";
import type { LocalShareTrade } from "@/lib/db";
import type { TradeCurrency } from "../types";
import { CURRENCIES, formatCagr, formatMoney, impliedCagr } from "../types";
import { useForecastsForTicker } from "../hooks";
import { buildModel } from "../model/engine";
import { latestGeneratedModel } from "../model/saved";
import { computeTarget, derivation, METHODS, type ValMethod } from "../model/valuation";

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

interface Item {
  key: string;
  basePrice: number;
  targetPrice: number;
  targetDate: string;
  madeOn: string;
  currency: TradeCurrency;
  source: "buy" | "forecast";
  tradeId?: string;
  forecastId?: string;
}

export function StockForecasts({
  ticker,
  trades,
}: {
  ticker: string;
  trades: LocalShareTrade[] | undefined;
}) {
  const forecasts = useForecastsForTicker(ticker);
  const [adding, setAdding] = useState(false);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const t of trades ?? []) {
      if (t.target_price != null && t.target_date) {
        out.push({
          key: `t-${t.id}`,
          basePrice: t.price,
          targetPrice: t.target_price,
          targetDate: t.target_date,
          madeOn: t.traded_at,
          currency: t.currency,
          source: "buy",
          tradeId: t.id,
        });
      }
    }
    for (const f of forecasts ?? []) {
      out.push({
        key: `f-${f.id}`,
        basePrice: f.base_price,
        targetPrice: f.target_price,
        targetDate: f.target_date,
        madeOn: f.made_on,
        currency: f.currency,
        source: "forecast",
        forecastId: f.id,
      });
    }
    return out.sort((a, b) => (a.madeOn < b.madeOn ? 1 : a.madeOn > b.madeOn ? -1 : 0));
  }, [trades, forecasts]);

  // Default a new forecast's currency to whatever this ticker already uses.
  const defaultCurrency = items[0]?.currency ?? "USD";

  async function del(id: string) {
    await syncEngine.mutations.deleteForecast(id);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-accent" />
          <h2 className="text-base font-semibold">Forecasts</h2>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className="flex h-9 items-center gap-1 rounded-xl bg-surface2 px-3 text-sm font-medium text-text"
        >
          {adding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {adding ? "Close" : "Add"}
        </button>
      </div>

      {adding && (
        <ForecastForm
          ticker={ticker}
          defaultCurrency={defaultCurrency}
          trades={trades}
          onDone={() => setAdding(false)}
        />
      )}

      {items.length === 0 ? (
        <p className="text-center text-sm text-muted">
          No forecasts yet. Each buy captures one, or add a standalone forecast above.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface2">
          {items.map((it) => {
            const cagr = impliedCagr(it.basePrice, it.targetPrice, it.madeOn, it.targetDate);
            const body = (
              <>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold tabular-nums">
                      {formatMoney(it.targetPrice, it.currency)}
                    </span>
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] capitalize text-muted">
                      {it.source}
                    </span>
                  </div>
                  <div className="text-xs text-muted">
                    by {ymd(it.targetDate)} · made {ymd(it.madeOn)} · from{" "}
                    {formatMoney(it.basePrice, it.currency)}
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
                  <div className="text-[11px] text-muted">implied CAGR</div>
                </div>
              </>
            );
            return (
              <li key={it.key} className="border-b border-line/50 last:border-b-0">
                {it.source === "buy" ? (
                  <Link
                    to={`/shares/${it.tradeId}`}
                    className="flex items-center justify-between gap-2 px-4 py-3 active:bg-surface"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center justify-between gap-2 px-4 py-3">
                    {body}
                    <button
                      onClick={() => it.forecastId && del(it.forecastId)}
                      className="shrink-0 text-muted hover:text-danger"
                      aria-label="Delete forecast"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

function ForecastForm({
  ticker,
  defaultCurrency,
  trades,
  onDone,
}: {
  ticker: string;
  defaultCurrency: TradeCurrency;
  trades: LocalShareTrade[] | undefined;
  onDone: () => void;
}) {
  const [basePrice, setBasePrice] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [madeOn, setMadeOn] = useState(todayIsoDate());
  const [currency, setCurrency] = useState<TradeCurrency>(defaultCurrency);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [method, setMethod] = useState<ValMethod>("pe");
  const [multiple, setMultiple] = useState("");
  const [metric, setMetric] = useState("");
  const [netDebt, setNetDebt] = useState("");
  const [shares, setShares] = useState("");

  const methodDef = METHODS.find((m) => m.value === method)!;
  const saved = useMemo(() => latestGeneratedModel(trades), [trades]);

  const baseNum = num(basePrice);
  const multNum = num(multiple);
  const metricNum = num(metric);
  const netDebtNum = netDebt.trim() === "" ? 0 : num(netDebt);
  const sharesNum = num(shares);
  const target = computeTarget(method, multNum, metricNum, netDebtNum, sharesNum);

  const valid =
    baseNum > 0 &&
    target != null &&
    target > 0 &&
    !!targetDate &&
    !!madeOn &&
    targetDate > madeOn;
  const cagr = valid ? impliedCagr(baseNum, target!, madeOn, targetDate) : null;

  // Pull the metric (and net debt for EV methods) from the latest saved model,
  // using the forecast year that matches the target date.
  function fillFromModel() {
    if (!saved) return;
    const m = buildModel(saved.assumptions);
    const ty = targetDate ? Number(targetDate.slice(0, 4)) : null;
    const i = ty && m.years.includes(ty) ? m.years.indexOf(ty) : m.years.length - 1;
    if (method === "ev_ebitda") setMetric(String(round2(m.ebitda[i])));
    else if (method === "ev_ebit") setMetric(String(round2(m.ebit[i])));
    else if (method === "ev_sales") setMetric(String(round2(m.revenue[i])));
    else if (sharesNum > 0) setMetric(String(round2(m.netIncome[i] / sharesNum))); // EPS
    if (methodDef.enterprise) setNetDebt(String(round2(m.debt[i] - m.cash[i])));
  }
  const modelYear = useMemo(() => {
    if (!saved) return null;
    const ty = targetDate ? Number(targetDate.slice(0, 4)) : null;
    const years = saved.assumptions.startYear;
    const last = years + saved.assumptions.years;
    return ty && ty >= years && ty <= last ? ty : last;
  }, [saved, targetDate]);

  async function save() {
    if (!valid || saving || target == null) return;
    setSaving(true);
    try {
      const deriv = derivation(method, multNum, metricNum, netDebtNum, sharesNum, target, currency);
      const userNotes = notes.trim();
      await syncEngine.mutations.addForecast({
        ticker,
        base_price: baseNum,
        target_price: round2(target),
        target_date: targetDate,
        made_on: madeOn,
        currency,
        notes: userNotes ? `${deriv}\n${userNotes}` : deriv,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface2 p-3">
      <div className="grid grid-cols-2 gap-3">
        <Labeled label="Current price">
          <Input
            type="number"
            inputMode="decimal"
            value={basePrice}
            onChange={(e) => setBasePrice(e.target.value)}
            placeholder="0.00"
          />
        </Labeled>
        <Labeled label="Made on">
          <Input type="date" value={madeOn} onChange={(e) => setMadeOn(e.target.value)} />
        </Labeled>
        <Labeled label="Target by">
          <Input
            type="date"
            value={targetDate}
            min={madeOn}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </Labeled>
      </div>

      {/* Valuation: target price = multiple × metric */}
      <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
        <span className="text-xs uppercase tracking-wide text-muted">Valuation</span>
        <div className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethod(m.value)}
              className={cn(
                "h-10 rounded-xl border text-sm font-semibold transition active:scale-[0.98]",
                method === m.value
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-surface2 text-muted",
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Labeled label={`${methodDef.label} multiple`}>
            <Input
              type="number"
              inputMode="decimal"
              value={multiple}
              onChange={(e) => setMultiple(e.target.value)}
              placeholder="0.0"
            />
          </Labeled>
          <Labeled label={`${methodDef.metricLabel} forecast`}>
            <Input
              type="number"
              inputMode="decimal"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              placeholder="0.00"
            />
          </Labeled>
          {methodDef.enterprise && (
            <>
              <Labeled label="Net debt">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={netDebt}
                  onChange={(e) => setNetDebt(e.target.value)}
                  placeholder="0"
                />
              </Labeled>
              <Labeled label="Shares out.">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  placeholder="0"
                />
              </Labeled>
            </>
          )}
        </div>

        {saved && (
          <button
            onClick={fillFromModel}
            className="w-full rounded-xl border border-line bg-surface2 px-3 py-2 text-xs font-medium text-accent active:scale-[0.99]"
          >
            Fill {methodDef.metricLabel}
            {methodDef.enterprise ? " + net debt" : ""} from latest model
            {modelYear ? ` (${modelYear})` : ""}
            {method === "pe" && !(sharesNum > 0) ? " — enter shares first" : ""}
          </button>
        )}

        <div className="flex items-center justify-between rounded-xl bg-surface2 px-4 py-2">
          <span className="text-xs uppercase tracking-wide text-muted">Target price</span>
          <span className="text-xl font-bold tabular-nums">
            {target == null ? "—" : formatMoney(target, currency)}
          </span>
        </div>
      </div>

      <Labeled label="Currency">
        <div className="grid grid-cols-4 gap-2">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              onClick={() => setCurrency(c)}
              className={cn(
                "h-11 rounded-xl border text-sm font-semibold transition active:scale-[0.98]",
                currency === c
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line bg-surface text-muted",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </Labeled>

      <Labeled label="Notes (optional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Rationale…" />
      </Labeled>

      <div className="flex items-center justify-between rounded-xl bg-surface px-4 py-2">
        <span className="text-xs uppercase tracking-wide text-muted">Implied CAGR</span>
        <span
          className={cn(
            "text-lg font-bold tabular-nums",
            cagr == null ? "text-muted" : cagr >= 0 ? "text-success" : "text-warn",
          )}
        >
          {cagr == null ? "—" : formatCagr(cagr)}
        </span>
      </div>

      <Button onClick={save} className="w-full" disabled={!valid || saving}>
        <Check className="mr-2 h-5 w-5" /> {saving ? "Saving…" : "Save forecast"}
      </Button>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
