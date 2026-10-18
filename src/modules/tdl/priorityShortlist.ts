// Pure "potential priority" shortlist helpers for the status pass. Kept free of
// the sync/db layer so they stay import-safe in tests and cheap to reuse.
//
// The status pass walks the day one card at a time and each ruling is written
// as it is made — but deciding a task is *one of today's ten priorities* can't
// be done card by card, because you only know whether it beats the others once
// you have seen them all. So the pass carries a second, lighter gesture:
// **tag it a potential priority** and move on. Tagging is unlimited and never
// interrupts the walk; the shortlist is sorted once, at the end of the pass,
// and only then does anything hit the db.

import { MAX_PRIORITY_RANK } from "./priority";
import type { TdlQuadrant } from "@/lib/database.types";

// How many of the sorted shortlist become ranked priorities. The cut is the
// day's ten priority ranks; everything below the line goes to Do First.
export const SHORTLIST_LIMIT = MAX_PRIORITY_RANK;

// Where a nominated task that doesn't make the ten ends up: the red
// "Urgent & Important" quadrant. It was worth nominating, so it stays on the
// board as a must-do rather than quietly losing its tag.
export const CUT_QUADRANT: TdlQuadrant = "do_first";

export interface Shortlist {
  // Every task tagged a potential priority, in priority order. The first
  // SHORTLIST_LIMIT take ranks 1…n; the rest are the cut. There is no cap on
  // how many can be tagged — the line is drawn when the list is sorted, not
  // while it is being collected.
  nominated: string[];
}

export function emptyShortlist(): Shortlist {
  return { nominated: [] };
}

export function isNominated(s: Shortlist, id: string): boolean {
  return s.nominated.includes(id);
}

// The ones above the line, most important first. Their order becomes ranks 1…n.
export function pickedIds(s: Shortlist): string[] {
  return s.nominated.slice(0, SHORTLIST_LIMIT);
}

// Nominated but below the line: headed for Do First unless moved up.
export function cutIds(s: Shortlist): string[] {
  return s.nominated.slice(SHORTLIST_LIMIT);
}

export function isPicked(s: Shortlist, id: string): boolean {
  const i = s.nominated.indexOf(id);
  return i !== -1 && i < SHORTLIST_LIMIT;
}

// Tag a task. It joins the end of the list, wherever that falls relative to the
// line — a tag is "this is a candidate", not "this is in", so it never has to
// evict anyone and never stops the pass.
export function nominate(s: Shortlist, id: string): Shortlist {
  if (isNominated(s, id)) return s;
  return { nominated: [...s.nominated, id] };
}

// Untag it entirely — not a cut, a "that was a mis-tap". It leaves the
// shortlist, so it is neither ranked nor pushed to Do First.
export function denominate(s: Shortlist, id: string): Shortlist {
  if (!isNominated(s, id)) return s;
  return { nominated: s.nominated.filter((x) => x !== id) };
}

export function toggleNomination(s: Shortlist, id: string): Shortlist {
  return isNominated(s, id) ? denominate(s, id) : nominate(s, id);
}

function moveTo(s: Shortlist, id: string, to: number): Shortlist {
  const from = s.nominated.indexOf(id);
  if (from === -1 || to < 0 || to >= s.nominated.length || to === from) return s;
  const nominated = [...s.nominated];
  const [moved] = nominated.splice(from, 1);
  nominated.splice(to, 0, moved);
  return { nominated };
}

// Nudge a task up (-1) or down (+1) the sorted list. It moves across the line
// like any other step, so sorting works the same whether or not more than
// SHORTLIST_LIMIT were tagged.
export function moveNomination(
  s: Shortlist,
  id: string,
  delta: number,
): Shortlist {
  const from = s.nominated.indexOf(id);
  if (from === -1) return s;
  return moveTo(s, id, from + delta);
}

// Jump a cut task over the line, into the last ranked slot — the one-tap way to
// say "this one is in", pushing whoever held that slot down into the cut.
export function promote(s: Shortlist, id: string): Shortlist {
  if (!isNominated(s, id) || isPicked(s, id)) return s;
  return moveTo(s, id, SHORTLIST_LIMIT - 1);
}

// The reverse: drop a ranked task to the top of the cut, keeping it on the
// shortlist (and so on its way to Do First) rather than untagging it.
export function demote(s: Shortlist, id: string): Shortlist {
  if (!isPicked(s, id)) return s;
  return moveTo(s, id, Math.min(SHORTLIST_LIMIT, s.nominated.length - 1));
}

export function shortlistSize(s: Shortlist): number {
  return s.nominated.length;
}

// The ranks to write: the sorted list's first SHORTLIST_LIMIT → 1…n.
export function rankAssignments(s: Shortlist): { id: string; rank: number }[] {
  return pickedIds(s).map((id, i) => ({ id, rank: i + 1 }));
}

// Order a card list by the shortlist's own order, so the cut screen reads top
// to bottom as the ten and then the rest.
export function orderShortlist<T extends { id: string }>(
  s: Shortlist,
  byId: ReadonlyMap<string, T>,
): T[] {
  return s.nominated
    .map((id) => byId.get(id))
    .filter((x): x is T => x !== undefined);
}

// Seed a shortlist from tasks that already carry a rank, so opening a pass on a
// day that is already prioritised starts from that list rather than from empty.
export function seedFromRanked(
  items: ReadonlyArray<{ id: string; priority_rank: number | null }>,
): Shortlist {
  return {
    nominated: items
      .filter((i) => i.priority_rank != null)
      .sort((a, b) => (a.priority_rank as number) - (b.priority_rank as number))
      .map((i) => i.id),
  };
}

// The one-line result of a settled shortlist.
export function describeShortlist(s: Shortlist): string {
  const picked = pickedIds(s).length;
  const cut = cutIds(s).length;
  if (picked === 0 && cut === 0) return "No priorities set";
  const head =
    picked === 0
      ? "No priorities set"
      : `${picked} priorit${picked === 1 ? "y" : "ies"} set`;
  if (cut === 0) return head;
  return `${head} · ${cut} to Do First`;
}
