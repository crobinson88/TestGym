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
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { useTradesForTicker } from "../hooks";
import { uploadModelFiles } from "../storage";
import { readUploadDoc, seedModelAssumptions, type SeededAssumptions, type UploadDoc } from "../research";
import {
  BASES,
  buildModel,
  defaultAssumptions,
  defaultSegment,
  marginLabel,
  toStatements,
  type ForecastBasis,
  type ModelAssumptions,
} from "../model/engine";
import { buildWorkbookBlob, downloadBlob, modelFileName } from "../model/excel";

interface SegDraft {
  name: string;
  baseRevenue: string;
  revenueGrowth: string; // percent
  margin: string; // percent
}

type ScalarKey =
  | "startYear"
  | "years"
  | "opexPctRevenue"
  | "daPctRevenue"
  | "taxRate"
  | "capexPctRevenue"
  | "dso"
  | "dio"
  | "dpo"
  | "interestRate"
  | "dividendPayout"
  | "startingCash"
  | "startingPpe"
  | "startingDebt";

type Draft = { basis: ForecastBasis; segments: SegDraft[] } & Record<ScalarKey, string>;

type Kind = "money" | "pct" | "int" | "year";

const PCT_SCALARS = new Set<ScalarKey>([
  "opexPctRevenue",
  "daPctRevenue",
  "taxRate",
  "capexPctRevenue",
  "interestRate",
  "dividendPayout",
]);

