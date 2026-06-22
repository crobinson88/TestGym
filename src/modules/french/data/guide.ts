export interface GuideExample {
  fr: string; // a French example sentence or phrase
  en: string; // its English translation
}

export type GuidePointKind = "rule" | "tip" | "warning" | "note";

export interface GuidePoint {
  kind: GuidePointKind; // "rule" = 📌 core rule, "tip" = 💡, "warning" = ⚠️ common mistake, "note" = plain explanation
  text: string;         // the explanation, plain text (no emoji)
  examples?: GuideExample[]; // optional worked examples
}

export interface GuideSection {
  id: string;    // stable kebab-case slug, unique, e.g. "noun-gender"
  title: string; // e.g. "Noun Gender"
  intro: string; // 1-2 sentence overview of the topic
  points: GuidePoint[];
}

export const GUIDE: GuideSection[] = [
  {
    id: "noun-gender",
    title: "Noun Gender",
    intro:
      "Every French noun is either masculine or feminine, and the gender affects articles, adjectives and past tenses. Always learn each noun together with its article.",
    points: [
      {
        kind: "rule",
        text:
          "Always learn a noun with its article because gender is not predictable from meaning. Endings give strong hints, but memorise the gender of each new word.",
      },
      {
        kind: "rule",
        text:
          "Usually masculine endings: -age, -ment, -eau, -isme, abstract -eur, and -phone/-scope.",
        examples: [
          { fr: "le garage, le voyage, le fromage", en: "the garage, the trip, the cheese (-age)" },
          { fr: "le gouvernement, le moment", en: "the government, the moment (-ment)" },
          { fr: "le chapeau, le bateau", en: "the hat, the boat (-eau)" },
          { fr: "le tourisme, le journalisme", en: "tourism, journalism (-isme)" },
          { fr: "le bonheur, le malheur", en: "happiness, misfortune (abstract -eur)" },
          { fr: "le téléphone, le microscope", en: "the telephone, the microscope (-phone/-scope)" },
        ],
      },
      {
        kind: "warning",
        text:
          "Watch the masculine-ending exceptions: la plage, la cage, la page (-age); l'eau (f), la peau (-eau); la chaleur, la couleur, la fleur (-eur).",
      },
      {
        kind: "rule",
        text:
          "Usually feminine endings: -tion/-sion, -ure, -ette, -ance/-ence, -té/-tié, -ée, -ie. The ending -tion is ALWAYS feminine, the single most reliable gender rule.",
        examples: [
          { fr: "la nation, la décision", en: "the nation, the decision (-tion/-sion)" },
          { fr: "la voiture, la nature", en: "the car, nature (-ure)" },
          { fr: "la baguette", en: "the baguette (-ette)" },
          { fr: "la chance, la science", en: "luck, science (-ance/-ence)" },
          { fr: "la liberté, l'amitié", en: "freedom, friendship (-té/-tié)" },
          { fr: "la journée, l'idée", en: "the day, the idea (-ée)" },
          { fr: "la pharmacie", en: "the pharmacy (-ie)" },
        ],
      },
      {
        kind: "warning",
        text:
          "Watch the feminine-ending exceptions: le squelette (-ette); le silence (-ence); le côté, le comité (-té); le musée (-ée); le génie (-ie).",
      },
      {
        kind: "warning",
        text:
          "Never guess the gender of a new word from its look alone. Memorise it, because getting it wrong cascades into articles, adjective agreement and past participles.",
      },
      {
        kind: "note",
        text:
          "Countries have gender too. Most are feminine (la France, la Chine, l'Italie, l'Allemagne, la Russie); many are masculine (le Portugal, le Japon, le Canada, le Mexique, le Brésil, l'Iran); some are plural (les États-Unis, les Pays-Bas, les Philippines).",
      },
      {
        kind: "rule",
        text:
          "To say 'in/to' a country: EN before a feminine country, AU before a masculine country, AUX before a plural country.",
        examples: [
          { fr: "Je vis en France.", en: "I live in France." },
          { fr: "Je vis au Japon.", en: "I live in Japan." },
          { fr: "Je vis aux États-Unis.", en: "I live in the United States." },
        ],
      },
    ],
  },
  {
    id: "definite-articles",
    title: "Definite Articles",
    intro:
      "The definite article ('the') is le, la, l' or les, and French also uses it for general statements where English uses no article at all.",
    points: [
      {
        kind: "rule",
        text:
          "The four forms: le (masculine singular), la (feminine singular), l' (before a vowel or silent h), les (all plurals).",
        examples: [
          { fr: "le chien", en: "the dog (m sing)" },
          { fr: "la maison", en: "the house (f sing)" },
          { fr: "l'ami, l'heure", en: "the friend, the hour (before vowel/silent h)" },
          { fr: "les enfants", en: "the children (plural)" },
        ],
      },
      {
        kind: "rule",
        text:
          "Use le/la/les for GENERAL statements where English drops the article.",
        examples: [
          { fr: "J'aime le café.", en: "I love coffee (in general)." },
          { fr: "Les chats sont indépendants.", en: "Cats are independent." },
          { fr: "La liberté est importante.", en: "Freedom is important." },
        ],
      },
      {
        kind: "tip",
        text:
          "If you can add 'in general' to the English and it still makes sense, use le/la/les.",
      },
      {
        kind: "rule",
        text:
          "Contractions with à: à+le = au, à+les = aux.",
        examples: [
          { fr: "Je vais au marché.", en: "I'm going to the market (à+le)." },
          { fr: "Je parle aux enfants.", en: "I'm talking to the children (à+les)." },
        ],
      },
      {
        kind: "rule",
        text:
          "Contractions with de: de+le = du, de+les = des.",
        examples: [
          { fr: "le chien du voisin", en: "the neighbour's dog (de+le)" },
          { fr: "la couleur des yeux", en: "the colour of the eyes (de+les)" },
        ],
      },
      {
        kind: "warning",
        text:
          "à+la and de+la do NOT contract, and la / l' NEVER contract. Only le and les contract.",
        examples: [
          { fr: "Je parle du professeur.", en: "I'm talking about the professor (de+le)." },
          { fr: "Je parle de la directrice.", en: "I'm talking about the director (no contraction)." },
        ],
      },
    ],
  },
  {
    id: "indefinite-articles",
    title: "Indefinite Articles",
    intro:
      "The indefinite article ('a/an/some') is un, une or des; French keeps des where English often drops 'some'.",
    points: [
      {
        kind: "rule",
        text:
          "The forms: un (masculine), une (feminine), des (plural of both).",
        examples: [
          { fr: "un livre", en: "a book (m)" },
          { fr: "une table", en: "a table (f)" },
          { fr: "des livres", en: "(some) books (plural)" },
        ],
      },
      {
        kind: "rule",
        text:
          "des is the plural of both un and une. English often drops 'some', but French keeps des.",
      },
      {
        kind: "warning",
        text:
          "After NEGATION, un/une/des all become DE (or D' before a vowel).",
        examples: [
          { fr: "J'ai un chien → Je n'ai pas de chien.", en: "I have a dog → I don't have a dog." },
          { fr: "Nous avons des amis → Nous n'avons pas d'amis.", en: "We have friends → We don't have any friends." },
        ],
      },
      {
        kind: "rule",
        text:
          "After a profession used with être, drop the article.",
        examples: [
          { fr: "Il est médecin.", en: "He is a doctor (no 'un')." },
          { fr: "Elle est professeure.", en: "She is a teacher." },
        ],
      },
      {
        kind: "tip",
        text:
          "When the profession carries an adjective, the article comes back.",
        examples: [
          { fr: "C'est un bon médecin.", en: "He's a good doctor." },
        ],
      },
    ],
  },
  {
    id: "partitive-articles",
    title: "Partitive Articles",
    intro:
      "The partitive article expresses 'some' of an uncountable quantity: du, de la, de l' or des.",
    points: [
      {
        kind: "rule",
        text:
          "The forms: du (= de+le), de la, de l' (before a vowel or h), des.",
        examples: [
          { fr: "du pain", en: "some bread" },
          { fr: "de la soupe", en: "some soup" },
          { fr: "de l'eau, de l'huile", en: "some water, some oil" },
          { fr: "des épinards", en: "some spinach" },
        ],
      },
      {
        kind: "rule",
        text:
          "Use the partitive for an unspecified portion of something uncountable.",
      },
      {
        kind: "note",
        text:
          "Partitive vs definite: the definite article is for general likes/dislikes, the partitive for 'some right now'.",
        examples: [
          { fr: "J'aime le café. / Je bois du café.", en: "I like coffee (general). / I'm drinking (some) coffee (now)." },
          { fr: "J'aime la musique. / Elle fait de la musique.", en: "I like music. / She makes music." },
        ],
      },
      {
        kind: "warning",
        text:
          "After negation ALL of un/une/des/du/de la/de l' become just DE (or D' before a vowel).",
        examples: [
          { fr: "Je mange du pain → Je ne mange pas de pain.", en: "I eat bread → I don't eat bread." },
          { fr: "Elle boit de l'eau → Elle ne boit pas d'eau.", en: "She drinks water → She doesn't drink water." },
        ],
      },
    ],
  },
  {
    id: "etre",
    title: "Être — To Be",
    intro:
      "Être ('to be') is irregular and must be memorised; it covers identity, description and location.",
    points: [
      {
        kind: "rule",
        text:
          "Conjugation: je suis, tu es, il/elle/on est, nous sommes, vous êtes, ils/elles sont.",
      },
      {
        kind: "rule",
        text:
          "Use être for identity and description.",
        examples: [
          { fr: "Je suis étudiant.", en: "I am a student." },
          { fr: "Elle est grande et intelligente.", en: "She is tall and intelligent." },
        ],
      },
      {
        kind: "rule",
        text:
          "Use être for nationality, expressed as a lowercase adjective.",
        examples: [
          { fr: "Il est français.", en: "He is French." },
          { fr: "Nous sommes britanniques.", en: "We are British." },
        ],
      },
      {
        kind: "rule",
        text:
          "Use être for location.",
        examples: [
          { fr: "Le livre est sur la table.", en: "The book is on the table." },
          { fr: "Je suis à Paris.", en: "I am in Paris." },
        ],
      },
      {
        kind: "warning",
        text:
          "Never use être for age. French uses avoir.",
        examples: [
          { fr: "J'ai 25 ans.", en: "I am 25 (NOT 'Je suis 25 ans')." },
        ],
      },
      {
        kind: "warning",
        text:
          "Nationalities after être are lowercase adjectives, not capitalised.",
        examples: [
          { fr: "Il est anglais.", en: "He is English (not 'Anglais')." },
        ],
      },
    ],
  },
  {
    id: "avoir",
    title: "Avoir — To Have",
    intro:
      "Avoir ('to have') is irregular; beyond possession it expresses age and many idioms that English renders with 'to be'.",
    points: [
      {
        kind: "rule",
        text:
          "Conjugation: j'ai, tu as, il/elle/on a, nous avons, vous avez, ils/elles ont.",
      },
      {
        kind: "rule",
        text:
          "Use avoir for possession.",
        examples: [
          { fr: "J'ai un appartement.", en: "I have an apartment." },
          { fr: "Tu as des frères ?", en: "Do you have brothers?" },
        ],
      },
      {
        kind: "rule",
        text:
          "Use avoir for AGE, where English uses 'to be'.",
        examples: [
          { fr: "J'ai vingt-cinq ans.", en: "I am 25 (literally 'I have 25 years')." },
          { fr: "Elle a huit ans.", en: "She is eight years old." },
        ],
      },
      {
        kind: "rule",
        text:
          "Avoir idioms translate with 'to be' in English: avoir faim (be hungry), avoir soif (be thirsty), avoir chaud (be hot), avoir froid (be cold), avoir peur (be afraid), avoir raison (be right), avoir tort (be wrong), avoir besoin de (to need), avoir envie de (to want / feel like), avoir l'air (to seem / look).",
        examples: [
          { fr: "J'ai faim.", en: "I'm hungry." },
          { fr: "Elle a l'air fatiguée.", en: "She looks tired." },
        ],
      },
    ],
  },
  {
    id: "er-verbs",
    title: "Regular -ER Verbs",
    intro:
      "Regular -ER verbs are the largest, most predictable verb group; drop -er and add a fixed set of endings.",
    points: [
      {
        kind: "rule",
        text:
          "Remove -er and add: je -e, tu -es, il/elle/on -e, nous -ons, vous -ez, ils/elles -ent.",
        examples: [
          { fr: "parler → je parle, tu parles, il parle, nous parlons, vous parlez, ils parlent", en: "to speak → I speak, you speak, he speaks, we speak, you speak, they speak" },
        ],
      },
      {
        kind: "tip",
        text:
          "Verbs in -ger add an e before -ons to keep the soft g.",
        examples: [
          { fr: "nous mangeons, nous voyageons", en: "we eat, we travel" },
        ],
      },
      {
        kind: "note",
        text:
          "The endings -e, -es and -ent are all silent, so je parle, tu parles and ils parlent sound identical.",
      },
      {
        kind: "note",
        text:
          "Common -ER verbs to know: aimer, habiter, travailler, écouter, regarder, chercher, parler, manger.",
      },
      {
        kind: "warning",
        text:
          "Aller ('to go') looks like an -ER verb but is irregular: je vais, tu vas, il/elle/on va, nous allons, vous allez, ils/elles vont.",
      },
      {
        kind: "rule",
        text:
          "Aller + infinitive expresses the near future.",
        examples: [
          { fr: "Je vais manger ce soir.", en: "I'm going to eat tonight." },
          { fr: "Nous allons voyager en France.", en: "We are going to travel in France." },
        ],
      },
    ],
  },
  {
    id: "adjectives",
    title: "Adjectives",
    intro:
      "French adjectives agree in gender and number with their noun, and most follow the noun while a small set (BAGS) precedes it.",
    points: [
      {
        kind: "rule",
        text:
          "Agreement: add -e for feminine, -s for masculine plural, -es for feminine plural. If the adjective already ends in -e, it is the same in masculine and feminine.",
        examples: [
          { fr: "rouge / rouge", en: "red (m) / red (f) — unchanged" },
        ],
      },
      {
        kind: "rule",
        text:
          "Irregular feminine patterns: -eux→-euse (heureux/heureuse), -er→-ère (premier/première), -if→-ive (actif/active), -el→-elle (naturel/naturelle), -en→-enne (ancien/ancienne), -on→-onne (bon/bonne).",
      },
      {
        kind: "tip",
        text:
          "Special masculine forms before a vowel: beau→bel, nouveau→nouvel, vieux→vieil.",
        examples: [
          { fr: "un bel homme", en: "a handsome man" },
          { fr: "un nouvel ami", en: "a new friend" },
          { fr: "un vieil arbre", en: "an old tree" },
        ],
      },
      {
        kind: "rule",
        text:
          "Most adjectives go AFTER the noun.",
        examples: [
          { fr: "une robe rouge", en: "a red dress" },
          { fr: "un homme intelligent", en: "an intelligent man" },
          { fr: "une ville magnifique", en: "a magnificent city" },
        ],
      },
      {
        kind: "rule",
        text:
          "BAGS adjectives go BEFORE the noun: Beauty (beau, joli), Age (jeune, vieux, nouveau, ancien), Good/Bad (bon, mauvais, meilleur), Size (grand, petit, gros, long, court).",
        examples: [
          { fr: "une jolie fille", en: "a pretty girl" },
          { fr: "un vieux monsieur", en: "an old gentleman" },
          { fr: "une bonne idée", en: "a good idea" },
          { fr: "un petit chien", en: "a small dog" },
        ],
      },
      {
        kind: "warning",
        text:
          "Some adjectives change meaning depending on position: ancien (un ancien ami = former / un ami ancien = very old), grand (un grand homme = great / un homme grand = tall), propre (ma propre chambre = own / une chambre propre = clean), pauvre (le pauvre homme = poor/pitiable / un homme pauvre = penniless), cher (ma chère amie = dear / une robe chère = expensive).",
      },
    ],
  },
  {
    id: "negation",
    title: "Negation",
    intro:
      "Basic negation wraps the verb in ne … pas, and other negative words swap in for pas to express never, no longer, nothing and more.",
    points: [
      {
        kind: "rule",
        text:
          "Standard negation: ne + verb + pas.",
        examples: [
          { fr: "Je ne parle pas français.", en: "I don't speak French." },
          { fr: "Elle ne mange pas.", en: "She isn't eating." },
        ],
      },
      {
        kind: "rule",
        text:
          "ne becomes n' before a vowel or silent h.",
        examples: [
          { fr: "Je n'aime pas les épinards.", en: "I don't like spinach." },
          { fr: "Il n'habite pas à Paris.", en: "He doesn't live in Paris." },
        ],
      },
      {
        kind: "rule",
        text:
          "Other negatives pairing with ne: ne...jamais (never), ne...plus (no longer/anymore), ne...rien (nothing), ne...personne (nobody), ne...que (only), ne...ni...ni (neither...nor).",
        examples: [
          { fr: "Je n'aime ni le thé ni le café.", en: "I like neither tea nor coffee." },
        ],
      },
      {
        kind: "note",
        text:
          "In casual spoken French the ne is usually dropped, but keep ne in writing.",
        examples: [
          { fr: "Je sais pas.", en: "I dunno (spoken; written: Je ne sais pas)." },
          { fr: "C'est pas vrai.", en: "That's not true (spoken; written: Ce n'est pas vrai)." },
        ],
      },
    ],
  },
  {
    id: "questions",
    title: "Asking Questions",
    intro:
      "There are three ways to ask a yes/no question, from casual to formal, plus a set of question words for information questions.",
    points: [
      {
        kind: "rule",
        text:
          "Three ways to form a question: rising intonation (casual), est-ce que (neutral, use this most), and inversion (formal).",
        examples: [
          { fr: "Tu parles français ?", en: "You speak French? (intonation)" },
          { fr: "Est-ce que tu parles français ?", en: "Do you speak French? (est-ce que)" },
          { fr: "Parles-tu français ?", en: "Do you speak French? (inversion)" },
        ],
      },
      {
        kind: "rule",
        text:
          "Inversion: hyphenate the verb and pronoun. If the verb ends in a vowel and the pronoun starts with a vowel, insert -t- between them.",
        examples: [
          { fr: "Parle-t-il ?", en: "Does he speak?" },
          { fr: "Mange-t-elle ?", en: "Is she eating?" },
          { fr: "Va-t-on ?", en: "Shall we go?" },
        ],
      },
      {
        kind: "note",
        text:
          "Question words: qui (who), que/quoi (what), où (where), quand (when), pourquoi (why), comment (how), combien de (how many/much), quel(le) (which/what).",
      },
      {
        kind: "rule",
        text:
          "Quel agrees with its noun in gender and number: quel (m sg), quelle (f sg), quels (m pl), quelles (f pl).",
        examples: [
          { fr: "Quelle heure est-il ?", en: "What time is it?" },
        ],
      },
    ],
  },
  {
    id: "pronouns",
    title: "Subject Pronouns",
    intro:
      "Subject pronouns identify who does the action; French distinguishes informal tu from formal/plural vous, and has on for casual 'we'.",
    points: [
      {
        kind: "rule",
        text:
          "The pronouns: je (j' before a vowel or h), tu (informal you), il (he/it m), elle (she/it f), on (informal 'we', conjugated like il/elle), nous (we), vous (formal you or any plural you), ils (they, masculine or mixed), elles (they, all-female only).",
        examples: [
          { fr: "j'aime, j'habite", en: "I like, I live (je → j' before a vowel/h)" },
          { fr: "On va au cinéma.", en: "We're going to the cinema (on = casual 'we')." },
        ],
      },
      {
        kind: "warning",
        text:
          "ils is the default for mixed groups. Even 99 women and 1 man take ils; elles is only for a 100% female group.",
      },
      {
        kind: "rule",
        text:
          "tu vs vous: use tu for friends, family, children and pets; use vous for strangers, elders, authority figures, formal settings, and any group of people.",
      },
      {
        kind: "tip",
        text:
          "When unsure, use vous. French speakers may invite tu by saying 'On peut se tutoyer ?' ('Shall we use tu?').",
      },
    ],
  },
  {
    id: "cest-vs-il-est",
    title: "C'est vs Il est",
    intro:
      "Both translate as 'he/she/it is', but c'est goes before nouns, names and stressed pronouns, while il est / elle est goes before bare adjectives and professions.",
    points: [
      {
        kind: "rule",
        text:
          "Use c'est before a noun with an article, a name, a stressed pronoun, or an adjective commenting on a whole idea or situation.",
        examples: [
          { fr: "C'est un médecin.", en: "He/She is a doctor (noun + article)." },
          { fr: "C'est Marie.", en: "It's Marie (name)." },
          { fr: "C'est lui. / C'est moi.", en: "It's him. / It's me (stressed pronoun)." },
          { fr: "C'est intéressant !", en: "That's interesting! (commenting on an idea)" },
        ],
      },
      {
        kind: "rule",
        text:
          "Use il est / elle est before a bare adjective describing the person, a profession with no article, or a nationality adjective.",
        examples: [
          { fr: "Il est grand.", en: "He is tall (bare adjective)." },
          { fr: "Elle est professeure.", en: "She is a teacher (profession, no article)." },
          { fr: "Il est canadien.", en: "He is Canadian (nationality adjective)." },
        ],
      },
      {
        kind: "tip",
        text:
          "Quick test: article or noun following → c'est; bare adjective or profession following → il/elle est.",
      },
      {
        kind: "warning",
        text:
          "This distinction trips up even advanced learners, so check what follows before choosing.",
      },
    ],
  },
  {
    id: "prepositions",
    title: "Prepositions of Place & Time",
    intro:
      "Prepositions locate things in space and time; the same little words (à, de, en, au) behave differently for places versus times, with spring as a notable exception.",
    points: [
      {
        kind: "rule",
        text:
          "Place — countries and cities: à (at/in/to a city), de (from/of), en (in/to a feminine country), au/aux (in/to a masculine/plural country).",
        examples: [
          { fr: "Je suis à Paris.", en: "I am in Paris." },
          { fr: "Je viens de Londres.", en: "I come from London." },
          { fr: "Je vis en France.", en: "I live in France." },
          { fr: "Il va au Japon. / Elle va aux USA.", en: "He goes to Japan. / She goes to the USA." },
        ],
      },
      {
        kind: "rule",
        text:
          "Place — position: dans (inside), sur (on), sous (under), devant (in front of), derrière (behind), entre (between), près de (near), loin de (far from), à côté de (next to), en face de (opposite).",
        examples: [
          { fr: "Le chat est dans la boîte.", en: "The cat is in the box." },
        ],
      },
      {
        kind: "rule",
        text:
          "Time: à (at a clock time, à trois heures), en (in a month/year/season except spring, en janvier, en 2024, en été), au (au printemps — spring is the exception), le/les (on a regular day, le lundi = on Mondays), dans (in, counting from now, dans trois jours), depuis (since/for an ongoing situation, depuis deux ans), pendant (during/for a completed span, pendant une heure), avant (before), après (after).",
        examples: [
          { fr: "à trois heures", en: "at three o'clock" },
          { fr: "en janvier, en 2024, en été", en: "in January, in 2024, in summer" },
          { fr: "le lundi", en: "on Mondays" },
          { fr: "dans trois jours", en: "in three days (from now)" },
          { fr: "depuis deux ans", en: "for two years (ongoing)" },
        ],
      },
      {
        kind: "tip",
        text:
          "Seasons take en except spring: en été, en automne, en hiver, BUT au printemps.",
      },
    ],
  },
];
