// Market-note validator. Takes a free-text market note plus an (editable)
// research prompt and has Claude pressure-test the thesis against current data
// via web search, returning a grounded write-up + the sources it cited. The
// result is shown in a popup the user can save onto the note or its research
// log. Auth reuses the app's magic-link gate, like the other AI endpoints.
import Anthropic from "@anthropic-ai/sdk";
import { authedUser, json, serviceClient } from "./_fireflies.js";

// Web search fans out to several rounds; give it room beyond a quick call.
export const maxDuration = 60;

type Body = { prompt?: string; note?: string; indices?: string[] };

type Block = Anthropic.Messages.ContentBlockParam;
type Source = { title: string; url: string };

// Pull the web_search_result rows out of the response so the client can list
// what the model actually consulted. Deduped by URL, capped so the popup stays
// readable.
function collectSources(content: Anthropic.Messages.ContentBlock[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const block of content) {
    if (block.type !== "web_search_tool_result") continue;
    const results = block.content;
    if (!Array.isArray(results)) continue; // an error block, not results
    for (const r of results) {
      if (r.type !== "web_search_result" || seen.has(r.url)) continue;
      seen.add(r.url);
      out.push({ title: r.title || r.url, url: r.url });
    }
  }
  return out.slice(0, 12);
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

  try {
    const anthropic = new Anthropic();
    const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];

    // Server-side web search can pause after its iteration budget; re-send until
    // the turn actually ends. Bounded so a runaway loop can't hang the function.
    let response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system:
        "You are a markets research analyst. The user holds a thesis about one or more " +
        "market indices. Use web search to gather current, relevant evidence, then judge " +
        "whether the thesis holds up. Structure the reply as tight bullet points: what " +
        "supports it, what cuts against it, the key risks or things to watch, and a one-line " +
        "verdict (holds up / mixed / doesn't hold up). Ground every claim in what you found " +
        "and never invent figures; if the evidence is thin, say so.",
      tools: [{ type: "web_search_20260209", name: "web_search" }],
      messages,
    });

    const allContent: Anthropic.Messages.ContentBlock[] = [...response.content];
    let guard = 0;
    while (response.stop_reason === "pause_turn" && guard < 5) {
      messages.push({ role: "assistant", content: response.content as Block[] });
      response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        tools: [{ type: "web_search_20260209", name: "web_search" }],
        messages,
      });
      allContent.push(...response.content);
      guard += 1;
    }

    const result = response.content
      .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!result) return json({ error: "no result produced" }, 422);
    return json({ result, sources: collectSources(allContent) }, 200);
  } catch (e) {
    console.error("market-validate failed", e);
    return json({ error: e instanceof Error ? e.message : "validate failed" }, 500);
  }
}
