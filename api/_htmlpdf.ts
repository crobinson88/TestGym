// Convert an HTML filing into a clean, reflowed PDF the annotator can open.
// Many SEC/IR primary documents are HTML, not PDF; rather than render a full
// browser (heavy on Vercel), we strip the markup to paragraph-preserving text
// and lay it out with pdf-lib (already a dependency). Tables/images/exact
// layout are lost, but the prose is readable and annotatable. The leading `_`
// keeps Vercel from routing this file; it's only imported.
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";

const MAX_TEXT_CHARS = 200_000; // guard against multi-hundred-page 10-Ks

// HTML -> text with paragraph breaks preserved (block elements become blank
// lines, <br> a single newline, list items get a bullet).
export function htmlToText(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<head[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|ul|ol|table|thead|tbody|blockquote)>/gi, "\n\n")
    .replace(/<\/td>|<\/th>/gi, "  ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&[a-z0-9#]+;/gi, " ");
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return s;
}

// pdf-lib's Helvetica is WinAnsi-encoded and throws on characters it can't
// encode (smart quotes, em dashes, ellipsis, exotic spaces). Map the common
// ones to ASCII and drop anything outside the encodable Latin-1 range.
export function toEncodable(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
    .replace(/\u2022/g, "*")
    // Keep newline, printable ASCII, and printable Latin-1 (WinAnsi-encodable).
    .replace(/[^\n\x20-\x7E¡-ÿ]/g, "");
}

// Greedy word wrap, hard-breaking any single token wider than the whole line.
function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  let line = "";
  const fits = (str: string) => font.widthOfTextAtSize(str, size) <= maxWidth;

  for (let word of text.split(/\s+/).filter(Boolean)) {
    // Split an over-wide token (e.g. a long URL) across lines first.
    while (!fits(word) && word.length > 1) {
      let i = 1;
      while (i < word.length && fits(word.slice(0, i + 1))) i++;
      if (line) {
        out.push(line);
        line = "";
      }
      out.push(word.slice(0, i));
      word = word.slice(i);
    }
    const next = line ? `${line} ${word}` : word;
    if (!line || fits(next)) {
      line = next;
    } else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

export async function htmlToPdf(html: string, title?: string): Promise<Uint8Array> {
  const text = toEncodable(htmlToText(html)).slice(0, MAX_TEXT_CHARS);
  if (!text.trim()) throw new Error("no readable text in document");

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const [pw, ph] = [612, 792]; // US Letter
  const margin = 54;
  const size = 11;
  const lineH = 16;
  const maxWidth = pw - margin * 2;

  let page = doc.addPage([pw, ph]);
  let y = ph - margin;
  const newline = (h: number) => {
    y -= h;
    if (y < margin) {
      page = doc.addPage([pw, ph]);
      y = ph - margin;
    }
  };

  if (title) {
    for (const line of wrapLines(toEncodable(title), bold, 15, maxWidth)) {
      page.drawText(line, { x: margin, y, size: 15, font: bold });
      newline(20);
    }
    newline(8);
  }

  for (const para of text.split(/\n{2,}/)) {
    for (const line of wrapLines(para.replace(/\n/g, " "), font, size, maxWidth)) {
      page.drawText(line, { x: margin, y, size, font });
      newline(lineH);
    }
    newline(lineH * 0.6);
  }

  return doc.save();
}
