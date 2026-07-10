import type { LocalTdlCategory } from "@/lib/db";
import type { TdlSection } from "./types";

export interface SectionConfig {
  key: TdlSection;
  label: string;
  hasDueDate: boolean;
  hasTimeEstimate: boolean;
  recurringSeeds: string[];
}

// Items whose section no longer matches a live category fall into this virtual
// group. Its key is reserved and never stored on an item.
export const UNCATEGORISED_KEY = "__uncategorised__";

export const UNCATEGORISED: SectionConfig = {
  key: UNCATEGORISED_KEY,
  label: "Uncategorised",
  hasDueDate: true,
  hasTimeEstimate: true,
  recurringSeeds: [],
};

// The Priorities board column is a virtual, read-only mirror of every ranked
// item across the day (see selectPriorityItems). Its key is reserved and never
// stored on an item — items keep their real section and appear here too.
export const PRIORITIES_KEY = "__priorities__";

export const PRIORITIES: SectionConfig = {
  key: PRIORITIES_KEY,
  label: "Priorities",
  hasDueDate: true,
  hasTimeEstimate: true,
  recurringSeeds: [],
};

export function toSectionConfig(cat: LocalTdlCategory): SectionConfig {
  return {
    key: cat.key,
    label: cat.label,
    hasDueDate: cat.has_due_date,
    hasTimeEstimate: cat.has_time_estimate,
    recurringSeeds: [],
  };
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
    key: "meeting_action_items",
    label: "Meeting Action Items",
    hasDueDate: true,
    hasTimeEstimate: true,
    recurringSeeds: [],
  },
  {
    key: "personal_other",
    label: "Personal Other",
    hasDueDate: false,
    hasTimeEstimate: false,
    recurringSeeds: ["Pay Rent", "Grandma Email", "Run Gusto"],
  },
];

export const SECTION_BY_KEY: Record<TdlSection, SectionConfig> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s]),
) as Record<TdlSection, SectionConfig>;
