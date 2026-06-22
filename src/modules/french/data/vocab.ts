import type { VocabWord } from "./vocabTypes";
import { VERBS } from "./verbs";
import { WORDS } from "./words";

export type { VocabWord, Pos } from "./vocabTypes";
export { VERBS } from "./verbs";
export { WORDS } from "./words";

// The top-1000 study list: the 200 most common verbs followed by the 800 most
// common non-verb words. Tests draw from this whole pool.
export const VOCAB: VocabWord[] = [...VERBS, ...WORDS];
