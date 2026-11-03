import type { HicSection } from "@/lib/database.types";

// A drillable section of the DCWP Home Improvement Contractor study guide. `all`
// is not a real question section — it's the mixed full-length practice test — so
// it's kept out of this list and handled separately by the home screen.
export type QuestionSection = Exclude<HicSection, "all">;

export interface SectionMeta {
  key: QuestionSection;
  label: string;
  blurb: string;
}

// The four guide sections, in the order they appear in the study guide. Question
// ids are prefixed with the section key (`licensing:scope-1`) so per-section stats
// can be recovered from an attempt's per-question details.
export const SECTIONS: readonly SectionMeta[] = [
  {
    key: "licensing",
    label: "Licensing & the law",
    blurb: "§I · Scope, who needs a licence, duties, penalties",
  },
  {
    key: "contracts",
    label: "Contracts & cancellation",
    blurb: "§II · Written contracts, required terms, the 3-day right",
  },
  {
    key: "advertising",
    label: "Advertising",
    blurb: "§III · Licence number, claims, guarantees",
  },
  {
    key: "operations",
    label: "Running the job",
    blurb: "§IV · Permits, subs & employees, bonds, sales tax",
  },
];

const LABELS: Record<HicSection, string> = {
  all: "Full practice exam",
  licensing: "Licensing & the law",
  contracts: "Contracts & cancellation",
  advertising: "Advertising",
  operations: "Running the job",
};

export function sectionLabel(section: HicSection): string {
  return LABELS[section] ?? section;
}

// `scope` / `prime-duties` / `contract-contents` → "Scope" / "Prime duties" /
// "Contract contents". The topics are free-text tags on the question bank rather
// than a fixed list, so this is a formatter, not a lookup.
export function topicLabel(topic: string): string {
  const spaced = topic.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
