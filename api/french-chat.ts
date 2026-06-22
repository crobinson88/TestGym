// French roleplay chat partner. Takes a scenario + the conversation so far and
// returns the assistant's next line, in French, pitched at a beginner. Nothing
// is persisted server-side. Auth reuses the app's magic-link gate.
import Anthropic from "@anthropic-ai/sdk";
import { authedUser, json, serviceClient } from "./_fireflies.js";

export const maxDuration = 30;

type ChatTurn = { role: "user" | "assistant"; content: string };
type Body = { scenario?: string; messages?: ChatTurn[] };

const MAX_TURNS = 40;

function systemPrompt(scenario: string): string {
  return [
    "You are Margaux, a warm, patient French conversation partner helping an English",
    "speaker practise French through roleplay. The learner is a beginner (around",
    "Duolingo level 22): keep your French simple, short, and in the present tense or",
    "near future (aller + infinitive) where possible.",
    "",
    `Roleplay scenario: ${scenario}`,
    "",
    "Rules for every reply:",
    "- Stay in character and keep the scene moving. Reply in 1-3 short French sentences.",
    "- Always end with a simple question so the learner has something to respond to.",
    "- Speak French. When you use a word the learner is unlikely to know, add a tiny",
    "  English gloss in parentheses, e.g. « une addition (the bill) ». Do not translate",
    "  whole sentences.",
    "- If the learner's previous message has a notable grammar or vocabulary mistake,",
    "  add ONE short correction on its own final line, prefixed exactly with",
    "  '✏️ ' — for example: '✏️ say \"j'ai 25 ans\", not \"je suis 25 ans\".' Skip this",
    "  line when the message was fine. Never nitpick missing accents or minor typos.",
    "- Be encouraging. If the learner writes in English, gently nudge them back to French.",
  ].join("\n");
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

  const scenario = (body.scenario ?? "").trim() || "A casual chat between two friends.";
  const turns = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && m.content?.trim())
    .slice(-MAX_TURNS);

  // First turn (no history): prompt the model to open the scene itself.
  const messages: ChatTurn[] =
    turns.length === 0
      ? [{ role: "user", content: "Commençons. Lance la conversation en français." }]
      : turns;

  try {
    const anthropic = new Anthropic();
    const result = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: systemPrompt(scenario),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const reply = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!reply) return json({ error: "no reply produced" }, 422);
    return json({ reply }, 200);
  } catch (e) {
    console.error("french-chat failed", e);
    return json({ error: e instanceof Error ? e.message : "chat failed" }, 500);
  }
}
