// Investor-relations document lister. Pulls a company's publicly released
// filings from SEC EDGAR (keyless) and, when FMP_API_KEY is configured, enriches
// with Financial Modeling Prep's SEC-filing feed. Pure parsers are exported so
// they can be unit-tested without network. Leading `_` keeps Vercel from routing
// this file as an endpoint.

export interface IrDoc {
  id: string;
  title: string;
  form: string | null;
  date: string; // YYYY-MM-DD
  url: string;
  source: "sec" | "fmp";
}

export interface IrResult {
  documents: IrDoc[];
  sources: { sec: boolean; fmp: boolean; fmpConfigured: boolean };
}

export const IR_MAX = 60;

const USER_AGENT =
  process.env.RESEARCH_USER_AGENT ?? "gym-tracker research (charlie@theglassmarket.co)";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

// Forms that read as investor-relations material; ownership/admin forms (Form 4,
// 13F, SC 13G, etc.) are dropped so the list stays decision-relevant.
const IR_FORMS = new Set([
  "10-K", "10-K/A", "10-Q", "10-Q/A", "8-K", "8-K/A",
  "20-F", "20-F/A", "40-F", "6-K", "ARS", "DEF 14A", "DEFA14A", "S-1", "424B4",
]);

// EDGAR's full ticker→CIK map is ~1 MB; cache it across warm invocations.
let tickerCache: { at: number; map: Map<string, string> } | null = null;

async function secCikFor(ticker: string): Promise<string | null> {
  const now = Date.now();
  if (!tickerCache || now - tickerCache.at > 6 * 3_600_000) {
    const res = await fetch(TICKERS_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`SEC ticker map ${res.status}`);
    const raw = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
    const map = new Map<string, string>();
    for (const k of Object.keys(raw)) {
      const e = raw[k];
      if (e?.ticker) map.set(e.ticker.toUpperCase(), String(e.cik_str).padStart(10, "0"));
    }
    tickerCache = { at: now, map };
  }
  return tickerCache.map.get(ticker.toUpperCase()) ?? null;
}

interface SecRecent {
  accessionNumber?: string[];
  form?: string[];
  filingDate?: string[];
  primaryDocument?: string[];
  primaryDocDescription?: string[];
}

// Turn an EDGAR submissions JSON into IR docs. `cik10` is the zero-padded CIK;
// the Archives path needs it un-padded.
export function parseSecSubmissions(json: unknown, cik10: string): IrDoc[] {
  const recent = (json as { filings?: { recent?: SecRecent } })?.filings?.recent;
  if (!recent?.accessionNumber) return [];
  const cikNum = String(Number(cik10));
  const {
    accessionNumber = [],
    form = [],
    filingDate = [],
    primaryDocument = [],
    primaryDocDescription = [],
  } = recent;
  const out: IrDoc[] = [];
  for (let i = 0; i < accessionNumber.length; i++) {
    const f = form[i];
    if (!f || !IR_FORMS.has(f)) continue;
    const acc = accessionNumber[i];
    const doc = primaryDocument[i];
    if (!acc || !doc) continue;
    const desc = (primaryDocDescription[i] ?? "").trim();
    out.push({
      id: `sec:${acc}`,
      title: desc && desc.toUpperCase() !== f ? `${f} — ${desc}` : f,
      form: f,
      date: filingDate[i] ?? "",
      url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc.replace(/-/g, "")}/${doc}`,
      source: "sec",
    });
  }
  return out;
}

// FMP's sec_filings rows. Only keep entries with a real link so every item is
// viewable/summarisable.
export function parseFmpFilings(rows: unknown): IrDoc[] {
  if (!Array.isArray(rows)) return [];
  const out: IrDoc[] = [];
  for (const r of rows as Array<Record<string, string>>) {
    const url = r.finalLink || r.link || "";
    const date = (r.acceptedDate || r.fillingDate || r.date || "").slice(0, 10);
    if (!url || !date) continue;
    const form = r.type || null;
    out.push({
      id: `fmp:${url}`,
      title: form ? `${form} (FMP)` : "SEC filing (FMP)",
      form,
      date,
      url,
      source: "fmp",
    });
  }
  return out;
}

function normUrl(u: string): string {
  return u.replace(/\/+$/, "").toLowerCase();
}

// Merge source lists newest-first, deduping by URL so an EDGAR filing and its
// FMP mirror collapse to one row (EDGAR wins — it's passed first).
export function mergeIrDocs(...lists: IrDoc[][]): IrDoc[] {
  const seen = new Set<string>();
  const out: IrDoc[] = [];
  for (const list of lists) {
    for (const d of list) {
      const key = d.url ? normUrl(d.url) : d.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out.slice(0, IR_MAX);
}

async function secDocuments(ticker: string): Promise<IrDoc[]> {
  const cik = await secCikFor(ticker);
  if (!cik) return [];
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SEC submissions ${res.status}`);
  return parseSecSubmissions(await res.json(), cik);
}

async function fmpDocuments(ticker: string, key: string): Promise<IrDoc[]> {
  const url =
    `https://financialmodelingprep.com/api/v3/sec_filings/${encodeURIComponent(ticker)}` +
    `?limit=${IR_MAX}&apikey=${key}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`FMP ${res.status}`);
  return parseFmpFilings(await res.json());
}

export async function listIrDocuments(ticker: string): Promise<IrResult> {
  const t = ticker.trim().toUpperCase();
  const fmpKey = process.env.FMP_API_KEY;
  const [secRes, fmpRes] = await Promise.allSettled([
    secDocuments(t),
    fmpKey ? fmpDocuments(t, fmpKey) : Promise.resolve<IrDoc[]>([]),
  ]);
  const sec = secRes.status === "fulfilled" ? secRes.value : [];
  const fmp = fmpRes.status === "fulfilled" ? fmpRes.value : [];
  return {
    documents: mergeIrDocs(sec, fmp),
    sources: {
      sec: secRes.status === "fulfilled",
      fmp: Boolean(fmpKey) && fmpRes.status === "fulfilled",
      fmpConfigured: Boolean(fmpKey),
    },
  };
}
