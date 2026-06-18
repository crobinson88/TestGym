import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check,
  ChevronLeft,
  Download,
  FileText,
  Link2,
  Plus,
  Save,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";
import { useTradesForTicker } from "../hooks";
import { uploadModelFiles } from "../storage";
import { readUploadDoc, seedModelAssumptions, type UploadDoc } from "../research";
import { defaultAssumptions, buildModel, toStatements, type ModelAssumptions } from "../model/engine";
import { buildWorkbookBlob, downloadBlob, modelFileName } from "../model/excel";

type Kind = "money" | "pct" | "int" | "year";
type Key = keyof ModelAssumptions;

interface FieldDef {
  key: Key;
  label: string;
  kind: Kind;
}

const GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Horizon",
    fields: [
      { key: "startYear", label: "Start year", kind: "year" },
      { key: "years", label: "Forecast years", kind: "int" },
    ],
  },
  {
    title: "Growth & margins",
    fields: [
      { key: "baseRevenue", label: "Base revenue", kind: "money" },
      { key: "revenueGrowth", label: "Revenue growth", kind: "pct" },
      { key: "grossMargin", label: "Gross margin", kind: "pct" },
      { key: "opexPctRevenue", label: "Opex % of revenue", kind: "pct" },
      { key: "daPctRevenue", label: "D&A % of revenue", kind: "pct" },
    ],
  },
  {
    title: "Capital & tax",
    fields: [
      { key: "taxRate", label: "Tax rate", kind: "pct" },
      { key: "capexPctRevenue", label: "Capex % of revenue", kind: "pct" },
      { key: "interestRate", label: "Interest rate on debt", kind: "pct" },
      { key: "dividendPayout", label: "Dividend payout", kind: "pct" },
    ],
  },
  {
    title: "Working capital (days)",
    fields: [
      { key: "dso", label: "Receivable days", kind: "int" },
      { key: "dio", label: "Inventory days", kind: "int" },
      { key: "dpo", label: "Payable days", kind: "int" },
    ],
  },
  {
    title: "Opening balance sheet",
    fields: [
      { key: "startingCash", label: "Starting cash", kind: "money" },
      { key: "startingPpe", label: "Starting PP&E", kind: "money" },
      { key: "startingDebt", label: "Starting debt", kind: "money" },
    ],
  },
];

const KIND: Record<Key, Kind> = Object.fromEntries(
  GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f.kind])),
) as Record<Key, Kind>;

// Form values are display strings (percentages shown ×100); parsed back to the
// engine's decimal assumptions for the live preview and export.
function toForm(a: ModelAssumptions): Record<Key, string> {
  const out = {} as Record<Key, string>;
  for (const k of Object.keys(a) as Key[]) {
    const v = a[k];
    out[k] = KIND[k] === "pct" ? String(round(v * 100, 4)) : String(v);
  }
  return out;
}

function parseForm(form: Record<Key, string>): ModelAssumptions {
  const base = defaultAssumptions();
  const out = { ...base };
  for (const k of Object.keys(form) as Key[]) {
    const n = Number(form[k]);
    if (!Number.isFinite(n)) continue;
    out[k] = KIND[k] === "pct" ? n / 100 : n;
  }
  out.years = Math.min(10, Math.max(1, Math.round(out.years)));
  return out;
}

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

function fmt(n: number): string {
  const r = Math.round(n);
  if (Object.is(r, -0) || r === 0) return "0";
  return r < 0 ? `(${Math.abs(r).toLocaleString()})` : r.toLocaleString();
}

