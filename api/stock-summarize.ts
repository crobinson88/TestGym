// Stock-research summarizer. Takes a custom prompt plus document URLs (SEC
// filings, annual reports) and/or uploaded files (PDF or text), feeds them to
// Claude, and returns a free-text summary the user pastes into stock or trade
// notes. Auth reuses the app's magic-link gate.
import Anthropic from "@anthropic-ai/sdk";
import { authedUser, json, serviceClient } from "./_fireflies.js";
import { loadDocBlocks, MAX_SOURCES, type DocFile } from "./_research.js";

// Fetching + summarizing a 10-K is slower than a quick vision call.
export const maxDuration = 60;

type Body = { prompt?: string; ticker?: string; urls?: string[]; files?: DocFile[] };

type Block = Anthropic.ContentBlockParam;

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

  let docBlocks: Block[];
  try {
    docBlocks = await loadDocBlocks(urls, files);
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
