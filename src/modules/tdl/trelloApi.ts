// Network edges of "Push to Trello". Every Trello call goes through the
// multiplexed meeting-import endpoint (api/ is at Vercel's Hobby-plan
// 12-function cap); the Trello key and token never reach the browser.
import { supabase } from "@/lib/supabase";
import type {
  PushCard,
  PushResult,
  PushedCard,
  TrelloBoard,
  TrelloBoardMeta,
} from "./trello";

async function call<T>(token: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/api/fireflies-import", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: (T & { error?: string }) | null = null;
  try {
    parsed = JSON.parse(text) as T & { error?: string };
  } catch {
    parsed = null;
  }
  if (!res.ok || !parsed) {
    const detail = parsed?.error ?? text.trim().slice(0, 140);
    throw new Error(detail ? `Trello (${res.status}): ${detail}` : `Trello request failed (${res.status})`);
  }
  return parsed;
}

export async function fetchTrelloBoards(token: string): Promise<TrelloBoard[]> {
  const r = await call<{ boards?: TrelloBoard[] }>(token, { action: "trello-boards" });
  return r.boards ?? [];
}

export async function fetchTrelloBoard(token: string, boardId: string): Promise<TrelloBoardMeta> {
  return call<TrelloBoardMeta>(token, { action: "trello-board", boardId });
}

export async function pushToTrello(
  token: string,
  target: { boardId: string; boardName: string; listId: string; listName: string },
  labelIds: string[],
  memberIds: string[],
  cards: PushCard[],
): Promise<PushResult[]> {
  const r = await call<{ results?: PushResult[] }>(token, {
    action: "trello-push",
    ...target,
    labelIds,
    memberIds,
    cards,
  });
  return r.results ?? [];
}

// Read straight from Supabase: the dialog is online-only anyway. A failed read
// (offline, table not migrated yet) just means no re-push warning.
export async function fetchPushedCards(threadIds: string[]): Promise<PushedCard[]> {
  if (threadIds.length === 0) return [];
  const { data, error } = await supabase
    .from("tdl_trello_cards")
    .select("thread_id, card_url, card_name, board_name, list_name, created_at")
    .in("thread_id", threadIds)
    .is("deleted_at", null);
  if (error || !data) return [];
  return data as PushedCard[];
}
