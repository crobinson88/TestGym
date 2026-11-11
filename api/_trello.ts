// Trello REST helpers for the to-do list's "Push to Trello". The leading `_`
// keeps Vercel from turning this file into its own route; it is only imported by
// api/fireflies-import.ts, which multiplexes the trello-* actions for the same
// 12-function budget reason french-chat doubles as the sentence generator.
//
// Auth is a Trello Power-Up API key + a user token (TRELLO_API_KEY /
// TRELLO_TOKEN), sent in the OAuth header rather than the query string so the
// secrets never land in a logged URL. Neither ever reaches the browser.
import { env, type Db } from "./_fireflies.js";

const TRELLO = "https://api.trello.com/1";
const BUCKET = "share-images";
// Only objects the to-do list itself stored can be attached, so the endpoint
// can't be used to lift arbitrary files (trade images, research PDFs) out of the
// shared bucket.
const ATTACHABLE_PREFIX = "tdl/";
const MAX_CARDS = 25;
const MAX_IMAGES_PER_CARD = 10;
// Pushes only ever go to boards in this one Trello workspace, matched on its
// display name or its short name, case-insensitively. TRELLO_WORKSPACE
// overrides it without a code change.
export const WORKSPACE = process.env.TRELLO_WORKSPACE?.trim() || "TGM";

type Org = { name?: string; displayName?: string } | null | undefined;

export function inWorkspace(org: Org, workspace = WORKSPACE): boolean {
  if (!org) return false;
  const want = workspace.toLowerCase();
  return org.displayName?.trim().toLowerCase() === want || org.name?.trim().toLowerCase() === want;
}

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

export type PushCardInput = {
  itemId?: string;
  threadId?: string;
  name?: string;
  desc?: string;
  due?: string | null;
  images?: string[];
};
export type PushBody = {
  boardId?: string;
  boardName?: string;
  listId?: string;
  listName?: string;
  labelIds?: string[];
  memberIds?: string[];
  cards?: PushCardInput[];
};
export type PushResult = {
  itemId: string;
  ok: boolean;
  cardId?: string;
  url?: string;
  // Images that failed to attach; the card itself was still created.
  attachFailed?: number;
  error?: string;
};

function authHeader(): string {
  return `OAuth oauth_consumer_key="${env("TRELLO_API_KEY")}", oauth_token="${env("TRELLO_TOKEN")}"`;
}

async function trello<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${TRELLO}${path}`, {
    ...init,
    headers: { Authorization: authHeader(), Accept: "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Trello ${res.status}: ${text.trim().slice(0, 160) || res.statusText}`);
  return (text ? JSON.parse(text) : null) as T;
}

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{24}$/i.test(v);

