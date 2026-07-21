import type { DrivingSection } from "@/lib/database.types";

// A drillable section of the NYS Driver's Manual. `all` is not a real question
// section — it's the mixed full-length practice test — so it's kept out of this
// list and handled separately by the home screen.
export type QuestionSection = Exclude<DrivingSection, "all">;

export interface SectionMeta {
  key: QuestionSection;
  label: string;
  blurb: string;
}

// The taggable sections, in the order they appear on the home screen. Question
// ids are prefixed with the section key (`signs:stop-shape`) so per-section stats
// can be recovered from an attempt's per-question details.
export const SECTIONS: readonly SectionMeta[] = [
  { key: "signs", label: "Signs & signals", blurb: "Shapes, colours, traffic lights" },
  { key: "rules", label: "Traffic laws", blurb: "Lights, wipers, phones, lane lines" },
  { key: "rightofway", label: "Right of way", blurb: "Intersections, yielding, pedestrians" },
  { key: "speed", label: "Speed & space", blurb: "Limits, following distance, stopping" },
  { key: "parking", label: "Parking & stopping", blurb: "Distances, curbs, school buses" },
  { key: "safety", label: "Safe driving", blurb: "Defensive habits, skids, weather" },
  { key: "alcohol", label: "Alcohol & drugs", blurb: "BAC limits, zero tolerance, the law" },
  { key: "emergencies", label: "Emergencies", blurb: "Breakdowns, skids, tyre blowouts" },
];

const LABELS: Record<DrivingSection, string> = {
  all: "Full practice test",
  signs: "Signs & signals",
  rules: "Traffic laws",
  rightofway: "Right of way",
  speed: "Speed & space",
  parking: "Parking & stopping",
  safety: "Safe driving",
  alcohol: "Alcohol & drugs",
  emergencies: "Emergencies",
};

export function sectionLabel(section: DrivingSection): string {
  return LABELS[section] ?? section;
}
