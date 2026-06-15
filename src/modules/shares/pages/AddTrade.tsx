import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ImagePlus, Link2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { cn, todayIsoDate } from "@/lib/utils";
import type { TradeCurrency, TradeSide } from "../types";
import { CURRENCIES, formatMoney } from "../types";
import { uploadTradeImages } from "../storage";

export default function AddTrade() {
  const navigate = useNavigate();
  const [side, setSide] = useState<TradeSide>("buy");
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<TradeCurrency>("USD");
  const [tradedAt, setTradedAt] = useState(todayIsoDate());
  const [notes, setNotes] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [images, setImages] = useState<File[]>([]);
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
    () => (valid ? qtyNum * priceNum : 0),
    [valid, qtyNum, priceNum],
  );

  const previews = useMemo(
    () => images.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
    [images],
  );

  function addImages(files: FileList | null) {
    if (!files) return;
    setImages((prev) => [...prev, ...Array.from(files)]);
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Images upload to Storage at save time; text syncs offline but images
      // need a connection. Upload first so a failure aborts before we persist.
      const imagePaths = images.length > 0 ? await uploadTradeImages(images) : [];
      await syncEngine.mutations.addShareTrade({
        ticker,
        side,
        quantity: qtyNum,
        price: priceNum,
        currency,
        traded_at: tradedAt,
        notes: notes.trim() === "" ? null : notes.trim(),
        links: links.map((l) => l.trim()).filter(Boolean),
        images: imagePaths,
      });
      navigate("/shares");
    } catch (err) {
      setError(
        images.length > 0
          ? "Couldn't upload images — check your connection, or remove images to save the trade offline."
          : (err as Error).message,
      );
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
        <span className="font-medium text-text">Log a trade</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="grid grid-cols-2 gap-2">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={cn(
                "h-12 rounded-xl border text-base font-semibold capitalize transition active:scale-[0.98]",
                side === s
                  ? s === "buy"
                    ? "border-success bg-success/15 text-success"
                    : "border-warn bg-warn/15 text-warn"
                  : "border-line bg-surface text-muted",
              )}
            >
              {s}
            </button>
          ))}
        </div>

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
          <Field label="Quantity">
            <Input
              type="number"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Price / share">
            <Input
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Currency">
            <div className="grid grid-cols-3 gap-1">
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
          <Field label="Date">
            <Input
              type="date"
              value={tradedAt}
              onChange={(e) => setTradedAt(e.target.value)}
            />
          </Field>
        </div>

        <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-center">
          <div className="text-xs uppercase tracking-wide text-muted">Total</div>
          <div className="mt-1 text-3xl font-bold tabular-nums">
            {formatMoney(total, currency)}
          </div>
        </div>

        <Field label="Notes — why this trade?">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Thesis, catalyst, target, risk…"
            rows={4}
            className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-text placeholder:text-muted outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </Field>

        <Field label="Links">
          <div className="space-y-2">
            {links.map((link, i) => (
              <div key={i} className="flex items-center gap-2">
                <Link2 className="h-4 w-4 shrink-0 text-muted" />
                <Input
                  type="url"
                  inputMode="url"
                  value={link}
                  onChange={(e) =>
                    setLinks((prev) => prev.map((l, j) => (j === i ? e.target.value : l)))
                  }
                  placeholder="https://…"
                />
                <button
                  onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface2"
                  aria-label="Remove link"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLinks((prev) => [...prev, ""])}
              className="w-full"
            >
              <Plus className="mr-1 h-4 w-4" /> Add link
            </Button>
          </div>
        </Field>

        <Field label="Images">
          <div className="space-y-2">
            {previews.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {previews.map((p, i) => (
                  <div key={p.url} className="relative">
                    <img
                      src={p.url}
                      alt={p.name}
                      className="h-24 w-full rounded-xl border border-line object-cover"
                    />
                    <button
                      onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-bg/80 text-text"
                      aria-label="Remove image"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface2 text-base font-medium text-text transition active:scale-[0.98]">
              <ImagePlus className="h-5 w-5 text-accent" />
              Add images
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  addImages(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="pt-2">
          <Button onClick={save} size="lg" className="w-full" disabled={!valid || saving}>
            {saving ? (
              "Saving…"
            ) : (
              <>
                <Check className="mr-2 h-5 w-5" /> Save trade
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
