// Email triage for the Workstream Command Center (PRD FR-3). Pulls recent
// unread mail from Gmail, has Claude pick out the ones that are actually a task
// for the user, and logs each as a `workstreams` row.
//
// Mounted as action:"workstream-triage" on /api/fireflies-import rather than as
// its own route: api/ is at Vercel's Hobby-plan 12-Serverless-Function cap. The
// leading `_` keeps this file out of the route table; it is only imported.
//
// Gmail access reuses the service account already doing domain-wide delegation
// for the calendar — read-only scope, so nothing is ever marked read or moved.
// Re-triaging is safe: rows dedup on the Gmail thread id via workstream_upsert.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env, type Db } from "./_fireflies.js";
import { GMAIL_READONLY_SCOPE, getGoogleAccessToken } from "./_gcal.js";

const MODEL = "claude-sonnet-4-6";
// Enough to cover a working day's unread without blowing the function timeout:
// each message is one Gmail GET, then a single Claude call over the batch.
const MAX_MESSAGES = 15;
const GMAIL_QUERY = "is:unread newer_than:2d -category:promotions -category:social";
const MAX_BODY_CHARS = 2000;

export interface TriageOutcome {
  scanned: number;
  logged: number;
}

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

function headerValue(
  headers: { name?: string; value?: string }[] | undefined,
  name: string,
): string {
  const hit = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return hit?.value ?? "";
}

// Gmail nests the readable text arbitrarily deep in a MIME tree; walk it and
// take the first text/plain leaf, falling back to stripped HTML.
function extractBody(payload: GmailPart | undefined): string {
  if (!payload) return "";
  const decode = (data?: string) =>
    data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";

  const walk = (part: GmailPart, wanted: string): string => {
    if (part.mimeType === wanted && part.body?.data) return decode(part.body.data);
    for (const child of part.parts ?? []) {
      const found = walk(child, wanted);
      if (found) return found;
    }
    return "";
  };

  const plain = walk(payload, "text/plain");
  if (plain) return plain;
  const html = walk(payload, "text/html");
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

async function gmailFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (!res.ok || !body) {
    throw new Error(body?.error?.message ?? `Gmail API ${res.status}`);
  }
  return body;
}

export async function fetchUnread(): Promise<GmailMessage[]> {
  const token = await getGoogleAccessToken(GMAIL_READONLY_SCOPE);
  const list = await gmailFetch<{ messages?: { id: string; threadId: string }[] }>(
    token,
    `messages?q=${encodeURIComponent(GMAIL_QUERY)}&maxResults=${MAX_MESSAGES}`,
  );
  const ids = list.messages ?? [];

  const messages = await Promise.all(
    ids.map(async (m) => {
      try {
        const full = await gmailFetch<{
          id: string;
          threadId: string;
          snippet?: string;
          payload?: GmailPart & { headers?: { name?: string; value?: string }[] };
        }>(token, `messages/${m.id}?format=full`);
        return {
          id: full.id,
          threadId: full.threadId,
          from: headerValue(full.payload?.headers, "From"),
          subject: headerValue(full.payload?.headers, "Subject"),
          snippet: full.snippet ?? "",
          body: extractBody(full.payload).slice(0, MAX_BODY_CHARS),
        } satisfies GmailMessage;
      } catch (e) {
        // One unreadable message must not sink the whole triage run.
        console.warn("gmail message fetch failed", m.id, e);
        return null;
      }
    }),
  );
  return messages.filter((m): m is GmailMessage => m !== null);
}

const Triage = z.object({
  tasks: z.array(
    z.object({
      // Index into the batch we sent, so we can map back to the thread id.
      index: z.number(),
      title: z.string(),
      action: z.string(),
    }),
  ),
});

const SYSTEM = `You triage a single user's inbox into a task board.

Return ONLY emails that need the user to personally DO something: reply with a
decision, send a document, review something, pay something, attend or reschedule.

Do NOT return: newsletters, marketing, automated notifications, receipts,
calendar invites that need no reply, CC-only FYI threads, or anything already
handled in the thread.

For each real task:
- title: the task in the user's voice, under 60 chars, starting with a verb
  (e.g. "Reply to Kyp on the Ocean Rd quote").
- action: one short sentence on what specifically is being asked of them.

Most inboxes yield only a few. Returning an empty list is the correct answer
when nothing is actionable.`;

export async function extractTasks(
  messages: readonly GmailMessage[],
): Promise<{ index: number; title: string; action: string }[]> {
  if (messages.length === 0) return [];
  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });

  const rendered = messages
    .map((m, i) => `[${i}] From: ${m.from}\nSubject: ${m.subject}\n${m.body || m.snippet}`)
    .join("\n\n---\n\n");

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(Triage) },
    messages: [{ role: "user", content: rendered }],
  });

  const parsed = response.parsed_output;
  if (!parsed) return [];
  // The model can hallucinate an out-of-range index; drop rather than misfile.
  return parsed.tasks.filter((t) => t.index >= 0 && t.index < messages.length);
}

export async function triageInbox(supabase: Db): Promise<TriageOutcome> {
  const messages = await fetchUnread();
  const tasks = await extractTasks(messages);

  let logged = 0;
  for (const task of tasks) {
    const msg = messages[task.index];
    const { error } = await supabase.rpc("workstream_upsert", {
      p_type: "email_task",
      p_source_id: msg.threadId,
      p_title: task.title,
      p_status: null, // keep whatever status the row already has
      p_last_action: task.action,
      p_metadata: {
        from: msg.from,
        subject: msg.subject,
        url: `https://mail.google.com/mail/u/0/#inbox/${msg.threadId}`,
      },
    });
    if (error) {
      console.warn("workstream upsert failed", msg.threadId, error.message);
      continue;
    }
    logged += 1;
  }

  return { scanned: messages.length, logged };
}
