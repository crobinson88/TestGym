// Burn an annotation overlay into a copy of the base PDF, producing a portable
// flattened document (highlights as translucent fills, comments as numbered pins
// with the note text listed on an appended page). pdf-lib is dynamically
// imported so it only loads when the user saves. The base bytes are never
// mutated — re-editing always re-flattens from the clean base.
import type { DocAnnotation } from "@/lib/database.types";
import { hexToRgb01, normBoxToPdfRect, normPointToPdf, DEFAULT_HIGHLIGHT } from "./geometry";

export async function flattenPdf(
  baseBytes: Uint8Array,
  annotations: DocAnnotation[],
): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import("pdf-lib");
  const doc = await PDFDocument.load(baseBytes.slice());
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();

  // Stable numbering for comments, in page-then-creation order.
  const comments = annotations
    .filter((a) => a.type === "comment")
    .sort((a, b) => a.page - b.page || a.addedAt.localeCompare(b.addedAt));
  const numberOf = new Map(comments.map((c, i) => [c.id, i + 1]));

  for (const ann of annotations) {
    const page = pages[ann.page - 1];
    if (!page) continue;
    const { width, height } = page.getSize();

    if (ann.type === "highlight" && ann.rect) {
      const r = normBoxToPdfRect(ann.rect, width, height);
      if (r.width <= 0 || r.height <= 0) continue;
      const c = hexToRgb01(ann.color ?? DEFAULT_HIGHLIGHT);
      page.drawRectangle({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        color: rgb(c.r, c.g, c.b),
        opacity: 0.35,
      });
    } else if (ann.type === "comment" && ann.x != null && ann.y != null) {
      const p = normPointToPdf(ann.x, ann.y, width, height);
      const n = numberOf.get(ann.id) ?? 0;
      const radius = 9;
      page.drawCircle({ x: p.x, y: p.y, size: radius, color: rgb(0.96, 0.62, 0.04) });
      const label = String(n);
      const fontSize = 10;
      const tw = bold.widthOfTextAtSize(label, fontSize);
      page.drawText(label, {
        x: p.x - tw / 2,
        y: p.y - fontSize / 3,
        size: fontSize,
        font: bold,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
  }

  if (comments.length > 0) {
    let page = doc.addPage();
    const { width, height } = page.getSize();
    const margin = 48;
    const size = 11;
    const lineH = 15;
    const maxWidth = width - margin * 2;
    let y = height - margin;
    page.drawText("Comments", { x: margin, y, size: 18, font: bold, color: rgb(0.1, 0.1, 0.1) });
    y -= 28;
    for (const c of comments) {
      const n = numberOf.get(c.id) ?? 0;
      const text = `[${n}] page ${c.page}: ${c.text ?? ""}`.trim();
      for (const line of wrap(text, font, size, maxWidth)) {
        if (y < margin) {
          page = doc.addPage();
          y = height - margin;
        }
        page.drawText(line, { x: margin, y, size, font, color: rgb(0.15, 0.15, 0.15) });
        y -= lineH;
      }
      y -= 6;
    }
  }

  return doc.save();
}

// Greedy word wrap against the embedded font's measured width.
function wrap(
  text: string,
  font: { widthOfTextAtSize(s: string, size: number): number },
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
