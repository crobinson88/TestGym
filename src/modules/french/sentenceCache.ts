import type { GeneratedSentence } from "./quiz";

// Sentences for the listening test's multi-word rounds are written server-side by
// Claude, so a plane or a basement would otherwise leave that test dead. Every
// batch that comes back is kept here, and an offline run is dealt from it. Cached
// in localStorage (not Dexie) because they are disposable study material, not
// user data — losing them costs one re-generation when the network is back.
export const SENTENCE_CACHE_KEY = "french:sentences";

// Enough for several offline tests at any round length; oldest drop out first.
export const SENTENCE_CACHE_LIMIT = 150;

function isSentence(v: unknown): v is GeneratedSentence {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<GeneratedSentence>;
  return (
    typeof s.fr === "string" &&
    s.fr.trim() !== "" &&
    typeof s.en === "string" &&
    Array.isArray(s.words) &&
    s.words.length > 0 &&
    s.words.every((w) => typeof w === "string" && w.trim() !== "")
  );
}

export function parseSentenceCache(raw: string | null): GeneratedSentence[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter(isSentence) : [];
  } catch {
    return [];
  }
}

// Newest first, deduped on the French sentence, capped at `limit`.
export function mergeSentences(
  existing: readonly GeneratedSentence[],
  incoming: readonly GeneratedSentence[],
  limit = SENTENCE_CACHE_LIMIT,
): GeneratedSentence[] {
  const seen = new Set<string>();
  const merged: GeneratedSentence[] = [];
  for (const s of [...incoming, ...existing]) {
    if (!isSentence(s)) continue;
    const key = s.fr.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(s);
    if (merged.length >= limit) break;
  }
  return merged;
}

// Deal an offline round set: only sentences built entirely from words the learner
// still has mastered (mastery can lapse, and the online generator draws from the
// live pool), preferring the asked-for round length and shuffling so a second
// offline test isn't the first one again.
export function selectCached(
  cache: readonly GeneratedSentence[],
  count: number,
  wordsPerRound: number,
  mastered: ReadonlySet<string>,
  rng: () => number = Math.random,
): GeneratedSentence[] {
  const usable = cache.filter((s) => s.words.every((w) => mastered.has(w.toLowerCase())));
  const byDistance = new Map<number, GeneratedSentence[]>();
  for (const s of usable) {
    const d = Math.abs(s.words.length - wordsPerRound);
    const bucket = byDistance.get(d);
    if (bucket) bucket.push(s);
    else byDistance.set(d, [s]);
  }
  const picked: GeneratedSentence[] = [];
  for (const d of [...byDistance.keys()].sort((a, b) => a - b)) {
    const bucket = [...(byDistance.get(d) ?? [])];
    // Fisher-Yates over the bucket, so closeness to the asked length still ranks
    // but the order within a length is fresh each time.
    for (let i = bucket.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [bucket[i], bucket[j]] = [bucket[j], bucket[i]];
    }
    for (const s of bucket) {
      picked.push(s);
      if (picked.length >= count) return picked;
    }
  }
  return picked;
}

export function loadSentenceCache(): GeneratedSentence[] {
  try {
    return parseSentenceCache(localStorage.getItem(SENTENCE_CACHE_KEY));
  } catch {
    return [];
  }
}

export function cacheSentences(incoming: readonly GeneratedSentence[]): void {
  try {
    const merged = mergeSentences(loadSentenceCache(), incoming);
    localStorage.setItem(SENTENCE_CACHE_KEY, JSON.stringify(merged));
  } catch {
    // Private-mode storage failures just cost the offline fallback.
  }
}
