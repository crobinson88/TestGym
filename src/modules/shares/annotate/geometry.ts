// Pure coordinate math for the PDF annotator. Annotations are stored normalised
// to [0..1] of the page box with a TOP-LEFT origin (matches screen/DOM and the
// canvas overlay). Two conversions live here and are unit-tested:
//   - screen pixels  -> normalised   (when the user draws on the overlay)
//   - normalised     -> pdf points   (when pdf-lib burns the mark in; pdf-lib
//                                      uses a BOTTOM-LEFT origin)
import type { DocAnnotation } from "@/lib/database.types";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const HIGHLIGHT_COLORS = ["#fde047", "#86efac", "#7dd3fc", "#fca5a5", "#d8b4fe"] as const;
export const DEFAULT_HIGHLIGHT = HIGHLIGHT_COLORS[0];

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

// A drag from (x0,y0) to (x1,y1) in overlay pixels -> a normalised, ordered box.
export function pixelDragToNormBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
): Box {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const left = Math.min(x0, x1);
  const top = Math.min(y0, y1);
  const right = Math.max(x0, x1);
  const bottom = Math.max(y0, y1);
  const x = clamp01(left / width);
  const y = clamp01(top / height);
  return {
    x,
    y,
    w: clamp01(right / width) - x,
    h: clamp01(bottom / height) - y,
  };
}

// A single tap in overlay pixels -> a normalised point.
export function pixelPointToNorm(
  px: number,
  py: number,
  width: number,
  height: number,
): { x: number; y: number } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0 };
  return { x: clamp01(px / width), y: clamp01(py / height) };
}

// Normalised top-left box -> a pdf-lib rectangle (bottom-left origin, points).
export function normBoxToPdfRect(
  box: Box,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number; width: number; height: number } {
  const width = box.w * pageWidth;
  const height = box.h * pageHeight;
  return {
    x: box.x * pageWidth,
    y: pageHeight - (box.y * pageHeight + height),
    width,
    height,
  };
}

// Normalised top-left point -> a pdf-lib point (bottom-left origin, points).
export function normPointToPdf(
  x: number,
  y: number,
  pageWidth: number,
  pageHeight: number,
): { x: number; y: number } {
  return { x: x * pageWidth, y: pageHeight - y * pageHeight };
}

// #rrggbb -> {r,g,b} in [0..1] for pdf-lib's rgb(). Falls back to the default
// highlight colour on a malformed string.
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const h = m ? m[1] : DEFAULT_HIGHLIGHT.slice(1);
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  };
}

export function highlightCount(anns: DocAnnotation[]): number {
  return anns.filter((a) => a.type === "highlight").length;
}

export function commentCount(anns: DocAnnotation[]): number {
  return anns.filter((a) => a.type === "comment").length;
}
