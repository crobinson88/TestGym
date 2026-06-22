export type Pos =
  | "verb"
  | "noun"
  | "adjective"
  | "adverb"
  | "pronoun"
  | "preposition"
  | "conjunction"
  | "determiner"
  | "number"
  | "interjection"
  | "phrase"
  | "other";

// A single vocabulary entry. Nouns carry their definite article in `fr` and set
// `gender`; verbs are infinitives; everything else omits `gender`. `rank` is the
// frequency rank within the entry's own list (verbs 1..200, words 1..800).
export interface VocabWord {
  rank: number;
  fr: string;
  en: string;
  pos: Pos;
  gender?: "m" | "f";
}
