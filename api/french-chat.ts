// French AI helper endpoint, two actions behind one function (Vercel function
// budget): the default is a roleplay chat partner (returns the assistant's next
// French line); `action:"sentences"` generates short French sentences from the
// learner's mastered words for the listening test. Nothing is persisted
// server-side. Auth reuses the app's magic-link gate.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { authedUser, json, serviceClient } from "./_fireflies.js";

export const maxDuration = 30;

type ChatTurn = { role: "user" | "assistant"; content: string };
type Body = {
  action?: string;
  // chat
  scenario?: string;
  messages?: ChatTurn[];
  // sentence generation
  words?: string[];
  count?: number;
  wordsPerRound?: number;
};

const MAX_TURNS = 40;
const MAX_WORDS = 600;

const Sentence = z.object({
  // The display + spoken form (natural capitalisation, may end in punctuation).
  fr: z.string(),
  // A plain English translation.
  en: z.string(),
  // `fr` split into its words in order, lowercase, no punctuation — the sequence
  // the learner rebuilds from the word bank.
  words: z.array(z.string()),
});
const SentencesOutput = z.object({ sentences: z.array(Sentence) });

function clampInt(n: unknown, min: number, max: number, dflt: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : dflt;
  return Math.min(max, Math.max(min, v));
}

function sentenceSystemPrompt(perRound: number): string {
  return [
    "You generate very simple French sentences for a beginner learner (around",
    "Duolingo level 22) to practise LISTENING. Each sentence is spoken aloud and the",
    "learner rebuilds it word by word, so the sentences must be natural, grammatical",
    "French.",
    "",
    "Hard rules:",
    "- Build every sentence ONLY from the learner's mastered words listed by the user.",
    "  You MAY conjugate a mastered verb, and use the article shown with a mastered",
    "  noun. Do NOT introduce content words (nouns, verbs, adjectives, adverbs) the",
    "  learner has not mastered. Tiny grammatical glue that naturally follows from the",
    "  mastered words is acceptable, but keep new words to an absolute minimum.",
    "- Present tense or near future (aller + infinitive) only. No complex tenses.",
    `- Aim for about ${perRound} words per sentence (a word or two either side is fine).`,
    "- Keep sentences distinct from one another and each self-contained.",
    "",
    "For each sentence return:",
    "- `fr`: the sentence with normal capitalisation (no trailing period needed).",
    "- `en`: a short, natural English translation.",
    "- `words`: `fr` split into its individual words in order, lowercased, with all",
    "  punctuation removed. Joining `words` with single spaces must reproduce `fr`",
    "  (lowercased, unpunctuated). Elisions like « j'ai » count as one word.",
  ].join("\n");
}

// Generate listening-test sentences from the learner's mastered vocabulary.
async function generateSentences(body: Body): Promise<Response> {
  const words = (body.words ?? [])
    .map((w) => (typeof w === "string" ? w.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_WORDS);
  if (words.length === 0) return json({ error: "no mastered words supplied" }, 400);

  const count = clampInt(body.count, 1, 20, 10);
  const perRound = clampInt(body.wordsPerRound, 2, 8, 3);

  const user = [
    "Mastered words the learner knows (French):",
    words.join(", "),
    "",
    `Generate ${count} sentences of about ${perRound} words each, built from these words.`,
  ].join("\n");

  try {
    const anthropic = new Anthropic();
    const result = await anthropic.messages.parse({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: sentenceSystemPrompt(perRound),
      output_config: { format: zodOutputFormat(SentencesOutput) },
      messages: [{ role: "user", content: user }],
    });

    const sentences = (result.parsed_output?.sentences ?? [])
      .map((s) => ({
        fr: s.fr.trim(),
        en: s.en.trim(),
        words: s.words.map((w) => w.trim()).filter(Boolean),
      }))
      .filter((s) => s.fr && s.en && s.words.length >= 2)
      .slice(0, count);

    if (sentences.length === 0) return json({ error: "no sentences produced" }, 422);
    return json({ sentences }, 200);
  } catch (e) {
    console.error("french sentence generation failed", e);
    return json({ error: e instanceof Error ? e.message : "generation failed" }, 500);
  }
}

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

  if (body.action === "sentences") return generateSentences(body);

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
