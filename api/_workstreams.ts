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
import { fetchMessages, type GmailMessage } from "./_gmail.js";
import { GMAIL_READONLY_SCOPE, getGoogleAccessToken } from "./_gcal.js";

const MODEL = "claude-sonnet-4-6";
// Enough to cover a working day's unread without blowing the function timeout:
// each message is one Gmail GET, then a single Claude call over the batch.
const MAX_MESSAGES = 15;
const GMAIL_QUERY = "is:unread newer_than:2d -category:promotions -category:social";

export interface TriageOutcome {
  scanned: number;
  logged: number;
}

// The Command Center triages the user's own mailbox only — the delegated
// default subject — while the to-do review pass fans out over every configured
// account. Message reading itself is shared (see _gmail.ts).
export async function fetchUnread(): Promise<GmailMessage[]> {
  const token = await getGoogleAccessToken(GMAIL_READONLY_SCOPE);
  return (await fetchMessages(token, GMAIL_QUERY, MAX_MESSAGES)).messages;
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
