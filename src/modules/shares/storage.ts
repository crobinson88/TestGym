import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabase";
import type { StockDocument } from "@/lib/database.types";

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
