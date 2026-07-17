// Pronunciation-rules drill data: multiple-choice questions on how French
// letters and letter combinations sound. Mirrors the shape of `rules.ts` (the
// grammar drill) so the quiz engine treats both the same way. Each question may
// carry an `example` — a real French word the learner can play (fr-FR TTS) to
// hear the rule in action; the prompt text stays visible (unlike the listening
// test, this isn't identify-by-ear).

export type PronTopic =
  | "Vowels"
  | "Nasal vowels"
  | "Consonants"
  | "Silent letters"
  | "Liaison"
  | "Accents";

export interface PronQuestion {
  id: string; // stable kebab-case slug, unique, e.g. "vowel-ou"
  topic: PronTopic;
  prompt: string; // the question text
  choices: string[]; // 3 or 4 plausible options
  answer: number; // 0-based index into choices of the correct answer
  explanation: string; // one or two sentences grounding the rule
  example?: string; // a French word to hear the rule in action (fr-FR TTS)
}

export const PRON_QUESTIONS: PronQuestion[] = [
  // ---------------- Vowels ----------------
  {
    id: "vowel-ou",
    topic: "Vowels",
    prompt: "How is « ou » pronounced, as in « vous »?",
    choices: ["Like 'oo' in food", "Like 'ow' in cow", "Like 'oh' in go"],
    answer: 0,
    explanation: "« ou » is always a single /u/ sound, like 'oo' in food: vous, nous, tout.",
    example: "vous",
  },
  {
    id: "vowel-u",
    topic: "Vowels",
    prompt: "The « u » in « tu » is pronounced…",
    choices: [
      "/y/ — lips rounded, tongue forward (no English equivalent)",
      "Like 'oo' in food",
      "Like 'uh' in cup",
    ],
    answer: 0,
    explanation:
      "French « u » is /y/: say 'ee' then round your lips. It is NOT the 'oo' of « ou » — tu vs tout are different vowels.",
    example: "tu",
  },
  {
    id: "vowel-au-eau",
    topic: "Vowels",
    prompt: "How are « au » and « eau » pronounced, as in « eau » (water)?",
    choices: ["Like 'oh' in go", "Like 'ow' in cow", "Like 'aw' in saw, held long"],
    answer: 0,
    explanation: "« au » and « eau » both give a closed /o/, like 'oh' in go: eau, chaud, beau.",
    example: "eau",
  },
  {
    id: "vowel-oi",
    topic: "Vowels",
    prompt: "How is « oi » pronounced, as in « moi »?",
    choices: ["Like 'wa' in watt", "Like 'oy' in boy", "Like 'oh' in go"],
    answer: 0,
    explanation: "« oi » is /wa/, like 'wa' in watt: moi, toi, boire, trois.",
    example: "moi",
  },
  {
    id: "vowel-ai",
    topic: "Vowels",
    prompt: "How is « ai » usually pronounced, as in « mais »?",
    choices: ["Like 'e' in bed", "Like 'eye'", "Like 'ay' in day"],
    answer: 0,
    explanation: "« ai » (and « ei ») give an open /ɛ/, like 'e' in bed: mais, lait, français.",
    example: "mais",
  },
  {
    id: "vowel-eu",
    topic: "Vowels",
    prompt: "How is « eu » pronounced, as in « deux »?",
    choices: [
      "/ø/ — like 'u' in British 'fur', lips rounded",
      "Like 'you'",
      "Like 'ee' in see",
    ],
    answer: 0,
    explanation: "« eu »/« œu » give the rounded /ø/ or /œ/: deux, peu, bleu, sœur.",
    example: "deux",
  },
  {
    id: "vowel-final-e",
    topic: "Vowels",
    prompt: "The final « e » in « table » is…",
    choices: ["Silent (or a faint schwa)", "Pronounced like 'ay'", "Pronounced like 'ee'"],
    answer: 0,
    explanation:
      "An unaccented final « e » is silent or a barely-there schwa: table, porte, France all end on the consonant.",
    example: "table",
  },

  // ---------------- Nasal vowels ----------------
  {
    id: "nasal-on",
    topic: "Nasal vowels",
    prompt: "How is « on » pronounced, as in « bon »?",
    choices: [
      "A nasal /ɔ̃/ — vowel through the nose, the 'n' not fully sounded",
      "Like 'on' in English 'on'",
      "Like 'own' in own",
    ],
    answer: 0,
    explanation:
      "« on »/« om » is the nasal /ɔ̃/: air flows through the nose and the n/m isn't articulated: bon, non, nom.",
    example: "bon",
  },
  {
    id: "nasal-an-en",
    topic: "Nasal vowels",
    prompt: "« an » and « en » (as in « enfant ») share which sound?",
    choices: ["The nasal /ɑ̃/", "The nasal /ɔ̃/ (as in « bon »)", "The nasal /ɛ̃/ (as in « vin »)"],
    answer: 0,
    explanation: "« an »/« am »/« en »/« em » all give the nasal /ɑ̃/: enfant, dans, temps, France.",
    example: "enfant",
  },
  {
    id: "nasal-in",
    topic: "Nasal vowels",
    prompt: "How is « in » pronounced, as in « vin » (wine)?",
    choices: ["The nasal /ɛ̃/", "The nasal /ɔ̃/ (as in « bon »)", "Like 'in' in English 'pin'"],
    answer: 0,
    explanation:
      "« in »/« ain »/« ein »/« im » give the nasal /ɛ̃/: vin, pain, main, faim. The n/m stays silent.",
    example: "vin",
  },
  {
    id: "nasal-denasal",
    topic: "Nasal vowels",
    prompt: "Why is « bonne » NOT nasal, unlike « bon »?",
    choices: [
      "A doubled « nn » (or « n » before a vowel) is sounded, so the vowel stays oral",
      "The « o » changes the rule",
      "Feminine words are never nasal",
    ],
    answer: 0,
    explanation:
      "Nasalisation needs a single n/m closing the syllable. Double « nn »/« mm », or n/m before a vowel, is pronounced and the vowel is oral: bon /bɔ̃/ vs bonne /bɔn/.",
    example: "bonne",
  },

  // ---------------- Consonants ----------------
  {
    id: "cons-ch",
    topic: "Consonants",
    prompt: "How is « ch » pronounced, as in « chat »?",
    choices: ["Like 'sh' in ship", "Like 'ch' in chair", "Like 'k'"],
    answer: 0,
    explanation: "« ch » is /ʃ/, English 'sh': chat, chien, chaud.",
    example: "chat",
  },
  {
    id: "cons-cedille",
    topic: "Consonants",
    prompt: "What does the cedilla in « ç » do, as in « ça »?",
    choices: [
      "Forces a soft /s/ before a, o, u",
      "Forces a hard /k/",
      "Makes the letter silent",
    ],
    answer: 0,
    explanation:
      "« ç » is always /s/. It's used before a/o/u where plain « c » would be hard /k/: ça, garçon, français.",
    example: "ça",
  },
  {
    id: "cons-c-soft",
    topic: "Consonants",
    prompt: "The « c » in « ce » (before e or i) is pronounced…",
    choices: ["Soft /s/", "Hard /k/", "Like 'ch' /ʃ/"],
    answer: 0,
    explanation:
      "« c » is soft /s/ before e, i, y (ce, cinéma, cycle) and hard /k/ before a, o, u (café, écouter).",
    example: "ce",
  },
  {
    id: "cons-g-soft",
    topic: "Consonants",
    prompt: "The « g » in « manger » (before e) is pronounced…",
    choices: ["Soft /ʒ/ — like 's' in 'measure'", "Hard /g/ — like 'g' in 'go'", "Silent"],
    answer: 0,
    explanation:
      "« g » is soft /ʒ/ before e, i, y (manger, gitan) and hard /g/ before a, o, u (gare, gomme).",
    example: "manger",
  },
  {
    id: "cons-gn",
    topic: "Consonants",
    prompt: "How is « gn » pronounced, as in « montagne »?",
    choices: ["Like 'ny' in canyon (/ɲ/)", "Like a hard 'gn' (g + n)", "Like 'ng' in sing"],
    answer: 0,
    explanation: "« gn » is /ɲ/, the 'ny' of canyon: montagne, gagner, agneau.",
    example: "montagne",
  },
  {
    id: "cons-qu",
    topic: "Consonants",
    prompt: "How is « qu » pronounced, as in « qui »?",
    choices: ["Like 'k'", "Like 'kw' in quick", "Like 'kw' only before a"],
    answer: 0,
    explanation: "« qu » is a plain /k/ in French — the 'u' is silent: qui, que, quand, musique.",
    example: "qui",
  },
  {
    id: "cons-h",
    topic: "Consonants",
    prompt: "How is the « h » in « homme » pronounced?",
    choices: ["Silent — French 'h' is never sounded", "Like English 'h'", "Like 'k'"],
    answer: 0,
    explanation:
      "French « h » is always silent. (A 'mute h' also allows liaison/elision — l'homme — while an 'aspirated h' blocks them.)",
    example: "homme",
  },
  {
    id: "cons-r",
    topic: "Consonants",
    prompt: "The French « r » in « rouge » is…",
    choices: [
      "Guttural — from the back of the throat (/ʁ/)",
      "Rolled with the tongue tip",
      "Like the English 'r'",
    ],
    answer: 0,
    explanation:
      "French « r » is /ʁ/, made at the back of the throat, not with the tongue tip: rouge, Paris, très.",
    example: "rouge",
  },
  {
    id: "cons-s-voiced",
    topic: "Consonants",
    prompt: "A single « s » between two vowels, as in « maison », is pronounced…",
    choices: ["/z/ — like 'z'", "/s/ — like 'ss'", "Silent"],
    answer: 0,
    explanation:
      "One « s » between vowels is voiced /z/ (maison, rose); a double « ss » stays /s/ (poisson vs poison).",
    example: "maison",
  },
  {
    id: "cons-ill",
    topic: "Consonants",
    prompt: "How is « ill » usually pronounced, as in « fille »?",
    choices: ["Like 'y' in yes (/j/)", "Like the 'll' in 'bell'", "Silent"],
    answer: 0,
    explanation:
      "« ill » is usually /j/, the 'y' sound: fille, famille, travailler. (A few words like « ville » and « mille » keep /l/.)",
    example: "fille",
  },

  // ---------------- Silent letters ----------------
  {
    id: "silent-final-cons",
    topic: "Silent letters",
    prompt: "The final « t » in « petit » is…",
    choices: ["Silent", "Pronounced /t/", "Pronounced /d/"],
    answer: 0,
    explanation:
      "Most final consonants are silent: petit, grand, beaucoup. (The consonants in CaReFuL — c, r, f, l — are more often sounded.)",
    example: "petit",
  },
  {
    id: "silent-final-s",
    topic: "Silent letters",
    prompt: "How does the plural « -s » in « les chats » change the sound of « chat »?",
    choices: [
      "Not at all — the plural « -s » is silent",
      "It adds an /s/ at the end",
      "It adds a /z/ at the end",
    ],
    answer: 0,
    explanation:
      "The plural « -s » is silent, so chat and chats sound identical — the article (le vs les) carries the number.",
    example: "les chats",
  },
  {
    id: "silent-ent",
    topic: "Silent letters",
    prompt: "How is the « -ent » verb ending in « ils parlent » pronounced?",
    choices: ["Silent", "Nasal /ɑ̃/ (like « en »)", "Like 'ent' in 'tent'"],
    answer: 0,
    explanation:
      "The 3rd-person plural « -ent » ending is completely silent: il parle and ils parlent sound the same. (This only applies to the verb ending, not words like « souvent ».)",
    example: "parlent",
  },

  // ---------------- Liaison ----------------
  {
    id: "liaison-z",
    topic: "Liaison",
    prompt: "In « les amis », the normally-silent « s » of « les »…",
    choices: [
      "Is sounded as /z/ and links to « amis » (liaison)",
      "Stays silent",
      "Is sounded as /s/",
    ],
    answer: 0,
    explanation:
      "Liaison: a silent final consonant is pronounced before a vowel. « les » + « amis » → /le‿zami/, and the linked « s » sounds as /z/.",
    example: "les amis",
  },
  {
    id: "liaison-when",
    topic: "Liaison",
    prompt: "When does liaison happen?",
    choices: [
      "When a silent final consonant is followed by a word starting with a vowel or mute h",
      "Between any two words",
      "Only at the end of a sentence",
    ],
    answer: 0,
    explanation:
      "Liaison links a silent final consonant to a following vowel/mute-h: vous‿avez, un‿homme, deux‿enfants. Before a consonant there's no liaison.",
    example: "vous avez",
  },

  // ---------------- Accents ----------------
  {
    id: "accent-e-aigu",
    topic: "Accents",
    prompt: "How is « é » (e accent aigu) pronounced, as in « été »?",
    choices: ["A closed /e/ — like 'ay' in day (clipped)", "A silent e", "Like 'e' in bed"],
    answer: 0,
    explanation: "« é » is a closed /e/, roughly 'ay' without the glide: été, café, parlé.",
    example: "été",
  },
  {
    id: "accent-e-grave",
    topic: "Accents",
    prompt: "How is « è » (e accent grave) pronounced, as in « mère »?",
    choices: ["An open /ɛ/ — like 'e' in bed", "A closed /e/ — like 'ay' in day", "Silent"],
    answer: 0,
    explanation:
      "« è » (and « ê ») give an open /ɛ/, like 'e' in bed: mère, très, être — more open than « é ».",
    example: "mère",
  },
  {
    id: "accent-circonflexe",
    topic: "Accents",
    prompt: "The circumflex in « hôpital » mainly tells you…",
    choices: [
      "A letter (often 's') was dropped historically; here it doesn't change the vowel much",
      "To stress that syllable heavily",
      "That the vowel is silent",
    ],
    answer: 0,
    explanation:
      "The circumflex often marks a lost letter (hôpital ← hospital, forêt ← forest). It can open a vowel (ê = /ɛ/) but doesn't add stress.",
    example: "hôpital",
  },
];
