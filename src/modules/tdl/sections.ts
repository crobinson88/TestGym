import type { TdlSection } from "./types";

export interface SectionConfig {
  key: TdlSection;
  label: string;
  hasDueDate: boolean;
  hasTimeEstimate: boolean;
  recurringSeeds: string[];
}

export const SECTIONS: readonly SectionConfig[] = [
  {
    key: "weekly_goals",
    label: "Weekly Goals",
    hasDueDate: false,
    hasTimeEstimate: false,
    recurringSeeds: [],
  },
  {
    key: "follow_ups",
    label: "Follow Ups",
    hasDueDate: false,
    hasTimeEstimate: false,
    recurringSeeds: [],
  },
  {
    key: "product",
    label: "Product",
    hasDueDate: true,
    hasTimeEstimate: true,
    recurringSeeds: ["Bugs"],
  },
  {
    key: "tgm_tasks",
    label: "TGM Tasks",
    hasDueDate: true,
    hasTimeEstimate: true,
    recurringSeeds: [
      "TGM Email",
      "Op's Email",
      "Project Action Items",
      "Reports to Kyp",
      "Sales Trelloboard",
    ],
  },
  {
    key: "personal_other",
    label: "Personal Other",
    hasDueDate: false,
    hasTimeEstimate: false,
    recurringSeeds: ["Pay Rent", "Grandma Email", "Run Gusto"],
  },
  {
    key: "new",
    label: "New",
    hasDueDate: false,
    hasTimeEstimate: false,
    recurringSeeds: [],
  },
];

export const SECTION_BY_KEY: Record<TdlSection, SectionConfig> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s]),
) as Record<TdlSection, SectionConfig>;
