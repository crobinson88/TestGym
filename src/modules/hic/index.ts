export { hicRoutes } from "./routes";
export { useHicAttempts, useHicStats } from "./hooks";
export { computeStats, sectionFromQuestionId, topicFromQuestionId, pct } from "./stats";
export type { HicStats, SectionStat, TopicStat, MissedItem } from "./stats";
export {
  generateTest,
  makeQuestion,
  clampCount,
  passed,
  TEST_SIZE,
  TEST_SIZES,
  PASS_RATE,
} from "./quiz";
export type { Question, GenerateOptions, Rng } from "./quiz";
export { HIC_QUESTIONS } from "./data/questions";
export type { HicQuestion } from "./data/questions";
export { SECTIONS, sectionLabel, topicLabel } from "./data/sections";
export type { QuestionSection, SectionMeta } from "./data/sections";
