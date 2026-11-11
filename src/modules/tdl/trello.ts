// Push to Trello — the pure half. Turns to-do tasks into editable card drafts,
// validates a push, and reads the push log. The network edges live in
// trelloApi.ts so everything here stays testable.
import type { LocalTdlItem } from "./types";

export type TrelloBoard = { id: string; name: string; url: string };
export type TrelloList = { id: string; name: string };
export type TrelloLabel = { id: string; name: string; color: string | null };
export type TrelloMember = { id: string; fullName: string; username: string };
export type TrelloBoardMeta = {
  id: string;
  name: string;
  lists: TrelloList[];
  labels: TrelloLabel[];
  members: TrelloMember[];
};

export type DraftImage = { path: string; on: boolean };

// One card-to-be per task, edited in the push dialog before anything is sent.
export interface CardDraft {
  itemId: string;
  threadId: string;
  // In a multi-task push a draft can be left out without closing the dialog.
  include: boolean;
  name: string;
  desc: string;
  // YYYY-MM-DD, or "" for no due date.
  due: string;
  images: DraftImage[];
}

export interface PushCard {
  itemId: string;
  threadId: string;
  name: string;
  desc: string;
  due: string | null;
  images: string[];
}

export interface PushResult {
  itemId: string;
  ok: boolean;
  cardId?: string;
  url?: string;
  attachFailed?: number;
  error?: string;
}

// The log row the dialog reads to warn before a re-push.
export interface PushedCard {
  thread_id: string;
  card_url: string;
  card_name: string;
  board_name: string | null;
  list_name: string | null;
  created_at: string;
}

// The task's notes, then a line carrying what Trello has no field for (the
// category, the time estimate, the priority rank), so it isn't lost on the way.
export function defaultCardDescription(item: LocalTdlItem, categoryLabel: string): string {
  const meta = [`From to-do list · ${categoryLabel}`];
  if (item.time_estimate_min != null) meta.push(`${item.time_estimate_min} min`);
  if (item.priority_rank != null) meta.push(`Priority ${item.priority_rank}`);
  const notes = item.notes?.trim();
  return notes ? `${notes}\n\n---\n${meta.join(" · ")}` : meta.join(" · ");
}

export function draftFromItem(
  item: LocalTdlItem,
  threadId: string,
  categoryLabel: string,
): CardDraft {
  return {
    itemId: item.id,
    threadId,
    include: true,
    name: item.title,
    desc: defaultCardDescription(item, categoryLabel),
    due: item.due_date ?? "",
    images: (item.images ?? []).map((path) => ({ path, on: true })),
  };
}

// A date with no time lands at 09:00 local — Trello stores a UTC instant, and
// midnight UTC would read as the day before anywhere west of Greenwich.
export function dueToIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const d = new Date(`${date}T09:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function toPushCards(drafts: readonly CardDraft[]): PushCard[] {
  return drafts
    .filter((d) => d.include)
    .map((d) => ({
      itemId: d.itemId,
      threadId: d.threadId,
      name: d.name.trim(),
      desc: d.desc,
      due: dueToIso(d.due),
      images: d.images.filter((i) => i.on).map((i) => i.path),
    }));
}

// Why the push button is disabled, or null when it can go.
export function pushBlocker(
  boardId: string | null,
  listId: string | null,
  drafts: readonly CardDraft[],
): string | null {
  if (!boardId) return "Pick a board";
  if (!listId) return "Pick a list";
  const included = drafts.filter((d) => d.include);
  if (included.length === 0) return "Nothing ticked to push";
  if (included.some((d) => !d.name.trim())) return "Every card needs a name";
  return null;
}

// thread_id → its most recent push, so the dialog can say where it already went.
export function latestPushByThread(rows: readonly PushedCard[]): Map<string, PushedCard> {
  const out = new Map<string, PushedCard>();
  for (const r of rows) {
    const prev = out.get(r.thread_id);
    if (!prev || r.created_at > prev.created_at) out.set(r.thread_id, r);
  }
  return out;
}

export function describePushResults(results: readonly PushResult[]): string {
  const ok = results.filter((r) => r.ok).length;
  const failed = results.length - ok;
  const lostImages = results.reduce((n, r) => n + (r.attachFailed ?? 0), 0);
  const parts = [ok === 1 ? "1 card created" : `${ok} cards created`];
  if (failed) parts.push(`${failed} failed`);
  if (lostImages) parts.push(`${lostImages} image${lostImages === 1 ? "" : "s"} didn't attach`);
  return parts.join(" · ");
}

export function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

// Trello's own label colours (not the app palette) so a label reads the same
// here as it does on the board. Unknown or colourless labels fall back to grey.
const LABEL_COLOURS: Record<string, string> = {
  green: "#4bce97",
  yellow: "#f5cd47",
  orange: "#fea362",
  red: "#f87168",
  purple: "#9f8fef",
  blue: "#579dff",
  sky: "#6cc3e0",
  lime: "#94c748",
  pink: "#e774bb",
  black: "#8590a2",
};

export function labelSwatch(color: string | null): string {
  if (!color) return "#8590a2";
  const base = color.replace(/_(dark|light)$/, "");
  return LABEL_COLOURS[base] ?? "#8590a2";
}

export function labelText(label: TrelloLabel): string {
  if (label.name.trim()) return label.name;
  return label.color ? label.color.replace(/_/g, " ") : "No colour";
}

// The board + list last pushed to, remembered per device so a run of pushes
// to the same list is one tap each.
const TARGET_KEY = "tdl:trelloTarget";

export type TrelloTarget = { boardId: string | null; listId: string | null };

export function parseTarget(raw: string | null): TrelloTarget {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<TrelloTarget>) : {};
    return {
      boardId: typeof v.boardId === "string" ? v.boardId : null,
      listId: typeof v.listId === "string" ? v.listId : null,
    };
  } catch {
    return { boardId: null, listId: null };
  }
}

export function loadTrelloTarget(): TrelloTarget {
  try {
    return parseTarget(localStorage.getItem(TARGET_KEY));
  } catch {
    return { boardId: null, listId: null };
  }
}

export function saveTrelloTarget(target: TrelloTarget): void {
  try {
    localStorage.setItem(TARGET_KEY, JSON.stringify(target));
  } catch {
    // the pick just isn't remembered
  }
}
