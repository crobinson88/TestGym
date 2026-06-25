// Client side of door assessment: downscale the photo, POST it to the vision
// endpoint, and hand back the parsed inspection. Mirrors venmo/receipt.ts.

export type CriterionStatus = "pass" | "marginal" | "fail" | "unknown";
export type CriterionKey = "plumb" | "level" | "square" | "bow";

export interface Criterion {
  deviation: number | null;
  unit: "mm" | "deg" | null;
  tolerance: number | null;
  status: CriterionStatus;
  detail: string;
}

export interface DoorAssessment {
  assessable: boolean;
  reason: string | null;
  doorType: string | null;
  confidence: "low" | "medium" | "high";
  plumb: Criterion;
  level: Criterion;
  square: Criterion;
  bow: Criterion;
  summary: string;
  recommendations: string[];
}

// Human-facing label + the criterion this row reports on.
export const CRITERIA: { key: CriterionKey; label: string; blurb: string }[] = [
  { key: "plumb", label: "Plumb", blurb: "Vertical stiles / jambs true" },
  { key: "level", label: "Level", blurb: "Head & sill horizontal" },
  { key: "square", label: "Square", blurb: "Diagonals corner-to-corner equal" },
  { key: "bow", label: "Bow", blurb: "Panel face flat, not warped" },
];

// Phone cameras shoot multi-megapixel images; geometric cues survive a downscale
// fine. Cap the long edge and re-encode as JPEG to keep the upload small and the
// vision call fast.
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

export async function assessDoor(file: File, token: string): Promise<DoorAssessment> {
  const { data, mediaType } = await downscale(file);

  const res = await fetch("/api/door-assess", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: data, mediaType }),
  });

  const text = await res.text();
  let parsed: (Partial<DoorAssessment> & { error?: string }) | null;
  try {
    parsed = JSON.parse(text) as Partial<DoorAssessment> & { error?: string };
  } catch {
    parsed = null;
  }

  if (!res.ok || !parsed) {
    const detail = parsed?.error ?? text.trim().slice(0, 140);
    throw new Error(
      detail ? `Assessment failed (${res.status}): ${detail}` : `Assessment failed (${res.status})`,
    );
  }

  return parsed as DoorAssessment;
}
