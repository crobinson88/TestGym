import type { GeneratedSentence } from "./quiz";

// Ask the server to generate short French sentences from the learner's mastered
// vocabulary, for the listening test's multi-word rounds. Throws on any failure so
// the runner can surface a retry.
export async function fetchSentences(
  words: readonly string[],
  count: number,
  wordsPerRound: number,
  token: string | undefined,
): Promise<GeneratedSentence[]> {
  const res = await fetch("/api/french-sentences", {
    method: "POST",
    headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ words, count, wordsPerRound }),
  });
  const text = await res.text();
  let parsed: { sentences?: GeneratedSentence[]; error?: string } | null;
  try {
    parsed = JSON.parse(text) as { sentences?: GeneratedSentence[]; error?: string };
  } catch {
    parsed = null;
  }
  if (!res.ok || !parsed?.sentences?.length) {
    throw new Error(parsed?.error ?? `Sentence generation failed (${res.status})`);
  }
  return parsed.sentences;
}
