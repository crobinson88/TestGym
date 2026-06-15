import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { cn, relativeDay } from "@/lib/utils";
import { useStockByTicker, useTradesForTicker } from "../hooks";
import { formatMoney, formatQty } from "../types";
import { ResearchLibrary } from "../components/ResearchLibrary";
import { ResearchPanel } from "../components/ResearchPanel";
import { StockForecasts } from "../components/StockForecasts";
import { StockModels } from "../components/StockModels";

export default function StockView() {
  const { ticker: rawTicker } = useParams();
  const ticker = (rawTicker ?? "").toUpperCase();
  const navigate = useNavigate();
  const stock = useStockByTicker(ticker);
  const trades = useTradesForTicker(ticker);

  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Re-seed the editable fields when the stock row first loads or changes
  // identity; don't clobber in-progress edits.
  useEffect(() => {
    if (stock === undefined) return;
    if (!dirty) {
      setName(stock?.name ?? "");
      setNotes(stock?.notes ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock?.id]);

  async function save() {
    setSaving(true);
    try {
      const s = await syncEngine.mutations.ensureStock(ticker, name.trim() || null);
      await syncEngine.mutations.updateStock(s.id, {
        name: name.trim() || null,
        notes: notes.trim() === "" ? null : notes,
      });
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  function insertSummary(text: string) {
    setNotes((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
    setDirty(true);
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
        <span className="text-lg font-bold">{ticker}</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-24">
        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-wide text-muted">Company name</span>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            placeholder="e.g. Apple Inc."
          />
        </label>

        <label className="block space-y-2">
          <span className="text-xs uppercase tracking-wide text-muted">General notes</span>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirty(true);
            }}
            rows={8}
            placeholder="Your running thesis, research, and reminders for this stock…"
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-text placeholder:text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </label>

        <Button onClick={save} className="w-full" disabled={saving || (!dirty && !saved)}>
          {saved ? (
            <>
              <Check className="mr-2 h-5 w-5" /> Saved
            </>
          ) : saving ? (
            "Saving…"
          ) : (
            "Save notes"
          )}
        </Button>

        <StockForecasts ticker={ticker} trades={trades} />

        <ResearchLibrary ticker={ticker} stock={stock} trades={trades} />

        <StockModels trades={trades} />

        <ResearchPanel ticker={ticker} onInsert={insertSummary} />

        <section>
          <h2 className="mb-2 px-1 text-xs uppercase tracking-wider text-muted">
            Trades · {ticker}
          </h2>
          {trades && trades.length > 0 ? (
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {trades.map((t) => (
                <li key={t.id} className="border-b border-line/50 last:border-b-0">
                  <Link
                    to={`/shares/${t.id}`}
                    className="flex items-center justify-between px-4 py-3 active:bg-surface2"
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full",
                          t.side === "buy"
                            ? "bg-success/15 text-success"
                            : "bg-warn/15 text-warn",
                        )}
                      >
                        {t.side === "buy" ? (
                          <ArrowDownRight className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </span>
                      <span className="text-sm">
                        {formatQty(t.quantity)} @ {formatMoney(t.price, t.currency)}
                        <span className="block text-xs text-muted">{relativeDay(t.traded_at)}</span>
                      </span>
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatMoney(t.quantity * t.price, t.currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-6 text-center text-sm text-muted">
              No trades logged for {ticker} yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
