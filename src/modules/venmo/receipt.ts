// Client side of receipt scanning: downscale the photo, POST it to the OCR
// endpoint, and hand back the parsed line items.

export interface ScannedItem {
  name: string;
  amount: number;
}

export interface ScannedReceipt {
  merchant: string | null;
  items: ScannedItem[];
  tax: number | null;
  tip: number | null;
  total: number | null;
}

// Phone cameras shoot multi-megapixel images; a receipt stays legible well
// below that. Cap the long edge and re-encode as JPEG to keep the upload small
// and the vision call fast.
const MAX_EDGE = 1600;
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

export async function scanReceipt(file: File, token: string): Promise<ScannedReceipt> {
  const { data, mediaType } = await downscale(file);

  const res = await fetch("/api/receipt-scan", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: data, mediaType }),
  });

  const text = await res.text();
  let parsed: (Partial<ScannedReceipt> & { error?: string }) | null;
  try {
    parsed = JSON.parse(text) as Partial<ScannedReceipt> & { error?: string };
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed) {
    const detail = parsed?.error ?? text.trim().slice(0, 140);
    throw new Error(detail ? `Scan failed (${res.status}): ${detail}` : `Scan failed (${res.status})`);
  }

  return {
    merchant: parsed.merchant ?? null,
    items: parsed.items ?? [],
    tax: parsed.tax ?? null,
    tip: parsed.tip ?? null,
    total: parsed.total ?? null,
  };
}
