// Shared helpers for the Fireflies meeting-import endpoints. The leading `_`
// keeps Vercel from turning this file into its own route; it's only imported.
import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";
export const SECTION = "meeting_action_items";
export const ALLOWED_EMAIL = "charlie@theglassmarket.co";
export const RECENT_LIMIT = 10;
// Timezone the meeting time is shown in (Fireflies gives a UTC instant, not the
// room's local zone). Defaults to US Eastern; the zone label is shown in the
// title so it's unambiguous when traveling. Override with the MEETING_TZ env var.
const MEETING_TZ = process.env.MEETING_TZ ?? "America/New_York";

export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function serviceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export type Db = ReturnType<typeof serviceClient>;

// Reuse the app's magic-link auth: the bearer token must be the single allowed
// user. Both the lister and the per-meeting worker are called with the client's
// own access token, so they share this gate.
export async function authedUser(request: Request, supabase: Db): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return false;
  const { data, error } = await supabase.auth.getUser(token);
  return !error && data.user?.email === ALLOWED_EMAIL;
}

export type Transcript = {
  title: string | null;
  dateString: string | null;
  date: number | null;
  summary: { overview: string | null; action_items: string | null } | null;
  sentences: { speaker_name: string | null; text: string }[] | null;
};

export const Extraction = z.object({
  action_items: z.array(
    z.object({
      task: z.string(),
      owner: z.string().nullable(),
      due_date: z.string().nullable(),
      // Kept lenient: zodOutputFormat (zod v4) emits enums as plain strings in
      // the JSON schema, so the model isn't constrained and strict enum parsing
      // threw "Invalid option". Downstream only checks whether it's "high".
      priority: z.string().nullable(),
    }),
  ),
});

export async function listRecentTranscripts(): Promise<{ id: string; title: string | null }[]> {
  const query = `query($limit: Int) { transcripts(limit: $limit) { id title } }`;
  const res = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("FIREFLIES_API_KEY")}`,
    },
    body: JSON.stringify({ query, variables: { limit: RECENT_LIMIT } }),
  });
  if (!res.ok) throw new Error(`Fireflies API ${res.status}`);
  const body = (await res.json()) as {
    data?: { transcripts: { id: string; title: string | null }[] };
    errors?: unknown;
  };
  // Tolerate field-level (partial) errors: only fail when no data came back.
  if (!body.data?.transcripts) throw new Error(`Fireflies GraphQL: ${JSON.stringify(body.errors)}`);
  return body.data.transcripts;
}

export async function fetchTranscript(meetingId: string): Promise<Transcript> {
  const query = `query($id: String!) {
    transcript(id: $id) {
      title
      dateString
      date
      summary { overview action_items }
      sentences { speaker_name text }
    }
  }`;
  const res = await fetch(FIREFLIES_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env("FIREFLIES_API_KEY")}`,
    },
    body: JSON.stringify({ query, variables: { id: meetingId } }),
  });
  if (!res.ok) throw new Error(`Fireflies API ${res.status}`);
  const body = (await res.json()) as {
    data?: { transcript: Transcript | null };
    errors?: unknown;
  };
  // Fireflies often returns a usable transcript alongside field-level errors
  // (GraphQL partial results). Failing on any `errors` discarded the whole
  // transcript, so every meeting "failed" before extraction. Only fail when
  // there's genuinely no transcript; log partials and proceed with what we got.
  if (!body.data?.transcript) throw new Error(`Fireflies GraphQL: ${JSON.stringify(body.errors)}`);
  if (body.errors) console.warn("Fireflies partial errors for", meetingId, JSON.stringify(body.errors));
  return body.data.transcript;
}

export async function extractActionItems(t: Transcript) {
  const anthropic = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);
  const transcriptText = (t.sentences ?? [])
    .map((s) => `${s.speaker_name ?? "Unknown"}: ${s.text}`)
    .join("\n");

  const result = await anthropic.messages.parse({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system:
      "Extract concrete action items from a meeting transcript. Include only real " +
      "to-dos someone must act on; ignore discussion and chit-chat. " +
      `Today is ${today}; resolve relative dates (e.g. "next Friday") to an ISO date (YYYY-MM-DD). ` +
      "Use null for owner or due_date when not stated.",
    output_config: { format: zodOutputFormat(Extraction) },
    messages: [
      {
        role: "user",
        content:
          `Meeting: ${t.title ?? "(untitled)"}\n\n` +
          (t.summary?.action_items
            ? `Fireflies' detected action items:\n${t.summary.action_items}\n\n`
            : "") +
          `Transcript:\n${transcriptText}`,
      },
    ],
  });

  return result.parsed_output?.action_items ?? [];
}

// "Meeting Name, 28 May 2026, 14:30 EDT" — prepended to each item title.
export function titlePrefix(t: Transcript): string {
  const name = t.title ?? "Meeting";
  const when = t.dateString ?? (t.date ? new Date(t.date).toISOString() : null);
  const d = when ? new Date(when) : null;
  if (!d || Number.isNaN(d.getTime())) return name;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZoneName: "short",
    timeZone: MEETING_TZ,
  }).format(d);
  return `${name}, ${formatted}`;
}

export function buildRow(
  it: z.infer<typeof Extraction>["action_items"][number],
  prefix: string,
  position: number,
) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    snapshot_date: now.slice(0, 10),
    section: SECTION,
    is_recurring: false,
    position,
    title: `${prefix} - ${it.task}`,
    due_date: it.due_date,
    time_estimate_min: null,
    status: "open",
    is_priority: it.priority === "high",
    notes: it.owner ? `Owner: ${it.owner}` : null,
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}
