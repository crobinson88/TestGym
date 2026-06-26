import { useState } from "react";
import { Building2, Check, Copy, ExternalLink, FileText, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import {
  cacheIrDocuments,
  fetchIrDocuments,
  formatIrDate,
  sourceLabel,
  type IrDocument,
  type IrSources,
} from "../ir";
import { summarizeDocuments } from "../research";
import { useIrCache } from "../hooks";

const summarisePrompt = (ticker: string, title: string) =>
  `Summarise this ${ticker} document ("${title}") for an investment decision. ` +
  `Lead with the single most important takeaway, then concise bullets on financials ` +
  `(revenue, margins, cash flow), guidance/outlook, and any material risks. ` +
  `Ground every claim in the document.`;

export function IrDocuments({
  ticker,
  onInsert,
}: {
  ticker: string;
  onInsert: (text: string) => void;
}) {
  const { session } = useAuth();
  const cache = useIrCache(ticker);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<IrSources | null>(null);

  // Per-document summary state, keyed by doc id.
  const [busyId, setBusyId] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, string>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const docs = cache?.documents ?? [];

  async function refresh() {
    const token = session?.access_token;
    if (!token || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const out = await fetchIrDocuments(ticker, token);
      setSources(out.sources);
      await cacheIrDocuments(ticker, out.documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  async function summarise(doc: IrDocument) {
    const token = session?.access_token;
    if (!token || busyId || !doc.url) return;
    setBusyId(doc.id);
    setError(null);
    try {
      const out = await summarizeDocuments(
        { prompt: summarisePrompt(ticker, doc.title), ticker, urls: [doc.url], files: [] },
        token,
      );
      setSummaries((p) => ({ ...p, [doc.id]: out }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summarise failed");
    } finally {
      setBusyId(null);
    }
  }

  async function copy(id: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-accent" />
          <h2 className="text-base font-semibold">Investor relations</h2>
        </div>
        <Button size="sm" variant="secondary" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {cache?.refreshed_at && (
        <p className="text-xs text-muted">
          Updated {formatIrDate(cache.refreshed_at)}
          {sources && ` · ${sourceLabel("sec")}${sources.fmp ? " + FMP" : ""}`}
        </p>
      )}

      {error && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {error}
        </div>
      )}

      {docs.length > 0 ? (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li key={doc.id} className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 flex-1 items-start gap-2"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text">{doc.title}</span>
                    <span className="block text-xs text-muted">
                      {formatIrDate(doc.date)}
                      {doc.form && ` · ${doc.form}`} · {sourceLabel(doc.source)}
                    </span>
                  </span>
                </a>
                <div className="flex shrink-0 items-center gap-1">
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-text"
                    aria-label="View document"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <button
                    onClick={() => summarise(doc)}
                    disabled={busyId !== null}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-accent hover:bg-surface disabled:opacity-40"
                    aria-label="Summarise with Claude"
                  >
                    <Sparkles className={`h-4 w-4 ${busyId === doc.id ? "animate-pulse" : ""}`} />
                  </button>
                </div>
              </div>

              {summaries[doc.id] && (
                <div className="mt-2 space-y-2">
                  <div className="whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 text-sm">
                    {summaries[doc.id]}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => copy(doc.id, summaries[doc.id])}
                    >
                      {copiedId === doc.id ? (
                        <Check className="mr-1 h-4 w-4" />
                      ) : (
                        <Copy className="mr-1 h-4 w-4" />
                      )}
                      {copiedId === doc.id ? "Copied" : "Copy"}
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => onInsert(summaries[doc.id])}>
                      <Plus className="mr-1 h-4 w-4" /> Append to notes
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-line bg-surface2 px-4 py-6 text-center text-sm text-muted">
          {cache === undefined
            ? "Loading…"
            : cache === null
              ? `Tap Refresh to pull ${ticker}'s public filings from SEC EDGAR.`
              : `No filings found for ${ticker}. SEC EDGAR covers US-listed companies.`}
        </p>
      )}
    </section>
  );
}
