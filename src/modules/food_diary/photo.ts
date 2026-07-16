// Client side of AI food estimation: downscale the photo, POST it to the
// vision endpoint, and hand back the estimated macros to prefill an entry.

export interface FoodEstimate {
  name: string;
  calories: number;
  protein: number;
  confidence: number;
  error: string | null;
}

// Phone cameras shoot multi-megapixel images; food stays recognisable well
// below that. Cap the long edge and re-encode as JPEG to keep the upload small
// and the vision call fast.
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.85;

async function downscale(file: File): Promise<{ data: string; mediaType: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { data, mediaType: "image/jpeg" };
}

export async function estimateFoodPhoto(
  file: File,
  token: string,
  note?: string,
): Promise<FoodEstimate> {
  const { data, mediaType } = await downscale(file);

  // Shares the receipt-scan function (kind:"food") to stay within Vercel's
  // Serverless-Function budget — see api/receipt-scan.ts.
  const res = await fetch("/api/receipt-scan", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: data, mediaType, kind: "food", note: note?.trim() || undefined }),
  });

  const text = await res.text();
  let parsed: (Partial<FoodEstimate> & { error?: string }) | null;
  try {
    parsed = JSON.parse(text) as Partial<FoodEstimate> & { error?: string };
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed) {
    const detail = parsed?.error ?? text.trim().slice(0, 140);
    throw new Error(
      detail ? `Estimate failed (${res.status}): ${detail}` : `Estimate failed (${res.status})`,
    );
  }

  return {
    name: parsed.name ?? "",
    calories: parsed.calories ?? 0,
    protein: parsed.protein ?? 0,
    confidence: parsed.confidence ?? 0,
    error: parsed.error ?? null,
  };
}
