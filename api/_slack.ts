// Reading a user's own Slack messages over a date range, for the comms review
// pass on the to-do list.
//
// It has to be a USER token (xoxp-): `search.messages` runs as the user and a
// bot token cannot call it at all, which is also why there is a
// `slack_workspaces` table rather than one env-var token — the grant is
// per-workspace and each is granted once by `npm run slack:auth`.
//
// The leading `_` keeps this out of Vercel's route table; it is only imported.
import { type Db } from "./_fireflies.js";

// Per workspace, PER REQUEST. Slack caps `count` at 100; 100 messages across a
// handful of workspaces is already a lot of text to put through one Claude
// call, so the pass pages rather than fetching a whole week at once.
export const SLACK_PAGE_SIZE = 100;

export interface SlackWorkspace {
  id: string;
  label: string;
  team_id: string;
  slack_user_id: string;
  access_token: string;
}

// What the browser is told about a workspace: enough to badge a card, and never
// the token.
export interface PublicWorkspace {
  id: string;
  label: string;
}

export interface SlackMessage {
  workspaceId: string;
  workspaceLabel: string;
  // Slack's per-message id within a channel, and the stable half of the ledger
  // key: `comms_matches.comm_key`.
  ts: string;
  channel: string;
  text: string;
  permalink: string | null;
  at: string | null;
}

export async function listWorkspaces(supabase: Db): Promise<SlackWorkspace[]> {
  const { data, error } = await supabase
    .from("slack_workspaces")
    .select("id, label, team_id, slack_user_id, access_token")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SlackWorkspace[];
}

export function publicWorkspace(w: SlackWorkspace): PublicWorkspace {
  return { id: w.id, label: w.label };
}

type SlackResponse = { ok: boolean; error?: string };

async function slackGet<T extends SlackResponse>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://slack.com/api/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => null)) as T | null;
  // Slack answers HTTP 200 with ok:false, so the status alone proves nothing.
  if (!body) throw new Error(`Slack API ${res.status} returned no JSON`);
  if (!body.ok) {
    const detail = body.error ?? "search failed";
    // A revoked grant or a bot token lands here; say what fixes it.
    const hint =
      detail === "not_allowed_token_type" || detail === "invalid_auth" || detail === "token_revoked"
        ? " — re-run npm run slack:auth"
        : detail === "missing_scope"
          ? " — add search:read as a USER scope and reinstall, then npm run slack:auth"
          : "";
    throw new Error(`${detail}${hint}`);
  }
  return body;
}

// A Slack `ts` is "<unix seconds>.<counter>".
export function tsToIso(ts: string): string | null {
  const seconds = Number.parseFloat(ts);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

// Slack's `after:`/`before:` are day-granular and exclusive of the named day,
// so the query is deliberately widened by a day on each side and the exact
// range is enforced on the timestamps instead. That stays correct whether or
// not Slack's boundary behaviour is what the docs imply.
export function widenDay(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildQuery(userId: string, from: string, to: string): string {
  return `from:<@${userId}> after:${widenDay(from, -1)} before:${widenDay(to, 1)}`;
}

// Inclusive of both end days, in UTC. The comms review is a "what did I work on
// between these dates" question, so a message at 23:50 on the last day counts.
export function withinRange(iso: string | null, from: string, to: string): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= from && day <= to;
}

export interface SlackFetch {
  messages: SlackMessage[];
  // How many the query matched in total, per Slack — usually far more than one
  // page. Carried to the UI so the size of what is waiting is stated.
  matched: number;
  // 1-based next page, or null at the end.
  nextPage: number | null;
}

type SearchResult = SlackResponse & {
  messages?: {
    total?: number;
    paging?: { count?: number; total?: number; page?: number; pages?: number };
    matches?: {
      ts?: string;
      text?: string;
      permalink?: string;
      channel?: { id?: string; name?: string };
    }[];
  };
};

// One page of a workspace's messages inside the range, newest first.
export async function fetchSlackMessages(
  workspace: SlackWorkspace,
  from: string,
  to: string,
  page = 1,
): Promise<SlackFetch> {
  const query = buildQuery(workspace.slack_user_id, from, to);
  const result = await slackGet<SearchResult>(
    workspace.access_token,
    `search.messages?query=${encodeURIComponent(query)}&count=${SLACK_PAGE_SIZE}` +
      `&page=${page}&sort=timestamp&sort_dir=desc`,
  );

  const matches = result.messages?.matches ?? [];
  const paging = result.messages?.paging;
  const pages = paging?.pages ?? 1;
  const nextPage = page < pages ? page + 1 : null;

  const messages = matches
    .map((m): SlackMessage | null => {
      if (!m.ts) return null;
      const at = tsToIso(m.ts);
      // The widened query can return the day either side; keep the real range.
      if (!withinRange(at, from, to)) return null;
      return {
        workspaceId: workspace.id,
        workspaceLabel: workspace.label,
        ts: m.ts,
        channel: m.channel?.name ? `#${m.channel.name}` : (m.channel?.id ?? "unknown"),
        text: m.text ?? "",
        permalink: m.permalink ?? null,
        at,
      };
    })
    .filter((m): m is SlackMessage => m !== null);

  return {
    messages,
    matched: result.messages?.total ?? matches.length,
    nextPage,
  };
}