export async function listBoards(): Promise<TrelloBoard[]> {
  // The open boards in the push workspace; boards in any other workspace (or
  // none) are never offered.
  const boards = await trello<{ id: string; name: string; url: string; organization?: Org }[]>(
    `/members/me/boards?filter=open&fields=name,url,idOrganization&organization=true&organization_fields=name,displayName`,
  );
  return boards
    .filter((b) => inWorkspace(b.organization))
    .map((b) => ({ id: b.id, name: b.name, url: b.url }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export async function boardMeta(boardId: string): Promise<TrelloBoardMeta> {
  if (!isId(boardId)) throw new Error("bad board id");
  const query = [
    "fields=name",
    "lists=open",
    "list_fields=name,pos",
    "labels=all",
    "label_fields=name,color",
    "labels_limit=1000",
    "members=all",
    "member_fields=fullName,username",
    "organization=true",
    "organization_fields=name,displayName",
  ].join("&");
  const b = await trello<{
    id: string;
    name: string;
    organization?: Org;
    lists?: (TrelloList & { pos?: number })[];
    labels?: TrelloLabel[];
    members?: TrelloMember[];
  }>(`/boards/${boardId}?${query}`);
  if (!inWorkspace(b.organization)) throw new Error(`board is not in the ${WORKSPACE} workspace`);
  return {
    id: b.id,
    name: b.name,
    lists: [...(b.lists ?? [])]
      .sort((x, y) => (x.pos ?? 0) - (y.pos ?? 0))
      .map((l) => ({ id: l.id, name: l.name })),
    labels: (b.labels ?? []).map((l) => ({ id: l.id, name: l.name ?? "", color: l.color ?? null })),
    members: (b.members ?? []).map((m) => ({ id: m.id, fullName: m.fullName, username: m.username })),
  };
}

async function attachImage(supabase: Db, cardId: string, path: string): Promise<void> {
  if (!path.startsWith(ATTACHABLE_PREFIX) || path.includes("..")) throw new Error("not attachable");
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(error?.message ?? "download failed");
  const filename = path.split("/").pop() || "image";
  const form = new FormData();
  form.append("file", data, filename);
  form.append("name", filename);
  if (data.type) form.append("mimeType", data.type);
  form.append("setCover", "false");
  await trello(`/cards/${cardId}/attachments`, { method: "POST", body: form });
}

// Create one card per input on the chosen list, attach its images, and log each
// created card against the task's chain so the dialog can warn before a re-push.
// Reported per card so a partial run is honest; a failed image attach or log
// write never undoes a card that now exists on Trello.
export async function pushCards(supabase: Db, body: PushBody): Promise<PushResult[]> {
  const boardId = body.boardId;
  const listId = body.listId;
  if (!isId(boardId) || !isId(listId)) throw new Error("pick a board and a list");
  const cards = (body.cards ?? []).filter((c) => c.itemId && c.name?.trim());
  if (cards.length === 0) throw new Error("no cards");
  if (cards.length > MAX_CARDS) throw new Error(`at most ${MAX_CARDS} cards per push`);
  // Re-checked here rather than trusted from the dialog: the board must be in
  // the push workspace and the list, labels and people must belong to it.
  const board = await boardMeta(boardId);
  if (!board.lists.some((l) => l.id === listId)) throw new Error("that list isn't on this board");
  const boardLabels = new Set(board.labels.map((l) => l.id));
  const boardMembers = new Set(board.members.map((m) => m.id));
  const labelIds = (body.labelIds ?? []).filter((id) => boardLabels.has(id));
  const memberIds = (body.memberIds ?? []).filter((id) => boardMembers.has(id));

  const results: PushResult[] = [];
  for (const c of cards) {
    const itemId = c.itemId!;
    try {
      const created = await trello<{ id: string; shortUrl?: string; url: string }>(`/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idList: listId,
          name: c.name!.trim().slice(0, 16384),
          desc: (c.desc ?? "").slice(0, 16384),
          due: c.due || null,
          idLabels: labelIds.join(","),
          idMembers: memberIds.join(","),
          pos: "bottom",
        }),
      });
      const url = created.shortUrl ?? created.url;

      let attachFailed = 0;
      for (const path of (c.images ?? []).slice(0, MAX_IMAGES_PER_CARD)) {
        try {
          await attachImage(supabase, created.id, path);
        } catch {
          attachFailed++;
        }
      }

      // The log is a convenience (the re-push warning), so its error is
      // ignored rather than reported as a failed card.
      if (c.threadId) {
        await supabase
          .from("tdl_trello_cards")
          .insert({
            thread_id: c.threadId,
            item_id: itemId,
            board_id: boardId,
            board_name: body.boardName ?? null,
            list_id: listId,
            list_name: body.listName ?? null,
            card_id: created.id,
            card_url: url,
            card_name: c.name!.trim(),
          });
      }

      results.push({
        itemId,
        ok: true,
        cardId: created.id,
        url,
        attachFailed: attachFailed || undefined,
      });
    } catch (e) {
      results.push({ itemId, ok: false, error: e instanceof Error ? e.message : "create failed" });
    }
  }
  return results;
}
