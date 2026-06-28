import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabase";
import type { StockDocument, TradeModel } from "@/lib/database.types";

const BUCKET = "share-images";

// Images live in a private Supabase Storage bucket; the trade row stores only
// the object path. Upload needs a connection — text writes stay offline-first,
// images attach when online.
export async function uploadTradeImages(files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${uuid()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

export async function signedImageUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data.signedUrl;
}

export async function signedImageUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error || !data) return [];
  return data.map((d) => d.signedUrl).filter((u): u is string => !!u);
}

// path -> signed URL, for rendering a mixed list of stored objects.
export async function signedUrlMap(paths: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, 3600);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const d of data) {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  }
  return map;
}

// Research documents (PDF/text/etc.) attached to a stock's general notes. Same
// private bucket as trade images; kept under a docs/ prefix with the original
// filename retained on the row so the library can show it.
export async function uploadStockDocuments(
  files: File[],
  addedBy: string | null,
): Promise<StockDocument[]> {
  const out: StockDocument[] = [];
  const addedAt = new Date().toISOString();
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `docs/${uuid()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw error;
    out.push({
      path,
      name: file.name,
      mediaType: file.type || "application/octet-stream",
      addedAt,
      addedBy,
    });
  }
  return out;
}

export async function removeStorageObject(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

// Upload generated PDF bytes (a clean base or a flattened annotated copy) under
// the docs/ prefix and return the object path. Used by the annotator, which
// produces bytes in-memory rather than from a file picker.
export async function uploadPdfBytes(bytes: Uint8Array): Promise<string> {
  const path = `docs/${uuid()}.pdf`;
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: "application/pdf", upsert: false });
  if (error) throw error;
  return path;
}

// Pull a stored document's bytes for editing. `signedUrlMap`/`signedImageUrl`
// give the URL; this fetches the body from our own bucket (CORS-permitted).
export async function fetchStoredPdf(path: string): Promise<Uint8Array> {
  const url = await signedImageUrl(path);
  if (!url) throw new Error("Could not sign document URL");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

// Pull a remote IR filing's PDF bytes through the serverless proxy (SEC/FMP
// block direct browser fetches). Non-PDF filings come back as a JSON error.
export async function fetchRemotePdf(url: string, token: string): Promise<Uint8Array> {
  const res = await fetch("/api/doc-proxy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    let msg = `Fetch failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* non-JSON body */
    }
    throw new Error(msg);
  }
  return new Uint8Array(await res.arrayBuffer());
}

// Uploaded spreadsheet models (.xlsx/.xls/.csv) attached to a trade. Same
// private bucket, under a models/ prefix; original filename kept on the row.
export async function uploadModelFiles(files: File[]): Promise<TradeModel[]> {
  const out: TradeModel[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "xlsx";
    const path = `models/${uuid()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw error;
    out.push({ kind: "file", name: file.name, url: null, path });
  }
  return out;
}
