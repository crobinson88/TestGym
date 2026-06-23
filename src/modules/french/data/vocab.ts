import type { VocabWord } from "./vocabTypes";
import { VERBS } from "./verbs";
import { WORDS } from "./words";
import { WORDS_EXT } from "./words2";

export type { VocabWord, Pos } from "./vocabTypes";
export { VERBS } from "./verbs";
export { WORDS } from "./words";
export { WORDS_EXT } from "./words2";

// The top-2100 study list: the 200 most common verbs, the next 800 most common
// non-verbs, then ~1100 more words (ranks ~801–1900) extending the list to 2100.
// Tests draw from this whole pool.
export const VOCAB: VocabWord[] = [...VERBS, ...WORDS, ...WORDS_EXT];
