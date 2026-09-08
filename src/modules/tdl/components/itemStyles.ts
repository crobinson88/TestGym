import type { AgeLevel } from "../age";
import type { TdlQuadrant } from "@/lib/database.types";

// Border + background that intensify as an item goes unworked, up to 3 days
// stale. Level 0 keeps a transparent left rail so every row stays aligned.
// Shared by the list rows and the board cards.
export const AGE_CLASSES: Record<AgeLevel, string> = {
  0: "border-l-2 border-l-transparent",
  1: "border-l-2 border-l-warn/40 bg-warn/[0.04]",
  2: "border-l-2 border-l-warn/70 bg-warn/[0.07]",
  3: "border-l-2 border-l-danger/80 bg-danger/[0.10]",
};

// Quadrant accent colour; muted when unclassified.
export const QUADRANT_COLOR: Record<TdlQuadrant, string> = {
  do_first: "text-danger",
  schedule: "text-accent",
  delegate: "text-warn",
  eliminate: "text-muted",
};
