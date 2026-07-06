// Generate short French sentences for the listening test's multi-word rounds.
// Takes the learner's mastered vocabulary and returns simple sentences built from
// it, each with its words in spoken order for the reorder game. Nothing is
// persisted server-side. Auth reuses the app's magic-link gate.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { authedUser, json, serviceClient } from "./_fireflies.js";

export const maxDuration = 30;

type Body = { words?: string[]; count?: number; wordsPerRound?: number };

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
const Output = z.object({ sentences: z.array(Sentence) });

function clampInt(n: unknown, min: number, max: number, dflt: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : dflt;
  return Math.min(max, Math.max(min, v));
}

function systemPrompt(perRound: number): string {
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

  const words = (body.words ?? [])
    .map((w) => (typeof w === "string" ? w.trim() : ""))
    .filter(Boolean)
    .slice(0, MAX_WORDS);
  if (words.length === 0) {
    return json({ error: "no mastered words supplied" }, 400);
  }

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
      system: systemPrompt(perRound),
      output_config: { format: zodOutputFormat(Output) },
      messages: [{ role: "user", content: user }],
    });

    const out = result.parsed_output;
    const sentences = (out?.sentences ?? [])
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
    console.error("french-sentences failed", e);
    return json({ error: e instanceof Error ? e.message : "generation failed" }, 500);
  }
}