export default function ModelBuilder() {
  const { ticker: rawTicker } = useParams();
  const ticker = (rawTicker ?? "").toUpperCase();
  const navigate = useNavigate();
  const { session } = useAuth();
  const trades = useTradesForTicker(ticker);
  const latest = trades && trades.length > 0 ? trades[0] : null;

  const [form, setForm] = useState<Record<Key, string>>(() => toForm(defaultAssumptions()));
  const [busy, setBusy] = useState<null | "download" | "save">(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seeding state
  const [seedUrls, setSeedUrls] = useState<string[]>([]);
  const [seedDocs, setSeedDocs] = useState<UploadDoc[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);

  const assumptions = useMemo(() => parseForm(form), [form]);
  const model = useMemo(() => buildModel(assumptions), [assumptions]);
  const statements = useMemo(() => toStatements(model), [model]);
  const maxImbalance = useMemo(
    () => Math.max(...model.balanceCheck.map((v) => Math.abs(v))),
    [model],
  );

  function setField(k: Key, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function download() {
    if (busy) return;
    setBusy("download");
    setError(null);
    try {
      const blob = await buildWorkbookBlob(ticker, assumptions);
      downloadBlob(blob, modelFileName(ticker));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't build the workbook");
    } finally {
      setBusy(null);
    }
  }

  async function saveToLibrary() {
    if (busy || !latest) return;
    setBusy("save");
    setError(null);
    try {
      const blob = await buildWorkbookBlob(ticker, assumptions);
      const file = new File([blob], modelFileName(ticker), { type: blob.type });
      const uploaded = await uploadModelFiles([file]);
      await syncEngine.mutations.updateShareTrade(latest.id, {
        models: [...(latest.models ?? []), ...uploaded],
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(
        e instanceof Error
          ? "Couldn't upload the model — check your connection. You can still download it."
          : "Save failed",
      );
    } finally {
      setBusy(null);
    }
  }

  async function addSeedFiles(files: FileList | null) {
    if (!files) return;
    const read = await Promise.all(Array.from(files).map(readUploadDoc));
    setSeedDocs((prev) => [...prev, ...read]);
  }

  async function runSeed() {
    const token = session?.access_token;
    const urls = seedUrls.map((u) => u.trim()).filter(Boolean);
    if (!token || seeding || urls.length + seedDocs.length === 0) return;
    setSeeding(true);
    setSeedError(null);
    setRationale(null);
    try {
      const seeded = await seedModelAssumptions({ ticker, urls, files: seedDocs }, token);
      setForm((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(prev) as Key[]) {
          const v = (seeded as unknown as Record<string, number | string | null>)[k];
          if (typeof v === "number" && Number.isFinite(v)) {
            next[k] = KIND[k] === "pct" ? String(round(v * 100, 4)) : String(v);
          }
        }
        return next;
      });
      setRationale(seeded.rationale ?? null);
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "Seeding failed");
    } finally {
      setSeeding(false);
    }
  }

  const seedSources = seedUrls.filter((u) => u.trim()).length + seedDocs.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-2 py-3">
        <button
          onClick={() => navigate(`/shares/stock/${ticker}`)}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-text hover:bg-surface2"
          aria-label="Back"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <span className="font-medium text-text">Build a model · {ticker}</span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-28">
        {/* Seed with Claude */}
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <h2 className="text-base font-semibold">Seed assumptions from filings</h2>
          </div>
          <p className="text-xs text-muted">
            Add a 10-K / annual report and Claude proposes the drivers below. You stay in control —
            edit anything before exporting.
          </p>

          {seedUrls.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-muted" />
              <Input
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setSeedUrls((p) => p.map((u, j) => (j === i ? e.target.value : u)))}
                placeholder="https://www.sec.gov/…"
              />
              <button
                onClick={() => setSeedUrls((p) => p.filter((_, j) => j !== i))}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface2"
                aria-label="Remove link"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ))}
          {seedDocs.length > 0 && (
            <ul className="space-y-1">
              {seedDocs.map((d, i) => (
                <li
                  key={`${d.name}-${i}`}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-muted" />
                    <span className="truncate">{d.name}</span>
                  </span>
                  <button
                    onClick={() => setSeedDocs((p) => p.filter((_, j) => j !== i))}
                    className="text-muted hover:text-text"
                    aria-label="Remove document"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setSeedUrls((p) => [...p, ""])}
            >
              <Plus className="mr-1 h-4 w-4" /> Add link
            </Button>
            <label className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface2 text-sm font-medium text-text transition active:scale-[0.98]">
              <Upload className="h-4 w-4 text-accent" />
              Upload
              <input
                type="file"
                accept="application/pdf,text/plain,.txt,.md,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addSeedFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <Button onClick={runSeed} className="w-full" disabled={seeding || seedSources === 0}>
            {seeding ? (
              "Reading filings…"
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" /> Seed with Claude{" "}
                {seedSources > 0 ? `(${seedSources})` : ""}
              </>
            )}
          </Button>
          {seedError && (
            <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
              {seedError}
            </div>
          )}
          {rationale && (
            <div className="whitespace-pre-wrap rounded-xl border border-line bg-surface2 px-4 py-3 text-sm">
              {rationale}
            </div>
          )}
        </section>

        {/* Assumptions form */}
        {GROUPS.map((group) => (
          <section key={group.title} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wider text-muted">{group.title}</h2>
            <div className="grid grid-cols-2 gap-3">
              {group.fields.map((f) => (
                <label key={f.key} className="block space-y-1">
                  <span className="text-xs text-muted">
                    {f.label}
                    {f.kind === "pct" ? " (%)" : ""}
                  </span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={form[f.key]}
                    onChange={(e) => setField(f.key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>
        ))}

        {/* Live preview */}
        <div
          className={cnCheck(maxImbalance)}
        >
          {maxImbalance < 1
            ? "Balance sheet ties out ✓"
            : `Balance sheet off by ${fmt(maxImbalance)} — check inputs`}
        </div>

        {statements.map((s) => (
          <section key={s.title} className="space-y-2 rounded-2xl border border-line bg-surface p-3">
            <h2 className="px-1 text-sm font-semibold">{s.title}</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="text-muted">
                    <th className="sticky left-0 bg-surface px-2 py-1 text-left font-medium">Year</th>
                    {model.years.map((y) => (
                      <th key={y} className="px-2 py-1 text-right font-medium">
                        {y}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((row) => (
                    <tr
                      key={row.label}
                      className={row.emphasis ? "border-t border-line/60 font-semibold" : ""}
                    >
                      <td className="sticky left-0 bg-surface px-2 py-1 text-left text-muted">
                        {row.label}
                      </td>
                      {row.values.map((v, t) => (
                        <td
                          key={t}
                          className={
                            "px-2 py-1 text-right " +
                            (row.check && Math.abs(v) >= 1 ? "text-warn" : "")
                          }
                        >
                          {row.check ? fmt(v) : t === 0 && s.title === "Cash flow" ? "—" : fmt(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {error && (
          <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
            {error}
          </div>
        )}
      </div>

      {/* Sticky actions */}
      <div className="border-t border-line bg-surface p-3">
        {!latest && (
          <p className="mb-2 text-center text-xs text-muted">
            Log a trade for {ticker} to save the model to its library. You can still download it.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={download}
            disabled={busy !== null}
          >
            <Download className="mr-2 h-5 w-5" />
            {busy === "download" ? "Building…" : "Download .xlsx"}
          </Button>
          <Button className="flex-1" onClick={saveToLibrary} disabled={busy !== null || !latest}>
            {saved ? (
              <>
                <Check className="mr-2 h-5 w-5" /> Saved
              </>
            ) : (
              <>
                <Save className="mr-2 h-5 w-5" />
                {busy === "save" ? "Saving…" : "Save to library"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function cnCheck(maxImbalance: number): string {
  const ok = maxImbalance < 1;
  return (
    "rounded-xl px-4 py-2 text-center text-sm font-medium " +
    (ok ? "bg-success/10 text-success" : "bg-warn/10 text-warn")
  );
}
