// pdfjs glue: load a PDF and render pages to canvases. pdfjs is dynamically
// imported so the ~1MB engine only loads when the annotator opens, mirroring how
// the model builder lazy-loads exceljs.
import type { PDFDocumentProxy } from "pdfjs-dist";

export interface PageDims {
  index: number; // 0-based
  width: number; // pdf points at scale 1
  height: number;
}

let workerReady = false;

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  if (!workerReady) {
    // Vite resolves the worker to a hashed URL; pdfjs spins it up itself.
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    lib.GlobalWorkerOptions.workerSrc = workerUrl;
    workerReady = true;
  }
  return lib;
}

export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs();
  // pdfjs transfers and detaches the buffer; hand it a copy so the caller can
  // still re-upload the original bytes after rendering.
  const data = bytes.slice();
  return lib.getDocument({ data }).promise;
}

export async function pageDimensions(doc: PDFDocumentProxy): Promise<PageDims[]> {
  const out: PageDims[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    out.push({ index: i - 1, width: vp.width, height: vp.height });
  }
  return out;
}

// Render one page onto a canvas at the given CSS width (device-pixel aware).
export async function renderPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  cssWidth: number,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = (cssWidth / base.width) * dpr;
  const viewport = page.getViewport({ scale });
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssWidth * (base.height / base.width)}px`;
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
}
