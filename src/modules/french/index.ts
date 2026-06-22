export { frenchRoutes } from "./routes";
export { useFrenchAttempts, useFrenchStats, useFrenchWeeklyAccuracy } from "./hooks";
export { computeStats, weeklyAccuracy, pct } from "./stats";
export type { FrenchStats, KindStats, MissedItem, WeekAccuracyPoint } from "./stats";
export {
  generateTest,
  generateVocabTest,
  generateRulesTest,
  generateConjugationTest,
  KIND_LABELS,
  TEST_SIZE,
} from "./quiz";
export type { Question, VocabDirection, ConjTense } from "./quiz";
export { SCENARIOS, sendChat } from "./chat";
export type { Scenario, ChatTurn } from "./chat";
export { VOCAB, VERBS, WORDS } from "./data/vocab";
export { CONJ_VERBS } from "./data/conjugations";
export { RULE_QUESTIONS } from "./data/rules";
export { GUIDE } from "./data/guide";
export type { GuideSection, GuidePoint, GuideExample, GuidePointKind } from "./data/guide";
