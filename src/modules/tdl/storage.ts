import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabase";

// Detail-panel images share the same private bucket as trade images, kept under
// a tdl/ prefix. The item row stores only the object path; uploads need a
// connection (text writes stay offline-first, images attach when online).
const BUCKET = "share-images";

export async function uploadTdlImages(files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `tdl/${uuid()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

// path -> signed URL, for rendering the stored objects.
export async function tdlSignedUrlMap(paths: string[]): Promise<Record<string, string>> {
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

export async function removeTdlImage(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
