import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { cn, todayIsoDate } from "@/lib/utils";
import type { TradeCurrency } from "../types";
import { CURRENCIES, formatMoney } from "../types";

// Record a position you already hold (bought before you started logging, or
// transferred in). It's a buy under the hood — so it rolls into the position
// math — but flagged `is_opening` so it stays out of the trade log and carries
// no forward-looking target/thesis.
export default function AddHolding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [ticker, setTicker] = useState((params.get("ticker") ?? "").toUpperCase());
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<TradeCurrency>("USD");
  const [acquiredAt, setAcquiredAt] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qtyNum = Number(quantity);
  const priceNum = Number(price);

  const valid =
    ticker.trim().length > 0 &&
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0;

  const total = useMemo(
    () => (Number.isFinite(qtyNum) && Number.isFinite(priceNum) ? qtyNum * priceNum : 0),
    [qtyNum, priceNum],
  );

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await syncEngine.mutations.addShareTrade({
        ticker,
        side: "buy",
        quantity: qtyNum,
        price: priceNum,
        currency,
        traded_at: acquiredAt,
        notes: notes.trim() === "" ? null : notes.trim(),
        is_opening: true,
      });
      navigate("/shares");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={() => navigate("/shares")}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="font-medium text-text">Add a holding</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <p className="rounded-xl border border-line bg-surface2 px-4 py-3 text-sm text-muted">
          Record shares you already own at your average cost. It won't appear in the
          trade log — log a buy instead if this is a new decision.
        </p>

        <Field label="Ticker">
          <Input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Shares held">
            <Input
              type="number"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Avg cost / share">
            <Input
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>

        <Field label="Currency">
          <div className="grid grid-cols-4 gap-2">
            {CURRENCIES.map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "h-12 rounded-xl border text-sm font-semibold transition active:scale-[0.98]",
                  currency === c
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-surface text-muted",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Acquired">
          <Input
            type="date"
            value={acquiredAt}
            max={todayIsoDate()}
            onChange={(e) => setAcquiredAt(e.target.value)}
          />
        </Field>

        <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-center">
          <div className="text-xs uppercase tracking-wide text-muted">Cost basis</div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {formatMoney(total, currency)}
          </div>
        </div>

        <Field label="Notes — optional">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Where it's held, why you own it…"
            rows={3}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-text placeholder:text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>

        {error && (
          <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}

        <div className="pt-2">
          <Button onClick={save} size="lg" className="w-full" disabled={!valid || saving}>
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Check className="mr-2 h-5 w-5" /> Add holding
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
