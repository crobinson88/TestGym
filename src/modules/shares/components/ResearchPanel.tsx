import { useState } from "react";
import { Check, Copy, FileText, Link2, Plus, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { readUploadDoc, summarizeDocuments, type UploadDoc } from "../research";

const defaultPrompt = (ticker: string) =>
  `Summarise the key takeaways from these documents for an investment decision on ${ticker}. ` +
  `Cover: business overview, recent financial performance (revenue, margins, cash flow), ` +
  `guidance/outlook, balance-sheet health, and the main risks. Use concise bullet points and ` +
  `flag anything material to a buy or sell.`;

export function ResearchPanel({
  ticker,
  onInsert,
}: {
  ticker: string;
  onInsert: (text: string) => void;
}) {
  const { session } = useAuth();
  const [urls, setUrls] = useState<string[]>([]);
  const [docs, setDocs] = useState<UploadDoc[]>([]);
  const [prompt, setPrompt] = useState(defaultPrompt(ticker));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const sourceCount = urls.filter((u) => u.trim()).length + docs.length;

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const read = await Promise.all(Array.from(files).map(readUploadDoc));
    setDocs((prev) => [...prev, ...read]);
  }

  async function run() {
    const token = session?.access_token;
    if (!token || loading || sourceCount === 0 || !prompt.trim()) return;
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      const out = await summarizeDocuments(
        { prompt, ticker, urls: urls.map((u) => u.trim()).filter(Boolean), files: docs },
        token,
      );
      setSummary(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Summarize failed");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!summary) return;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-accent" />
        <h2 className="text-base font-semibold">Research with Claude</h2>
      </div>

      <div className="space-y-2">
        <span className="text-xs uppercase tracking-wide text-muted">Document links</span>
        {urls.map((url, i) => (
          <div key={i} className="flex items-center gap-2">
            <Link2 className="h-4 w-4 shrink-0 text-muted" />
            <Input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrls((p) => p.map((u, j) => (j === i ? e.target.value : u)))}
              placeholder="https://www.sec.gov/…  or  annual report URL"
            />
            <button
              onClick={() => setUrls((p) => p.filter((_, j) => j !== i))}
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
          onClick={() => setUrls((p) => [...p, ""])}
          className="w-full"
        >
          <Plus className="mr-1 h-4 w-4" /> Add link
        </Button>
      </div>

      <div className="space-y-2">
        <span className="text-xs uppercase tracking-wide text-muted">Uploaded documents</span>
        {docs.length > 0 && (
          <ul className="space-y-1">
            {docs.map((d, i) => (
              <li
                key={`${d.name}-${i}`}
                className="flex items-center justify-between rounded-xl border border-line bg-surface2 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted" />
                  <span className="truncate">{d.name}</span>
                </span>
                <button
                  onClick={() => setDocs((p) => p.filter((_, j) => j !== i))}
                  className="text-muted hover:text-text"
                  aria-label="Remove document"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface2 text-sm font-medium text-text transition active:scale-[0.98]">
          <Upload className="h-4 w-4 text-accent" />
          Upload PDF / text
          <input
            type="file"
            accept="application/pdf,text/plain,.txt,.md,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-xs uppercase tracking-wide text-muted">Prompt</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </label>

      <Button onClick={run} className="w-full" disabled={loading || sourceCount === 0}>
        {loading ? (
          "Summarising…"
        ) : (
          <>
            <Sparkles className="mr-2 h-5 w-5" /> Summarise {sourceCount > 0 ? `(${sourceCount})` : ""}
          </>
        )}
      </Button>

      {error && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {error}
        </div>
      )}

      {summary && (
        <div className="space-y-2">
          <div className="whitespace-pre-wrap rounded-xl border border-line bg-surface2 px-4 py-3 text-sm">
            {summary}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={copy}>
              {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" className="flex-1" onClick={() => onInsert(summary)}>
              <Plus className="mr-1 h-4 w-4" /> Append to notes
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
