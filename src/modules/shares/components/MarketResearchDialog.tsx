import { useState } from "react";
import { v4 as uuid } from "uuid";
import { Check, Copy, ExternalLink, FilePlus2, Library, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";
import { indexLabel } from "../markets";
import { validateMarketNote, type MarketValidateSource } from "../research";
import type { LocalMarketNote } from "@/lib/db";
import type { MarketNoteResearch } from "@/lib/database.types";

// Seed prompt the user can edit before launching. Frames the note as a thesis
// to pressure-test with current data.
function defaultPrompt(note: LocalMarketNote): string {
  const tags = note.indices.map(indexLabel).join(", ") || "the markets";
  return (
    `Validate this market thesis on ${tags} using current data and news:\n\n` +
    `"${note.body.trim()}"\n\n` +
    `Assess whether it holds up: the strongest supporting evidence, the strongest ` +
    `counter-evidence, the key risks to watch, and a one-line verdict.`
  );
}

export function MarketResearchDialog({
  note,
  onClose,
}: {
  note: LocalMarketNote;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const [prompt, setPrompt] = useState(() => defaultPrompt(note));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [sources, setSources] = useState<MarketValidateSource[]>([]);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [appended, setAppended] = useState(false);

  async function run() {
    const token = session?.access_token;
    if (!token || loading || !prompt.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    setAppended(false);
    try {
      const out = await validateMarketNote(
        { prompt, note: note.body, indices: note.indices },
        token,
      );
      setResult(out.result);
      setSources(out.sources);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveToResearch() {
    if (!result || saved) return;
    const entry: MarketNoteResearch = {
      id: uuid(),
      prompt: prompt.trim(),
      result,
      sources,
      created_at: new Date().toISOString(),
    };
    await syncEngine.mutations.addMarketNoteResearch(note.id, entry);
    setSaved(true);
  }

  async function appendToNote() {
    if (!result || appended) return;
    const body = `${note.body.trim()}\n\n— AI research —\n${result.trim()}`;
    await syncEngine.mutations.updateMarketNote(note.id, { body });
    setAppended(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-accent" />
            <h2 className="text-base font-semibold">Validate with research</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:bg-surface2 hover:text-text"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-wide text-muted">Prompt</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <Button onClick={run} className="w-full" disabled={loading || !prompt.trim()}>
            {loading ? (
              "Researching…"
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" /> {result ? "Re-run research" : "Launch research"}
              </>
            )}
          </Button>

          {error && (
            <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div className="whitespace-pre-wrap rounded-xl border border-line bg-surface2 px-4 py-3 text-sm text-text">
                {result}
              </div>

              {sources.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs uppercase tracking-wide text-muted">Sources</span>
                  <ul className="space-y-1">
                    {sources.map((s) => (
                      <li key={s.url}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 text-sm text-accent"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{s.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {result && (
          <footer className="grid grid-cols-3 gap-2 border-t border-line p-4">
            <Button variant="secondary" size="sm" onClick={copy}>
              {copied ? <Check className="mr-1 h-4 w-4" /> : <Copy className="mr-1 h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="secondary" size="sm" onClick={saveToResearch} disabled={saved}>
              {saved ? <Check className="mr-1 h-4 w-4" /> : <Library className="mr-1 h-4 w-4" />}
              {saved ? "Saved" : "Research"}
            </Button>
            <Button size="sm" onClick={appendToNote} disabled={appended}>
              {appended ? <Check className="mr-1 h-4 w-4" /> : <FilePlus2 className="mr-1 h-4 w-4" />}
              {appended ? "Added" : "To note"}
            </Button>
          </footer>
        )}
      </div>
    </div>
  );
}
