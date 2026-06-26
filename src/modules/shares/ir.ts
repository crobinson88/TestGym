// Client side of the investor-relations document list: call the serverless
// lister and stash the result in the local-only `ir_cache` Dexie table so the
// list survives navigation/reloads without any cloud round-trip.
import { db, type IrCacheDoc } from "@/lib/db";

export type IrDocument = IrCacheDoc;

export interface IrSources {
  sec: boolean;
  fmp: boolean;
  fmpConfigured: boolean;
}

export interface IrListResult {
  documents: IrDocument[];
  sources: IrSources;
}

export async function fetchIrDocuments(ticker: string, token: string): Promise<IrListResult> {
  const res = await fetch("/api/ir-documents", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ticker }),
  });
  const text = await res.text();
  let parsed: { documents?: IrDocument[]; sources?: IrSources; error?: string } | null;
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    parsed = null;
  }
  if (!res.ok || !parsed || parsed.error || !parsed.sources) {
    throw new Error(parsed?.error ?? `IR lookup failed (${res.status})`);
  }
  return { documents: parsed.documents ?? [], sources: parsed.sources };
}

export async function cacheIrDocuments(ticker: string, documents: IrDocument[]): Promise<void> {
  await db.ir_cache.put({
    ticker: ticker.toUpperCase(),
    documents,
    refreshed_at: new Date().toISOString(),
  });
}

const SOURCE_LABEL: Record<IrDocument["source"], string> = { sec: "SEC EDGAR", fmp: "FMP" };

export function sourceLabel(source: IrDocument["source"]): string {
  return SOURCE_LABEL[source];
}

export function formatIrDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
