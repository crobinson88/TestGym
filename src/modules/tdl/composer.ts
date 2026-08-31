// Pure validation for the new-task composer. Shared by the per-category
// composer at the foot of a board column and the quick-add bar at the top of
// the day, so both gate on exactly the same rules.

import type { TdlQuadrant } from "@/lib/database.types";

export interface ComposerDraft {
  title: string;
  // Raw text from the minutes input; "" when the field is untouched.
  estimate: string;
  quadrant: TdlQuadrant | null;
  // Category key; null while nothing is picked.
  section: string | null;
  // Categories flagged with a time estimate require one on every new item.
  requiresEstimate: boolean;
}

export interface ComposerErrors {
  title: boolean;
  estimate: boolean;
  quadrant: boolean;
  section: boolean;
}

export interface ComposerValidation {
  ok: boolean;
  title: string;
  estimate: number | null;
  errors: ComposerErrors;
}

// Minutes must be a whole number greater than zero; anything else reads as
// "not given" (which only matters when the category requires one).
export function parseEstimate(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Math.trunc(Number(trimmed));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function validateDraft(draft: ComposerDraft): ComposerValidation {
  const title = draft.title.trim();
  const estimate = parseEstimate(draft.estimate);
  const errors: ComposerErrors = {
    title: title === "",
    estimate: draft.requiresEstimate && estimate == null,
    quadrant: draft.quadrant == null,
    section: !draft.section,
  };
  const ok = !errors.title && !errors.estimate && !errors.quadrant && !errors.section;
  return { ok, title, estimate, errors };
}
