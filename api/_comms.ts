// The comms review pass: read what the user actually wrote across Slack and
// email over a date range, and match it against the tasks on their to-do list.
//
// Writes NOTHING. It hands back candidates — one card per task with the
// communications that evidence it — and the browser writes the rulings once the
// pass is confirmed, the same propose-then-confirm rule the email review,
// suggested-snooze and roll-forward flows follow.
//
// The leading `_` keeps this out of Vercel's route table; it is only imported.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env, type Db } from "./_fireflies.js";
import {
  accessTokenFor,
  fetchMessages,
  listAccounts,
  newestPerThread,
  publicAccount,
  type PublicAccount,
} from "./_gmail.js";
import {
  fetchSlackMessages,
  listWorkspaces,
  publicWorkspace,
  withinRange,
  widenDay,
  type PublicWorkspace,
  type SlackMessage,
} from "./_slack.js";

const MODEL = "claude-sonnet-4-6";
// Enough of a message to judge it by; a long thread's tail rarely changes the
// verdict and the budget is one Claude call over every comm in the page.
const MAX_TEXT_CHARS = 1200;
// Per mailbox, per request. Smaller than the email review's page because each
// message here is weighed against every open task, not read on its own.
const EMAIL_PAGE_SIZE = 25;
// A board carries hundreds of tasks once it has rolled forward for months (this
// one sits around 480 in flight), and a task dropped here can never be matched,
// so the cap is set well above that rather than snugly: a title costs ~15
// tokens, so even the whole board is a few thousand — cheap next to the comms
// themselves. Rows arrive newest-day-first, so if the cap ever does bite it
// sheds the stalest tasks, and the UI states how many were weighed.
const MAX_TASKS = 400;

export type CommsSource = "slack" | "email";

// One communication the user sent, from either source.
export interface Comm {
  source: CommsSource;
  // Stable id within the source: a Slack `ts` or a Gmail thread id. With
  // `source` this is the ledger key (`comms_matches.comm_key`).
  key: string;
  // Which workspace or mailbox it came from.
  accountLabel: string;
  // "#channel" for Slack, the subject line for email.
  heading: string;
  text: string;
  url: string | null;
  at: string | null;
}

// A task on the board, as matched against.
export interface TaskRef {
  // The roll-forward chain root: what the ledger keys on, because a task gets a
  // fresh row every day it carries over.
  threadId: string;
  // The row the ruling is made on.
  itemId: string;
  title: string;
  categoryKey: string;
  categoryLabel: string;
  status: string;
}

// One card in the pass: a task, the comms that evidence it, and Claude's read.
export interface CommsCandidate {
  threadId: string;
  itemId: string;
  itemTitle: string;
  categoryLabel: string;
  status: string;
  // 'done': the comms say the task shipped. 'connected': related, but not
  // finished. The user overrules either in a tap — this is advice, not a filter.
  verdict: "done" | "connected";
  reason: string;
  comms: Comm[];
}

// Where each source got to, so the pass walks the range a page at a time
// without the server holding state between requests.
export interface CommsCursors {
  // Slack pages are 1-based ints; Gmail hands back an opaque page token.
  slack?: Record<string, number | null>;
  email?: Record<string, string | null>;
}

export interface CommsOutcome {
  workspaces: PublicWorkspace[];
  accounts: PublicAccount[];
  candidates: CommsCandidate[];
  // Communications read and put through matching in THIS request.
  scanned: number;
  // How much the range holds in total, across every source.
  matched: number;
  // How many tasks the comms were weighed against.
  tasks: number;
  cursors: CommsCursors;
  done: boolean;
  // Per-source failures, so one revoked grant never reads as a quiet week.
  errors: { source: CommsSource; label: string; message: string }[];
}

// Gmail's `before:` is exclusive and both bounds are day-granular, so the query
// is widened and the real range enforced on the timestamps — the same thing
// _slack.ts does, for the same reason.
export function emailQuery(from: string, to: string): string {
  const after = widenDay(from, -1).replace(/-/g, "/");
  const before = widenDay(to, 1).replace(/-/g, "/");
  return `in:sent after:${after} before:${before}`;
}

