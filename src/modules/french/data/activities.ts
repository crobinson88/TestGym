import type { VocabWord } from "./vocabTypes";

// Themed lesson set: leisure activities (« Des activités et des loisirs ») plus
// the expressions for saying what you like, dislike and prefer, and the model
// sentences that combine them (including the reflexive « se promener » table with
// « aimer »). These live outside the frequency-ranked lists — `rank` here is just
// lesson order — but join the same VOCAB pool, so they show up in the vocab test
// and, once mastered, feed the listening test like any other entry.
export const ACTIVITIES: VocabWord[] = [
  // ---------------- Leisure activities ----------------
  { rank: 1, fr: "jouer au handball", en: "to play handball", pos: "phrase" },
  { rank: 2, fr: "sauter à la corde", en: "to skip rope", pos: "phrase" },
  { rank: 3, fr: "regarder la télé", en: "to watch TV", pos: "phrase" },
  { rank: 4, fr: "faire du vélo", en: "to ride a bike/to cycle", pos: "phrase" },
  { rank: 5, fr: "se promener", en: "to go for a walk", pos: "verb" },
  { rank: 6, fr: "pêcher", en: "to fish", pos: "verb" },
  { rank: 7, fr: "faire du patin à glace", en: "to ice-skate", pos: "phrase" },
  { rank: 8, fr: "jouer à l'ordinateur", en: "to play on the computer", pos: "phrase" },
  { rank: 9, fr: "faire du badminton", en: "to play badminton", pos: "phrase" },
  { rank: 10, fr: "jouer aux cartes", en: "to play cards", pos: "phrase" },
  { rank: 11, fr: "jouer au rugby", en: "to play rugby", pos: "phrase" },
  { rank: 12, fr: "jouer au football", en: "to play football/soccer", pos: "phrase" },
  { rank: 13, fr: "jouer au basket", en: "to play basketball", pos: "phrase" },
  { rank: 14, fr: "aller au cinéma", en: "to go to the cinema", pos: "phrase" },

  // ---------------- Saying what you like / dislike / prefer ----------------
  { rank: 15, fr: "j'aime", en: "I like", pos: "phrase" },
  { rank: 16, fr: "je n'aime pas", en: "I don't like", pos: "phrase" },
  { rank: 17, fr: "je déteste", en: "I hate", pos: "phrase" },
  { rank: 18, fr: "j'adore", en: "I love/adore", pos: "phrase" },
  { rank: 19, fr: "je préfère", en: "I prefer", pos: "phrase" },

  // ---------------- Model sentences ----------------
  { rank: 20, fr: "j'aime apprendre le français", en: "I like learning French", pos: "phrase" },
  {
    rank: 21,
    fr: "je préfère nager plutôt que dormir",
    en: "I prefer swimming to sleeping",
    pos: "phrase",
  },
  { rank: 22, fr: "vous aimez faire du vélo", en: "you like to ride a bike", pos: "phrase" },

  // « aimer » + reflexive « se promener » — the pronoun changes with the subject.
  { rank: 23, fr: "j'aime me promener", en: "I like to go for a walk", pos: "phrase" },
  { rank: 24, fr: "tu aimes te promener", en: "you like to go for a walk", pos: "phrase" },
  { rank: 25, fr: "il aime se promener", en: "he likes to go for a walk", pos: "phrase" },
  { rank: 26, fr: "nous aimons nous promener", en: "we like to go for a walk", pos: "phrase" },
  {
    rank: 27,
    fr: "vous aimez vous promener",
    en: "you (plural) like to go for a walk",
    pos: "phrase",
  },
  { rank: 28, fr: "ils aiment se promener", en: "they like to go for a walk", pos: "phrase" },
];
