export { frenchRoutes } from "./routes";
export {
  useFrenchAttempts,
  useFrenchStats,
  useFrenchWeeklyAccuracy,
  useVocabMastery,
  useVocabMasteryProgress,
} from "./hooks";
export {
  computeStats,
  weeklyAccuracy,
  vocabMastery,
  vocabMasteryProgress,
  pct,
} from "./stats";
export type {
  FrenchStats,
  KindStats,
  MissedItem,
  WeekAccuracyPoint,
  VocabMastery,
  MasteryPoint,
} from "./stats";
export {
  generateTest,
  generateVocabTest,
  generateRulesTest,
  generateConjugationTest,
  generatePronunciationTest,
  generateSpeakingTest,
  clampCount,
  KIND_LABELS,
  TEST_SIZE,
  TEST_SIZES,
} from "./quiz";
export type { Question, VocabDirection, ConjTense } from "./quiz";
export { SCENARIOS, sendChat } from "./chat";
export type { Scenario, ChatTurn } from "./chat";
export { VOCAB, VERBS, WORDS, WORDS_EXT } from "./data/vocab";
export { CONJ_VERBS } from "./data/conjugations";
export { RULE_QUESTIONS } from "./data/rules";
export { PRON_QUESTIONS } from "./data/pronunciation";
export type { PronQuestion, PronTopic } from "./data/pronunciation";
export { GUIDE } from "./data/guide";
export type { GuideSection, GuidePoint, GuideExample, GuidePointKind } from "./data/guide";
