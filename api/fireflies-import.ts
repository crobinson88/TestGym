import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";
const SECTION = "new";
const ALLOWED_EMAIL = "charlie@theglassmarket.co";
const RECENT_LIMIT = 25;
// Timezone for the date/time shown in each item title. Defaults to UTC; set
// MEETING_TZ (e.g. "Europe/London", "America/New_York") to show local time.
const MEETING_TZ = process.env.MEETING_TZ ?? "UTC";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

type Db = ReturnType<typeof serviceClient>;

export async function POST(request: Request): Promise<Response> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json({ error: "missing token" }, 401);

  const supabase = serviceClient();

  // Reuse the app's magic-link auth: the JWT must be the single allowed user.
  const { data, error } = await supabase.auth.getUser(token);
  if (error || data.user?.email !== ALLOWED_EMAIL) {
    return json({ error: "unauthorized" }, 401);
  }

  const recent = await listRecentTranscripts();
  const ids = recent.map((t) => t.id);

  const { data: known } = await supabase
    .from("fireflies_ingests")
    .select("meeting_id")
    .in("meeting_id", ids);
  const seen = new Set((known ?? []).map((r) => r.meeting_id as string));
  const fresh = recent.filter((t) => !seen.has(t.id));

  let position = await nextPosition(supabase);
  let added = 0;
  let meetings = 0;
  let failed = 0;

  for (const { id } of fresh) {
    try {
      const transcript = await fetchTranscript(id);
      const items = await extractActionItems(transcript);
      if (items.length > 0) {
        const prefix = titlePrefix(transcript);
        const rows = items.map((it) => buildRow(it, prefix, position++));
        const { error: insertErr } = await supabase.from("tdl_items").insert(rows);
        if (insertErr) throw insertErr;
        added += rows.length;
      }
      // Mark processed only after a successful run so failures retry next tap.
      const { error: claimErr } = await supabase
        .from("fireflies_ingests")
        .insert({ meeting_id: id });
      if (claimErr && claimErr.code !== "23505") throw claimErr;
      meetings++;
    } catch {
      failed++;
    }
  }

  return json({ added, meetings, failed }, 200);
}

type Transcript = {
  title: string | null;
  dateString: string | null;
  date: number | null;
  summary: { overview: string | null; action_items: string | null } | null;
  sentences: { speaker_name: string | null; text: string }[] | null;
};

const Extraction = z.object({
  action_items: z.array(
    z.object({
      task: z.string(),
      owner: z.string().nullable(),
      due_date: z.string().nullable(),
      priority: z.enum(["low", "med", "high"]),
    }),
  ),
});

async function listRecentTranscripts(): Promise<{ id: string; title: string | null }[]> {
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
  if (body.errors || !body.data) throw new Error(`Fireflies GraphQL: ${JSON.stringify(body.errors)}`);
  return body.data.transcripts;
}

async function fetchTranscript(meetingId: string): Promise<Transcript> {
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
  const body = (await res.json()) as { data?: { transcript: Transcript }; errors?: unknown };
  if (body.errors || !body.data) throw new Error(`Fireflies GraphQL: ${JSON.stringify(body.errors)}`);
  return body.data.transcript;
}

async function extractActionItems(t: Transcript) {
  const anthropic = new Anthropic();
  const today = new Date().toISOString().slice(0, 10);
  const transcriptText = (t.sentences ?? [])
    .map((s) => `${s.speaker_name ?? "Unknown"}: ${s.text}`)
    .join("\n");

  const result = await anthropic.messages.parse({
    model: "claude-opus-4-7",
    max_tokens: 4000,
    system:
      "Extract concrete action items from a meeting transcript. Include only real " +
      "to-dos someone must act on; ignore discussion and chit-chat. " +
      `Today is ${today}; resolve relative dates (e.g. "next Friday") to an ISO date (YYYY-MM-DD). ` +
      "Use null for owner or due_date when not stated.",
    output_config: { format: zodOutputFormat(Extraction), effort: "low" },
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

async function nextPosition(supabase: Db): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("tdl_items")
    .select("position")
    .eq("snapshot_date", today)
    .eq("section", SECTION)
    .eq("is_recurring", false)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1);
  return data && data.length ? (data[0].position as number) + 1 : 0;
}

// "Meeting Name, 28 May 2026, 14:30" — prepended to each item title.
function titlePrefix(t: Transcript): string {
  const name = t.title ?? "Meeting";
  const when = t.dateString ?? (t.date ? new Date(t.date).toISOString() : null);
  const d = when ? new Date(when) : null;
  if (!d || Number.isNaN(d.getTime())) return name;
  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: MEETING_TZ,
  }).format(d);
  return `${name}, ${formatted}`;
}

function buildRow(
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
