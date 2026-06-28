import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { syncEngine } from "@/lib/sync";
import type { DocAnnotation, StockDocument } from "@/lib/database.types";
import { useStockByTicker } from "../hooks";
import {
  fetchRemotePdf,
  fetchStoredPdf,
  removeStorageObject,
  uploadPdfBytes,
} from "../storage";
import { flattenPdf } from "../annotate/flatten";
import { PdfAnnotator } from "../annotate/PdfAnnotator";

// Annotator host. Two entry points, both via query params:
//   ?src=doc&doc=<path>            — edit a PDF already in the research library
//   ?src=ir&url=<url>&title=<t>    — annotate a remote IR filing, save a new copy
export default function AnnotateDoc() {
  const { ticker: rawTicker } = useParams();
  const ticker = (rawTicker ?? "").toUpperCase();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { session } = useAuth();
  const stock = useStockByTicker(ticker);

  const src = params.get("src");
  const docPath = params.get("doc") ?? "";
  const url = params.get("url") ?? "";
  const title = params.get("title") || (src === "doc" ? "Document" : "IR filing");

  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const back = `/shares/stock/${encodeURIComponent(ticker)}`;

  // The library document being edited (if any), matched by base path.
  const existing = useMemo<StockDocument | undefined>(
    () => (stock?.documents ?? []).find((d) => d.path === docPath) as StockDocument | undefined,
    [stock, docPath],
  );

  // Load once. `loadedFor` guards against the live `stock` query retriggering it.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = `${src}|${docPath}|${url}`;
    if (loadedFor.current === key) return;
    if (src === "doc" && !docPath) return;
    if (src === "ir" && (!url || !session?.access_token)) return;
    loadedFor.current = key;
    setBytes(null);
    setLoadError(null);
    const job =
      src === "ir"
        ? fetchRemotePdf(url, session!.access_token)
        : fetchStoredPdf(docPath);
    job
      .then(setBytes)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not open document"));
  }, [src, docPath, url, session]);

  async function handleSave(annotations: DocAnnotation[]) {
    if (!bytes) return;
    setSaving(true);
    try {
      const flat = await flattenPdf(bytes, annotations);
      const flatPath = await uploadPdfBytes(flat);
      const s = await syncEngine.mutations.ensureStock(ticker, stock?.name ?? null);
      const addedBy = session?.user?.email ?? null;
      const docs = (s.documents ?? []) as StockDocument[];

      if (src === "doc" && existing) {
        const oldFlat = existing.flatPath;
        const next = docs.map((d) =>
          d.path === docPath ? { ...d, annotations, flatPath } : d,
        );
        await syncEngine.mutations.updateStock(s.id, { documents: next });
        if (oldFlat && oldFlat !== flatPath) void removeStorageObject(oldFlat);
      } else {
        // Persist the clean base so re-editing starts from un-burned bytes.
        const basePath = src === "doc" ? docPath : await uploadPdfBytes(bytes);
        const entry: StockDocument = {
          path: basePath,
          name: `${title} (annotated)`,
          mediaType: "application/pdf",
          addedAt: new Date().toISOString(),
          addedBy,
          annotations,
          flatPath,
          annotatedFrom: src === "ir" ? `ir:${url}` : docPath,
        };
        await syncEngine.mutations.updateStock(s.id, { documents: [...docs, entry] });
      }
      navigate(back);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg p-6">
        <p className="max-w-sm text-center text-sm text-warn">{loadError}</p>
        <button onClick={() => navigate(back)} className="text-sm text-accent underline">
          Back to {ticker}
        </button>
      </div>
    );
  }

  // For an existing library doc, wait for the stock (Dexie, fast) so the saved
  // annotations are in hand before the annotator seeds its state once.
  const waitingForStock = src === "doc" && stock === undefined;
  if (!bytes || waitingForStock) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg">
        <p className="text-sm text-muted">Opening document…</p>
      </div>
    );
  }

  return (
    <PdfAnnotator
      bytes={bytes}
      initialAnnotations={(existing?.annotations ?? []) as DocAnnotation[]}
      title={title}
      addedBy={session?.user?.email ?? null}
      saving={saving}
      onSave={handleSave}
      onCancel={() => navigate(back)}
    />
  );
}
