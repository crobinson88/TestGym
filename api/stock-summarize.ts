// Stock-research summarizer. Takes a custom prompt plus document URLs (SEC
// filings, annual reports) and/or uploaded files (PDF or text), feeds them to
// Claude, and returns a free-text summary the user pastes into stock or trade
// notes. Auth reuses the app's magic-link gate.
import Anthropic from "@anthropic-ai/sdk";
import { authedUser, json, serviceClient } from "./_fireflies.js";

// Fetching + summarizing a 10-K is slower than a quick vision call.
export const maxDuration = 60;

const MAX_SOURCES = 6;
const MAX_TEXT_CHARS = 120_000; // per text/HTML source
const MAX_PDF_BYTES = 25 * 1024 * 1024; // Anthropic PDF limit ballpark
const USER_AGENT =
  process.env.RESEARCH_USER_AGENT ?? "gym-tracker research (charlie@theglassmarket.co)";

type DocFile = { name?: string; mediaType?: string; dataBase64?: string; text?: string };
type Body = { prompt?: string; ticker?: string; urls?: string[]; files?: DocFile[] };

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

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = serviceClient();
    if (!(await authedUser(request, supabase))) return json({ error: "unauthorized" }, 401);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "init failed" }, 500);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return json({ error: "missing prompt" }, 400);

  const urls = (body.urls ?? []).map((u) => u.trim()).filter(Boolean);
  const files = body.files ?? [];
  if (urls.length + files.length === 0) {
    return json({ error: "provide at least one document URL or file" }, 400);
  }
  if (urls.length + files.length > MAX_SOURCES) {
    return json({ error: `too many sources (max ${MAX_SOURCES})` }, 400);
  }

  const docBlocks: Block[] = [];
  try {
    for (const url of urls) docBlocks.push(...(await blockFromUrl(url)));
    for (const file of files) docBlocks.push(...blockFromFile(file));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "failed to load documents" }, 502);
  }

  const ticker = body.ticker?.trim().toUpperCase();
  try {
    const anthropic = new Anthropic();
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system:
        "You are an equity-research assistant. Read the provided company documents " +
        "(SEC filings, annual reports, etc.) and answer the user's request precisely. " +
        "Ground every claim in the documents; do not invent figures. Prefer tight bullet " +
        "points and call out anything material to a buy or sell decision. If the documents " +
        "do not contain the answer, say so.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: ticker ? `Ticker: ${ticker}\n\nRequest: ${prompt}` : `Request: ${prompt}`,
            },
            ...docBlocks,
          ],
        },
      ],
    });

    const summary = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!summary) return json({ error: "no summary produced" }, 422);
    return json({ summary }, 200);
  } catch (e) {
    console.error("stock-summarize failed", e);
    return json({ error: e instanceof Error ? e.message : "summarize failed" }, 500);
  }
}