// Walk `origin_item_id` to the first row still in the set, cycle-guarded — the
// server-side twin of chain.ts's rootItemId. Everything that must survive
// overnight keys on the chain root, because the row itself is replaced daily.
export function rootOf(
  id: string,
  parents: ReadonlyMap<string, string | null>,
): string {
  let current = id;
  const seen = new Set<string>([current]);
  for (;;) {
    const parent = parents.get(current);
    if (!parent || !parents.has(parent) || seen.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
}

type ItemRow = {
  id: string;
  title: string;
  section: string;
  status: string;
  snapshot_date: string;
  origin_item_id: string | null;
};

// The tasks worth matching against: live, un-archived, still in flight, and
// deduped to the newest row of each roll-forward chain. Recurring tasks are
// left out for the same reason triage and the completion flow leave them out —
// they reset daily, so "done" on one is a tick, not finished work.
export async function loadTasks(supabase: Db, from: string): Promise<TaskRef[]> {
  const { data: items, error } = await supabase
    .from("tdl_items")
    .select("id, title, section, status, snapshot_date, origin_item_id")
    .gte("snapshot_date", from)
    .is("deleted_at", null)
    .eq("is_archived", false)
    .eq("is_recurring", false)
    .not("status", "in", "(done,cancelled)")
    .order("snapshot_date", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);

  const rows = (items ?? []) as unknown as ItemRow[];
  const parents = new Map(rows.map((r) => [r.id, r.origin_item_id] as const));

  const { data: cats } = await supabase
    .from("tdl_categories")
    .select("key, label")
    .is("deleted_at", null);
  const labels = new Map(
    ((cats ?? []) as unknown as { key: string; label: string }[]).map((c) => [c.key, c.label]),
  );

  // Rows arrive newest-first, so the first row seen for a chain is its latest.
  const byChain = new Map<string, TaskRef>();
  for (const row of rows) {
    const threadId = rootOf(row.id, parents);
    if (byChain.has(threadId)) continue;
    byChain.set(threadId, {
      threadId,
      itemId: row.id,
      title: row.title,
      categoryKey: row.section,
      categoryLabel: labels.get(row.section) ?? "Uncategorised",
      status: row.status,
    });
  }
  return [...byChain.values()].slice(0, MAX_TASKS);
}

// Pairs already ruled, so a comm the user dismissed against a task does not
// come back every pass. Keyed exactly as the partial unique index is.
export function pairKey(threadId: string, source: CommsSource, commKey: string): string {
  return `${threadId}|${source}|${commKey}`;
}

async function ruledPairs(supabase: Db): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("comms_matches")
    .select("thread_id, source, comm_key")
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return new Set(
    ((data ?? []) as unknown as { thread_id: string; source: CommsSource; comm_key: string }[]).map(
      (r) => pairKey(r.thread_id, r.source, r.comm_key),
    ),
  );
}

const Matches = z.object({
  matches: z.array(
    z.object({
      // Index into the task list we sent.
      task_index: z.number(),
      // Indexes into the comm list we sent.
      comm_indexes: z.array(z.number()),
      verdict: z.enum(["done", "connected"]),
      reason: z.string(),
    }),
  ),
});

const SYSTEM = `You match a single user's own sent communications against their to-do list.

You are given TASKS (still open on the board) and COMMS (Slack messages and
emails the user themselves sent in the period). Return one entry per task you
found real evidence for. Say nothing about tasks with no evidence — do not pad
the list.

- comm_indexes: every comm that evidences that task. At least one.
- verdict:
  - "done" ONLY when the comms show the work is finished — it was sent,
    delivered, signed, shipped, filed, paid, decided. The user is about to be
    asked to tick it off, so be strict.
  - "connected" when the comms are clearly about the task but the work is still
    in flight: scheduling it, chasing it, promising it, discussing it, or
    finishing one part while explicitly committing to another.
  - If a comm says a thing was completed but also promises a further step on the
    same task, that is "connected", not "done".
- reason: one short sentence quoting or paraphrasing what in the comms settles
  it, so the user can rule without opening every message.

Match on substance, not keyword overlap. A task and a comm sharing a company
name but nothing else is not a match.`;

export async function matchTasksToComms(
  tasks: readonly TaskRef[],
  comms: readonly Comm[],
): Promise<CommsCandidate[]> {
  if (tasks.length === 0 || comms.length === 0) return [];

  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  const renderedTasks = tasks
    .map((t, i) => `[${i}] (${t.categoryLabel}, ${t.status}) ${t.title}`)
    .join("\n");
  const renderedComms = comms
    .map(
      (c, i) =>
        `[${i}] ${c.source === "slack" ? "Slack" : "Email"} · ${c.accountLabel} · ${c.heading}` +
        `${c.at ? ` · ${c.at.slice(0, 10)}` : ""}\n${c.text.slice(0, MAX_TEXT_CHARS)}`,
    )
    .join("\n\n---\n\n");

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(Matches) },
    messages: [
      { role: "user", content: `TASKS\n${renderedTasks}\n\n\nCOMMS\n${renderedComms}` },
    ],
  });

  const out: CommsCandidate[] = [];
  for (const m of response.parsed_output?.matches ?? []) {
    // The model can hallucinate an out-of-range index; drop rather than misfile.
    const task = tasks[m.task_index];
    if (!task) continue;
    const evidence = m.comm_indexes
      .map((i) => comms[i])
      .filter((c): c is Comm => Boolean(c));
    if (evidence.length === 0) continue;
    out.push({
      threadId: task.threadId,
      itemId: task.itemId,
      itemTitle: task.title,
      categoryLabel: task.categoryLabel,
      status: task.status,
      verdict: m.verdict,
      reason: m.reason,
      comms: evidence,
    });
  }
  return out;
}

