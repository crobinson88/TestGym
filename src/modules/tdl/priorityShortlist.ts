// Pure "potential priority" shortlist helpers for the status pass. Kept free of
// the sync/db layer so they stay import-safe in tests and cheap to reuse.
//
// The status pass walks the day one card at a time and each ruling is written
// as it is made — but deciding a task is *one of today's ten priorities* can't
// be done card by card, because you only know whether it beats the others once
// you have seen them all. So the pass carries a second, lighter gesture:
// **tag it a potential priority** and move on. Tags are held in modal state and
// write nothing; the shortlist is settled at the end of the pass (or the moment
// it overflows), and only then does anything hit the db.

import { MAX_PRIORITY_RANK } from "./priority";
import type { TdlQuadrant } from "@/lib/database.types";

// The cut is the day's ten priority ranks, so the shortlist can't be wider than
// the ranks it is spent on.
export const SHORTLIST_LIMIT = MAX_PRIORITY_RANK;

// Where a nominated task that doesn't make the ten ends up: the red
// "Urgent & Important" quadrant. It was worth nominating, so it stays on the
// board as a must-do rather than quietly losing its tag.
export const CUT_QUADRANT: TdlQuadrant = "do_first";

export interface Shortlist {
  // Every task tagged a potential priority, in the order it was tagged.
  nominated: string[];
  // The ones currently holding a slot, most important first. Never longer than
  // SHORTLIST_LIMIT; its order becomes ranks 1…n.
  picked: string[];
}

export function emptyShortlist(): Shortlist {
  return { nominated: [], picked: [] };
}

export function isNominated(s: Shortlist, id: string): boolean {
  return s.nominated.includes(id);
}

export function isPicked(s: Shortlist, id: string): boolean {
  return s.picked.includes(id);
}

export function hasRoom(s: Shortlist): boolean {
  return s.picked.length < SHORTLIST_LIMIT;
}

// Tag a task. It takes a slot straight away while there is one free — the first
// ten nominations are provisionally the ten, so a pass that never overflows
// needs no re-picking at all. Once the slots are full a new tag still joins the
// shortlist, just unpicked, which is what tips the pass into a whittle.
export function nominate(s: Shortlist, id: string): Shortlist {
  if (isNominated(s, id)) return s;
  return {
    nominated: [...s.nominated, id],
    picked: hasRoom(s) ? [...s.picked, id] : s.picked,
  };
}

// Untag it entirely — not a cut, a "that was a mis-tap". It leaves the
// shortlist, so it is neither ranked nor pushed to Do First.
export function denominate(s: Shortlist, id: string): Shortlist {
  if (!isNominated(s, id)) return s;
  return {
    nominated: s.nominated.filter((x) => x !== id),
    picked: s.picked.filter((x) => x !== id),
  };
}

export function toggleNomination(s: Shortlist, id: string): Shortlist {
  return isNominated(s, id) ? denominate(s, id) : nominate(s, id);
}

// Swap a task in or out of the ten. Picking is refused when the slots are full
// rather than silently evicting someone: the user has to say who loses.
export function togglePick(s: Shortlist, id: string): Shortlist {
  if (!isNominated(s, id)) return s;
  if (isPicked(s, id)) return { ...s, picked: s.picked.filter((x) => x !== id) };
  if (!hasRoom(s)) return s;
  return { ...s, picked: [...s.picked, id] };
}

// Nudge a pick up (-1) or down (+1) the order, which is what sets its rank.
export function movePick(s: Shortlist, id: string, delta: number): Shortlist {
  const from = s.picked.indexOf(id);
  if (from === -1) return s;
  const to = from + delta;
  if (to < 0 || to >= s.picked.length) return s;
  const picked = [...s.picked];
  const [moved] = picked.splice(from, 1);
  picked.splice(to, 0, moved);
  return { ...s, picked };
}

// Nominated but not holding a slot: headed for Do First unless swapped back in.
export function cutIds(s: Shortlist): string[] {
  return s.nominated.filter((id) => !isPicked(s, id));
}

// More candidates than slots — the point at which the pass stops to make the
// user cut it back down rather than letting tags pile up unseen.
export function isOverflowing(s: Shortlist): boolean {
  return cutIds(s).length > 0;
}

export function shortlistSize(s: Shortlist): number {
  return s.nominated.length;
}

// The ranks to write: picked order → 1…n (1 = most important).
export function rankAssignments(s: Shortlist): { id: string; rank: number }[] {
  return s.picked.map((id, i) => ({ id, rank: i + 1 }));
}

// Order a card list by the shortlist's own order — picks first in rank order,
// then the cut ones in the order they were tagged — so the whittle screen reads
// top to bottom as the ten and then the rest.
export function orderShortlist<T extends { id: string }>(
  s: Shortlist,
  byId: ReadonlyMap<string, T>,
): T[] {
  const ids = [...s.picked, ...cutIds(s)];
  return ids
    .map((id) => byId.get(id))
    .filter((x): x is T => x !== undefined);
}

// Seed a shortlist from tasks that already carry a rank, so opening a pass on a
// day that is already prioritised starts from that list rather than from empty.
export function seedFromRanked(
  items: ReadonlyArray<{ id: string; priority_rank: number | null }>,
): Shortlist {
  const ranked = items
    .filter((i) => i.priority_rank != null)
    .sort((a, b) => (a.priority_rank as number) - (b.priority_rank as number))
    .slice(0, SHORTLIST_LIMIT)
    .map((i) => i.id);
  return { nominated: [...ranked], picked: [...ranked] };
}

// The one-line result of a settled shortlist.
export function describeShortlist(s: Shortlist): string {
  const cut = cutIds(s).length;
  if (s.picked.length === 0 && cut === 0) return "No priorities set";
  const head =
    s.picked.length === 0
      ? "No priorities set"
      : `${s.picked.length} priorit${s.picked.length === 1 ? "y" : "ies"} set`;
  if (cut === 0) return head;
  return `${head} · ${cut} to Do First`;
}
