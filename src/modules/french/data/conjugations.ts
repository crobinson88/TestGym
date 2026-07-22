// Conjugation drill data: the core auxiliaries plus the most common irregular
// verbs, in the present tense. Futur proche ("going to …") is derived at quiz
// time as aller (present) + infinitive, so it isn't stored separately.

export type Person = "je" | "tu" | "il" | "nous" | "vous" | "ils";

export const PERSONS: Person[] = ["je", "tu", "il", "nous", "vous", "ils"];

// How each subject pronoun is shown in prompts/explanations (the two third-person
// rows cover both genders).
export const PRONOUN_LABEL: Record<Person, string> = {
  je: "je",
  tu: "tu",
  il: "il/elle",
  nous: "nous",
  vous: "vous",
  ils: "ils/elles",
};

export interface VerbConjugation {
  infinitive: string;
  en: string;
  // Present-tense form WITHOUT the subject pronoun (e.g. "suis", "sommes").
  present: Record<Person, string>;
}

export const CONJ_VERBS: VerbConjugation[] = [
  {
    infinitive: "être",
    en: "to be",
    present: { je: "suis", tu: "es", il: "est", nous: "sommes", vous: "êtes", ils: "sont" },
  },
  {
    infinitive: "avoir",
    en: "to have",
    present: { je: "ai", tu: "as", il: "a", nous: "avons", vous: "avez", ils: "ont" },
  },
  {
    infinitive: "faire",
    en: "to make/do",
    present: { je: "fais", tu: "fais", il: "fait", nous: "faisons", vous: "faites", ils: "font" },
  },
  {
    infinitive: "aller",
    en: "to go",
    present: { je: "vais", tu: "vas", il: "va", nous: "allons", vous: "allez", ils: "vont" },
  },
  {
    infinitive: "pouvoir",
    en: "to be able to",
    present: { je: "peux", tu: "peux", il: "peut", nous: "pouvons", vous: "pouvez", ils: "peuvent" },
  },
  {
    infinitive: "vouloir",
    en: "to want",
    present: { je: "veux", tu: "veux", il: "veut", nous: "voulons", vous: "voulez", ils: "veulent" },
  },
  {
    infinitive: "devoir",
    en: "to have to",
    present: { je: "dois", tu: "dois", il: "doit", nous: "devons", vous: "devez", ils: "doivent" },
  },
  {
    infinitive: "venir",
    en: "to come",
    present: { je: "viens", tu: "viens", il: "vient", nous: "venons", vous: "venez", ils: "viennent" },
  },
  {
    infinitive: "prendre",
    en: "to take",
    present: { je: "prends", tu: "prends", il: "prend", nous: "prenons", vous: "prenez", ils: "prennent" },
  },
  {
    infinitive: "dire",
    en: "to say/tell",
    present: { je: "dis", tu: "dis", il: "dit", nous: "disons", vous: "dites", ils: "disent" },
  },
  {
    infinitive: "voir",
    en: "to see",
    present: { je: "vois", tu: "vois", il: "voit", nous: "voyons", vous: "voyez", ils: "voient" },
  },
  // The like/dislike/prefer verbs from the leisure-activities lesson (all -er
  // verbs; préférer changes é → è in the singular and 3rd-plural stem).
  {
    infinitive: "aimer",
    en: "to like/love",
    present: { je: "aime", tu: "aimes", il: "aime", nous: "aimons", vous: "aimez", ils: "aiment" },
  },
  {
    infinitive: "adorer",
    en: "to love/adore",
    present: { je: "adore", tu: "adores", il: "adore", nous: "adorons", vous: "adorez", ils: "adorent" },
  },
  {
    infinitive: "détester",
    en: "to hate",
    present: {
      je: "déteste",
      tu: "détestes",
      il: "déteste",
      nous: "détestons",
      vous: "détestez",
      ils: "détestent",
    },
  },
  {
    infinitive: "préférer",
    en: "to prefer",
    present: {
      je: "préfère",
      tu: "préfères",
      il: "préfère",
      nous: "préférons",
      vous: "préférez",
      ils: "préfèrent",
    },
  },
];

// The aller table powers the futur proche ("going to …") for every other verb.
export const ALLER = CONJ_VERBS.find((v) => v.infinitive === "aller")!;