const SCALAR_GROUPS: { title: string; fields: { key: ScalarKey; label: string; kind: Kind }[] }[] = [
  {
    title: "Horizon",
    fields: [
      { key: "startYear", label: "Start year", kind: "year" },
      { key: "years", label: "Forecast years", kind: "int" },
    ],
  },
  {
    title: "Profitability & tax",
    fields: [
      { key: "opexPctRevenue", label: "Opex % of revenue", kind: "pct" }, // Gross Profit basis only
      { key: "daPctRevenue", label: "D&A % of revenue", kind: "pct" },
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

function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
const pct = (v: number) => String(round(v * 100, 4));

function toDraft(a: ModelAssumptions): Draft {
  return {
    basis: a.basis,
    segments: a.segments.map((s) => ({
      name: s.name,
      baseRevenue: String(s.baseRevenue),
      revenueGrowth: pct(s.revenueGrowth),
      margin: pct(s.margin),
    })),
    startYear: String(a.startYear),
    years: String(a.years),
    opexPctRevenue: pct(a.opexPctRevenue),
    daPctRevenue: pct(a.daPctRevenue),
    taxRate: pct(a.taxRate),
    capexPctRevenue: pct(a.capexPctRevenue),
    dso: String(a.dso),
    dio: String(a.dio),
    dpo: String(a.dpo),
    interestRate: pct(a.interestRate),
    dividendPayout: pct(a.dividendPayout),
    startingCash: String(a.startingCash),
    startingPpe: String(a.startingPpe),
    startingDebt: String(a.startingDebt),
  };
}

function parseDraft(d: Draft): ModelAssumptions {
  const base = defaultAssumptions();
  const num = (s: string, fallback: number) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : fallback;
  };
  const scalar = (k: ScalarKey, fallback: number) =>
    PCT_SCALARS.has(k) ? num(d[k], fallback * 100) / 100 : num(d[k], fallback);
  return {
    startYear: Math.round(num(d.startYear, base.startYear)),
    years: Math.min(10, Math.max(1, Math.round(num(d.years, base.years)))),
    basis: d.basis,
    segments: d.segments.map((s, i) => ({
      name: s.name.trim() || `Segment ${i + 1}`,
      baseRevenue: num(s.baseRevenue, 0),
      revenueGrowth: num(s.revenueGrowth, 0) / 100,
      margin: num(s.margin, 0) / 100,
    })),
    opexPctRevenue: scalar("opexPctRevenue", base.opexPctRevenue),
    daPctRevenue: scalar("daPctRevenue", base.daPctRevenue),
    taxRate: scalar("taxRate", base.taxRate),
    capexPctRevenue: scalar("capexPctRevenue", base.capexPctRevenue),
    dso: scalar("dso", base.dso),
    dio: scalar("dio", base.dio),
    dpo: scalar("dpo", base.dpo),
    interestRate: scalar("interestRate", base.interestRate),
    dividendPayout: scalar("dividendPayout", base.dividendPayout),
    startingCash: scalar("startingCash", base.startingCash),
    startingPpe: scalar("startingPpe", base.startingPpe),
    startingDebt: scalar("startingDebt", base.startingDebt),
  };
}

function fmt(n: number): string {
  const r = Math.round(n);
  if (Object.is(r, -0) || r === 0) return "0";
  return r < 0 ? `(${Math.abs(r).toLocaleString()})` : r.toLocaleString();
}

// The seeded margin to use depends on the chosen basis.
function seededMargin(s: SeededAssumptions, basis: ForecastBasis): number | null {
  if (basis === "gross_profit") return s.grossMargin;
  if (basis === "ebitda") return s.ebitdaMargin;
  return s.ebitMargin;
}

export default function ModelBuilder() {
  const { ticker: rawTicker } = useParams();
  const ticker = (rawTicker ?? "").toUpperCase();
  const navigate = useNavigate();
  const { session } = useAuth();
  const trades = useTradesForTicker(ticker);
  const latest = trades && trades.length > 0 ? trades[0] : null;

  const [draft, setDraft] = useState<Draft>(() => toDraft(defaultAssumptions()));
  const [busy, setBusy] = useState<null | "download" | "save">(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [seedUrls, setSeedUrls] = useState<string[]>([]);
  const [seedDocs, setSeedDocs] = useState<UploadDoc[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);

  const assumptions = useMemo(() => parseDraft(draft), [draft]);
  const model = useMemo(() => buildModel(assumptions), [assumptions]);
  const statements = useMemo(() => toStatements(model), [model]);
  const maxImbalance = useMemo(
    () => Math.max(...model.balanceCheck.map((v) => Math.abs(v))),
    [model],
  );

  function setScalar(k: ScalarKey, v: string) {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }
  function setBasis(basis: ForecastBasis) {
    setDraft((prev) => ({ ...prev, basis }));
  }
  function setSeg(i: number, patch: Partial<SegDraft>) {
    setDraft((prev) => ({
      ...prev,
      segments: prev.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    }));
  }
  function addSegment() {
    const s = defaultSegment(`Segment ${draft.segments.length + 1}`, 0);
    setDraft((prev) => ({
      ...prev,
      segments: [
        ...prev.segments,
        { name: s.name, baseRevenue: "0", revenueGrowth: pct(s.revenueGrowth), margin: pct(s.margin) },
      ],
    }));
  }
  function removeSegment(i: number) {
    setDraft((prev) => ({ ...prev, segments: prev.segments.filter((_, j) => j !== i) }));
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
    } catch {
      setError("Couldn't upload the model — check your connection. You can still download it.");
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
      const s = await seedModelAssumptions({ ticker, urls, files: seedDocs }, token);
      setDraft((prev) => {
        const next = { ...prev };
        // Scalars
        const apply = (k: ScalarKey, v: number | null) => {
          if (typeof v === "number" && Number.isFinite(v)) {
            next[k] = PCT_SCALARS.has(k) ? pct(v) : String(v);
          }
        };
        apply("opexPctRevenue", s.opexPctRevenue);
        apply("daPctRevenue", s.daPctRevenue);
        apply("taxRate", s.taxRate);
        apply("capexPctRevenue", s.capexPctRevenue);
        apply("dso", s.dso);
        apply("dio", s.dio);
        apply("dpo", s.dpo);
        apply("interestRate", s.interestRate);
        apply("dividendPayout", s.dividendPayout);
        apply("startingCash", s.startingCash);
        apply("startingPpe", s.startingPpe);
        apply("startingDebt", s.startingDebt);
        // First segment from the consolidated figures Claude found.
        const margin = seededMargin(s, prev.basis);
        const seg = { ...prev.segments[0] };
        if (typeof s.baseRevenue === "number") seg.baseRevenue = String(s.baseRevenue);
        if (typeof s.revenueGrowth === "number") seg.revenueGrowth = pct(s.revenueGrowth);
        if (typeof margin === "number") seg.margin = pct(margin);
        next.segments = prev.segments.map((x, i) => (i === 0 ? seg : x));
        return next;
      });
      setRationale(s.rationale ?? null);
    } catch (e) {
      setSeedError(e instanceof Error ? e.message : "Seeding failed");
    } finally {
      setSeeding(false);
    }
  }

  const seedSources = seedUrls.filter((u) => u.trim()).length + seedDocs.length;
  const marginLbl = marginLabel(draft.basis);

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
            Add a 10-K / annual report and Claude proposes the drivers below. It fills the first
            segment plus the consolidated assumptions — edit anything before exporting.
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

        {/* Basis + segments */}
        <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-xs uppercase tracking-wider text-muted">Forecast basis</h2>
          <div className="grid grid-cols-3 gap-2">
            {BASES.map((b) => (
              <button
                key={b.value}
                onClick={() => setBasis(b.value)}
                className={cn(
                  "h-12 rounded-xl border text-sm font-semibold transition active:scale-[0.98]",
                  draft.basis === b.value
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-line bg-surface text-muted",
                )}
              >
                {b.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            Forecast each segment by revenue and its {marginLbl.toLowerCase()}. Segments sum to a
            consolidated P&L.
          </p>

          {draft.segments.map((s, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-line bg-surface2 p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={s.name}
                  onChange={(e) => setSeg(i, { name: e.target.value })}
                  placeholder={`Segment ${i + 1}`}
                />
                <button
                  onClick={() => removeSegment(i)}
                  disabled={draft.segments.length <= 1}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-surface disabled:opacity-30"
                  aria-label="Remove segment"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Labeled label="Base revenue">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={s.baseRevenue}
                    onChange={(e) => setSeg(i, { baseRevenue: e.target.value })}
                  />
                </Labeled>
                <Labeled label="Growth (%)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={s.revenueGrowth}
                    onChange={(e) => setSeg(i, { revenueGrowth: e.target.value })}
                  />
                </Labeled>
                <Labeled label={`${marginLbl} (%)`}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={s.margin}
                    onChange={(e) => setSeg(i, { margin: e.target.value })}
                  />
                </Labeled>
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addSegment} className="w-full">
            <Plus className="mr-1 h-4 w-4" /> Add segment
          </Button>
        </section>

        {/* Consolidated assumptions */}
        {SCALAR_GROUPS.map((group) => (
          <section key={group.title} className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <h2 className="text-xs uppercase tracking-wider text-muted">{group.title}</h2>
            <div className="grid grid-cols-2 gap-3">
              {group.fields
                .filter((f) => f.key !== "opexPctRevenue" || draft.basis === "gross_profit")
                .map((f) => (
                  <Labeled key={f.key} label={`${f.label}${f.kind === "pct" ? " (%)" : ""}`}>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={draft[f.key]}
                      onChange={(e) => setScalar(f.key, e.target.value)}
                    />
                  </Labeled>
                ))}
            </div>
          </section>
        ))}

        {/* Live preview */}
        <div className={cnCheck(maxImbalance)}>
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
          <Button variant="secondary" className="flex-1" onClick={download} disabled={busy !== null}>
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

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}

function cnCheck(maxImbalance: number): string {
  const ok = maxImbalance < 1;
  return (
    "rounded-xl px-4 py-2 text-center text-sm font-medium " +
    (ok ? "bg-success/10 text-success" : "bg-warn/10 text-warn")
  );
}