// Gather the next slice of what the user wrote across every Slack workspace and
// mailbox in the range, and match it against the board. Writes nothing.
export async function collectCommsCandidates(
  supabase: Db,
  from: string,
  to: string,
  cursors: CommsCursors = {},
): Promise<CommsOutcome> {
  const [workspaces, accounts, tasks, ruled] = await Promise.all([
    listWorkspaces(supabase),
    listAccounts(supabase),
    loadTasks(supabase, from),
    ruledPairs(supabase),
  ]);

  const errors: CommsOutcome["errors"] = [];
  const nextSlack: Record<string, number | null> = {};
  const nextEmail: Record<string, string | null> = {};

  type SourceResult = {
    comms: Comm[];
    matched: number;
    scanned: number;
    // Whether this source has reached the end of the range. A source that
    // failed is neither finished nor resumable, so it is false and `failed`.
    exhausted: boolean;
    failed: boolean;
  };

  const slackResults = await Promise.all(
    workspaces.map(async (w): Promise<SourceResult> => {
      const page = cursors.slack?.[w.id] ?? 1;
      // A null cursor means this workspace already reached the end of the
      // range. Carry the null forward, or the next request restarts it at
      // page 1 and deals its first page again.
      if (page === null) {
        nextSlack[w.id] = null;
        return { comms: [], matched: 0, scanned: 0, exhausted: true, failed: false };
      }
      try {
        const result = await fetchSlackMessages(w, from, to, page);
        nextSlack[w.id] = result.nextPage;
        return {
          comms: result.messages.map(
            (m: SlackMessage): Comm => ({
              source: "slack" as const,
              key: m.ts,
              accountLabel: m.workspaceLabel,
              heading: m.channel,
              text: m.text,
              url: m.permalink,
              at: m.at,
            }),
          ),
          matched: result.matched,
          scanned: result.messages.length,
          exhausted: result.nextPage === null,
          failed: false,
        };
      } catch (e) {
        errors.push({
          source: "slack",
          label: w.label,
          message: e instanceof Error ? e.message : "slack read failed",
        });
        // Leave the cursor off so a retry restarts this workspace rather than
        // skipping the slice the failure swallowed.
        return { comms: [], matched: 0, scanned: 0, exhausted: false, failed: true };
      }
    }),
  );

  const emailResults = await Promise.all(
    accounts.map(async (a): Promise<SourceResult> => {
      const token = cursors.email?.[a.id];
      if (token === null) {
        nextEmail[a.id] = null;
        return { comms: [], matched: 0, scanned: 0, exhausted: true, failed: false };
      }
      try {
        const accessToken = await accessTokenFor(a);
        const result = await fetchMessages(
          accessToken,
          emailQuery(from, to),
          EMAIL_PAGE_SIZE,
          token ?? null,
        );
        nextEmail[a.id] = result.nextPageToken;
        const inRange = newestPerThread(result.messages).filter((m) =>
          withinRange(m.receivedAt, from, to),
        );
        return {
          comms: inRange.map(
            (m): Comm => ({
              source: "email" as const,
              key: m.threadId,
              accountLabel: a.label,
              heading: m.subject || "(no subject)",
              text: m.body || m.snippet,
              url: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
              at: m.receivedAt,
            }),
          ),
          matched: result.matched,
          scanned: result.messages.length,
          exhausted: result.nextPageToken === null,
          failed: false,
        };
      } catch (e) {
        errors.push({
          source: "email",
          label: a.label,
          message: e instanceof Error ? e.message : "gmail read failed",
        });
        return { comms: [], matched: 0, scanned: 0, exhausted: false, failed: true };
      }
    }),
  );

  const all = [...slackResults, ...emailResults];
  const comms = all.flatMap((r) => r.comms);
  const scanned = all.reduce((n, r) => n + r.scanned, 0);
  const matched = all.reduce((n, r) => n + r.matched, 0);

  const candidates = (await matchTasksToComms(tasks, comms))
    // Drop evidence already ruled against this task, and the card with it once
    // nothing unruled is left.
    .map((c) => ({
      ...c,
      comms: c.comms.filter((m) => !ruled.has(pairKey(c.threadId, m.source, m.key))),
    }))
    .filter((c) => c.comms.length > 0);

  const cursorsOut: CommsCursors = { slack: nextSlack, email: nextEmail };
  // Only honestly done when every source walked its whole range AND none of
  // them failed: a revoked grant must not read as the end of the week.
  const done = all.every((r) => r.exhausted) && all.every((r) => !r.failed);

  return {
    workspaces: workspaces.map(publicWorkspace),
    accounts: accounts.map(publicAccount),
    candidates,
    scanned,
    matched,
    tasks: tasks.length,
    cursors: cursorsOut,
    done,
    errors,
  };
}
