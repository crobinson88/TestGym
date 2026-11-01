export { frenchRoutes } from "./routes";
export {
  useFrenchAttempts,
  useRuleTopicStats,
  useFrenchStats,
  useFrenchWeeklyAccuracy,
  useVocabMastery,
  useVocabMasteryProgress,
} from "./hooks";
export {
  computeStats,
  ruleTopicAccuracy,
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
  TopicAccuracy,
} from "./stats";
export {
  generateTest,
  generateVocabTest,
  generateRulesTest,
  generateConjugationTest,
  generatePronunciationTest,
  generateSpeakingTest,
  clampCount,
  parseCountInput,
  ruleTopics,
  filterRules,
  parseTopics,
  encodeTopics,
  topicSlug,
  KIND_LABELS,
  TEST_SIZE,
  TEST_SIZES,
  MIN_TEST_SIZE,
} from "./quiz";
export type { Question, VocabDirection, ConjTense, RuleTopicOption } from "./quiz";
export { SCENARIOS, sendChat } from "./chat";
export type { Scenario, ChatTurn } from "./chat";
export { VOCAB, VERBS, WORDS, WORDS_EXT } from "./data/vocab";
export { CONJ_VERBS } from "./data/conjugations";
export { RULE_QUESTIONS } from "./data/rules";
export type { RuleQuestion, RuleTopic } from "./data/rules";
export { PRON_QUESTIONS } from "./data/pronunciation";
export type { PronQuestion, PronTopic } from "./data/pronunciation";
export { GUIDE } from "./data/guide";
export type { GuideSection, GuidePoint, GuideExample, GuidePointKind } from "./data/guide";
