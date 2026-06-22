export { frenchRoutes } from "./routes";
export { useFrenchAttempts, useFrenchStats, useFrenchWeeklyAccuracy } from "./hooks";
export { computeStats, weeklyAccuracy, pct } from "./stats";
export type { FrenchStats, KindStats, MissedItem, WeekAccuracyPoint } from "./stats";
export {
  generateTest,
  generateVocabTest,
  generateRulesTest,
  TEST_SIZE,
} from "./quiz";
export type { Question } from "./quiz";
export { VOCAB, VERBS, WORDS } from "./data/vocab";
export { RULE_QUESTIONS } from "./data/rules";
export { GUIDE } from "./data/guide";
export type { GuideSection, GuidePoint, GuideExample, GuidePointKind } from "./data/guide";
