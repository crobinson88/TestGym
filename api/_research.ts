// Shared document loading for the stock-research endpoints: fetch URLs (SEC
// filings, annual reports) and accept uploaded PDFs/text, turning them into
// Anthropic content blocks. The leading `_` keeps Vercel from routing this file.
import Anthropic from "@anthropic-ai/sdk";

export const MAX_SOURCES = 6;
const MAX_TEXT_CHARS = 120_000; // per text/HTML source
const MAX_PDF_BYTES = 25 * 1024 * 1024; // Anthropic PDF limit ballpark
const USER_AGENT =
  process.env.RESEARCH_USER_AGENT ?? "gym-tracker research (charlie@theglassmarket.co)";

export type DocFile = { name?: string; mediaType?: string; dataBase64?: string; text?: string };
type Block = Anthropic.ContentBlockParam;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function blockFromUrl(url: string): Promise<Block[]> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "*/*" } });
  if (!res.ok) {
    return [{ type: "text", text: `[Could not fetch ${url} — HTTP ${res.status}]` }];
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/pdf")) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_PDF_BYTES) {
      return [{ type: "text", text: `[Skipped ${url} — PDF too large]` }];
    }
    return [
      { type: "text", text: `Source (PDF): ${url}` },
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") },
      },
    ];
  }
  const text = stripHtml(await res.text()).slice(0, MAX_TEXT_CHARS);
  return [{ type: "text", text: `Source: ${url}\n\n${text}` }];
}

function blockFromFile(file: DocFile): Block[] {
  const name = file.name ?? "uploaded file";
  if (file.mediaType === "application/pdf" && file.dataBase64) {
    return [
      { type: "text", text: `Source (uploaded PDF): ${name}` },
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: file.dataBase64 },
      },
    ];
  }
  if (file.text != null) {
    return [{ type: "text", text: `Source (uploaded): ${name}\n\n${file.text.slice(0, MAX_TEXT_CHARS)}` }];
  }
  return [];
}

// Load every URL and file into ordered content blocks.
export async function loadDocBlocks(urls: string[], files: DocFile[]): Promise<Block[]> {
  const blocks: Block[] = [];
  for (const url of urls) blocks.push(...(await blockFromUrl(url)));
  for (const file of files) blocks.push(...blockFromFile(file));
  return blocks;
}
