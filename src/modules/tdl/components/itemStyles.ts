import type { AgeLevel } from "../age";
import type { TdlQuadrant } from "@/lib/database.types";

// Border + background that intensify as an item goes unworked, up to 3 days
// stale. Level 0 keeps a transparent left rail so every row stays aligned.
// Shared by the list rows and the board cards. The tints themselves are CSS
// classes (styles.css) because light mode needs a weaker wash than dark.
export const AGE_CLASSES: Record<AgeLevel, string> = {
  0: "border-l-2 border-l-transparent",
  1: "border-l-2 tdl-age-1",
  2: "border-l-2 tdl-age-2",
  3: "border-l-2 tdl-age-3",
};

// Quadrant accent colour; muted when unclassified.
export const QUADRANT_COLOR: Record<TdlQuadrant, string> = {
  do_first: "text-danger",
  schedule: "text-accent",
  delegate: "text-warn",
  eliminate: "text-muted",
};
