import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  FileSpreadsheet,
  ImagePlus,
  Link2,
  Plus,
  Sheet,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { syncEngine } from "@/lib/sync";
import { cn, todayIsoDate } from "@/lib/utils";
import type { TradeCurrency, TradeModel, TradeSide } from "../types";
import { CURRENCIES, formatMoney } from "../types";
import { uploadModelFiles, uploadTradeImages } from "../storage";

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
  const [modelSheets, setModelSheets] = useState<string[]>([]);
  const [newSheet, setNewSheet] = useState("");
  const [modelFiles, setModelFiles] = useState<File[]>([]);
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

  function addModelFiles(files: FileList | null) {
    if (!files) return;
    setModelFiles((prev) => [...prev, ...Array.from(files)]);
  }

  function addSheet() {
    const url = newSheet.trim();
    if (!url) return;
    setModelSheets((prev) => [...prev, url]);
    setNewSheet("");
  }

  async function save() {
    if (!valid || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Images + model files upload to Storage at save time; text syncs offline
      // but uploads need a connection. Upload first so a failure aborts before
      // we persist.
      const imagePaths = images.length > 0 ? await uploadTradeImages(images) : [];
      const fileModels = modelFiles.length > 0 ? await uploadModelFiles(modelFiles) : [];
      const sheetModels: TradeModel[] = modelSheets.map((url) => ({
        kind: "sheet",
        name: url,
        url,
        path: null,
      }));
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
        models: [...sheetModels, ...fileModels],
      });
      navigate("/shares");
    } catch (err) {
      const hadUploads = images.length > 0 || modelFiles.length > 0;
      setError(
        hadUploads
          ? "Couldn't upload attachments — check your connection, or remove files to save the trade offline."
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

        <Field label="Date">
          <Input
            type="date"
            value={tradedAt}
            onChange={(e) => setTradedAt(e.target.value)}
          />
        </Field>

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

        <Field label="Model — Excel upload or Google Sheet">
          <div className="space-y-2">
            {modelSheets.map((url, i) => (
              <div
                key={`${url}-${i}`}
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Sheet className="h-4 w-4 shrink-0 text-success" />
                  <span className="truncate">{url}</span>
                </span>
                <button
                  onClick={() => setModelSheets((prev) => prev.filter((_, j) => j !== i))}
                  className="shrink-0 text-muted hover:text-text"
                  aria-label="Remove sheet"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Input
                type="url"
                inputMode="url"
                value={newSheet}
                onChange={(e) => setNewSheet(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSheet();
                  }
                }}
                placeholder="Google Sheet link"
              />
              <Button size="sm" onClick={addSheet} disabled={!newSheet.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {modelFiles.length > 0 && (
              <ul className="space-y-1">
                {modelFiles.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileSpreadsheet className="h-4 w-4 shrink-0 text-accent" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <button
                      onClick={() => setModelFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="shrink-0 text-muted hover:text-text"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface2 text-base font-medium text-text transition active:scale-[0.98]">
              <Upload className="h-5 w-5 text-accent" />
              Upload Excel model
              <input
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                multiple
                className="hidden"
                onChange={(e) => {
                  addModelFiles(e.target.files);
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
