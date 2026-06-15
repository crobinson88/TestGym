import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FileText, ImageIcon, Library, Link2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";
import type { LocalShareTrade, LocalStock } from "@/lib/db";
import type { StockDocument, StockLink } from "@/lib/database.types";
import { removeStorageObject, signedUrlMap, uploadStockDocuments } from "../storage";

type StockPatch = Partial<Pick<LocalStock, "links" | "documents">>;

// Tolerate rows written before links/documents carried provenance (plain URL
// strings / docs without addedAt/addedBy); any write upgrades them to the
// richer shape.
function normLink(l: unknown): StockLink {
  if (typeof l === "string") return { url: l, addedAt: "", addedBy: null };
  const o = (l ?? {}) as Partial<StockLink>;
  return { url: o.url ?? "", addedAt: o.addedAt ?? "", addedBy: o.addedBy ?? null };
}

function normDoc(d: unknown): StockDocument {
  const o = (d ?? {}) as Partial<StockDocument>;
  return {
    path: o.path ?? "",
    name: o.name ?? "Document",
    mediaType: o.mediaType ?? "application/octet-stream",
    addedAt: o.addedAt ?? "",
    addedBy: o.addedBy ?? null,
  };
}

export function ResearchLibrary({
  ticker,
  stock,
  trades,
}: {
  ticker: string;
  stock: LocalStock | null | undefined;
  trades: LocalShareTrade[] | undefined;
}) {
  const { session } = useAuth();
  const uploadedBy = session?.user?.email ?? "";
  const [newLink, setNewLink] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});

  const links = (stock?.links ?? []).map(normLink);
  const documents = (stock?.documents ?? []).map(normDoc);

  const tradeLinks = useMemo(() => {
    const out: { url: string; trade: LocalShareTrade }[] = [];
    for (const t of trades ?? []) for (const l of t.links ?? []) out.push({ url: l, trade: t });
    return out;
  }, [trades]);

  const tradeImages = useMemo(() => {
    const out: { path: string; trade: LocalShareTrade }[] = [];
    for (const t of trades ?? []) for (const p of t.images ?? []) out.push({ path: p, trade: t });
    return out;
  }, [trades]);

  // Sign every stored object (stock docs + trade images) in one batch.
  const allPaths = useMemo(
    () => [...documents.map((d) => d.path), ...tradeImages.map((i) => i.path)],
    [documents, tradeImages],
  );
  const pathKey = allPaths.join("|");
  useEffect(() => {
    let active = true;
    if (allPaths.length === 0) {
      setUrls({});
      return;
    }
    void signedUrlMap(allPaths).then((m) => {
      if (active) setUrls(m);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  async function persist(patch: StockPatch) {
    setBusy(true);
    try {
      const s = await syncEngine.mutations.ensureStock(ticker, stock?.name ?? null);
      await syncEngine.mutations.updateStock(s.id, patch);
    } finally {
      setBusy(false);
    }
  }

  async function addLink() {
    const url = newLink.trim();
    if (!url) return;
    const entry: StockLink = { url, addedAt: new Date().toISOString(), addedBy: uploadedBy || null };
    await persist({ links: [...links, entry] });
    setNewLink("");
  }

  async function removeLink(i: number) {
    await persist({ links: links.filter((_, j) => j !== i) });
  }

  async function uploadDocs(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const uploaded = await uploadStockDocuments(Array.from(files), uploadedBy || null);
      await persist({ documents: [...documents, ...uploaded] });
    } catch {
      setError("Upload failed — documents need a connection.");
    } finally {
      setUploading(false);
    }
  }

  async function removeDoc(doc: StockDocument) {
    await persist({ documents: documents.filter((d) => d.path !== doc.path) });
    void removeStorageObject(doc.path);
  }

  const empty =
    links.length === 0 && documents.length === 0 && tradeLinks.length === 0 && tradeImages.length === 0;

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Library className="h-5 w-5 text-accent" />
        <h2 className="text-base font-semibold">Research library</h2>
      </div>

      <div className="space-y-2">
        <span className="text-xs uppercase tracking-wide text-muted">General notes · links</span>
        {links.map((link, i) => (
          <Row key={`${link.url}-${i}`} onRemove={() => removeLink(i)} disabled={busy}>
            <div className="flex items-center justify-between gap-2">
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-accent"
              >
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{link.url}</span>
              </a>
              <Provenance at={link.addedAt} by={link.addedBy} />
            </div>
          </Row>
        ))}
        <div className="flex items-center gap-2">
          <Input
            type="url"
            inputMode="url"
            value={newLink}
            onChange={(e) => setNewLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addLink();
            }}
            placeholder="https://www.sec.gov/…"
          />
          <Button size="sm" onClick={addLink} disabled={busy || !newLink.trim()}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-xs uppercase tracking-wide text-muted">General notes · documents</span>
        {documents.map((doc) => (
          <Row key={doc.path} onRemove={() => removeDoc(doc)} disabled={busy}>
            <div className="flex items-center justify-between gap-2">
              <a
                href={urls[doc.path]}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2"
                aria-disabled={!urls[doc.path]}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted" />
                <span className="truncate">{doc.name}</span>
              </a>
              <Provenance at={doc.addedAt} by={doc.addedBy} />
            </div>
          </Row>
        ))}
        <label className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-surface2 text-sm font-medium text-text transition active:scale-[0.98]">
          <Upload className="h-4 w-4 text-accent" />
          {uploading ? "Uploading…" : "Upload document"}
          <input
            type="file"
            accept="application/pdf,text/plain,.txt,.md,.pdf,image/*"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              void uploadDocs(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {(tradeLinks.length > 0 || tradeImages.length > 0) && (
        <div className="space-y-2">
          <span className="text-xs uppercase tracking-wide text-muted">From your trades</span>
          {tradeLinks.map(({ url, trade }, i) => (
            <div
              key={`tl-${i}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm"
            >
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2 text-accent"
              >
                <Link2 className="h-4 w-4 shrink-0" />
                <span className="truncate">{url}</span>
              </a>
              <TradeTag trade={trade} who={uploadedBy} />
            </div>
          ))}
          {tradeImages.map(({ path, trade }, i) => (
            <div
              key={`ti-${i}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm"
            >
              <a
                href={urls[path]}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center gap-2"
                aria-disabled={!urls[path]}
              >
                <ImageIcon className="h-4 w-4 shrink-0 text-muted" />
                <span className="truncate">Image</span>
                {urls[path] && <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" />}
              </a>
              <TradeTag trade={trade} who={uploadedBy} />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
          {error}
        </div>
      )}

      {empty && (
        <p className="text-center text-sm text-muted">
          No research yet. Add a link or upload a document above, or attach links/images to a trade.
        </p>
      )}
    </section>
  );
}

function Row({
  children,
  onRemove,
  disabled,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface2 px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0 text-muted hover:text-text disabled:opacity-50"
        aria-label="Remove"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function uploadDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function Provenance({ at, by }: { at: string; by: string | null }) {
  if (!at && !by) return null;
  return (
    <div className="flex shrink-0 flex-col items-end text-right text-[11px] text-muted/80">
      {at && <span className="whitespace-nowrap">{uploadDate(at)}</span>}
      {by && <span className="max-w-[140px] truncate">{by}</span>}
    </div>
  );
}

function TradeTag({ trade, who }: { trade: LocalShareTrade; who: string }) {
  return (
    <Link
      to={`/shares/${trade.id}`}
      className="flex max-w-[42%] shrink-0 flex-col items-end text-right text-xs"
    >
      <span className="whitespace-nowrap rounded-full bg-surface px-2 py-0.5 capitalize text-muted">
        {trade.side} · {uploadDate(trade.created_at)}
      </span>
      {who && <span className="mt-0.5 truncate text-[11px] text-muted/80">{who}</span>}
    </Link>
  );
}
