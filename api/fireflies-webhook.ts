import crypto from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createClient } from "@supabase/supabase-js";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";

const FIREFLIES_GRAPHQL = "https://api.fireflies.ai/graphql";
const SECTION = "meeting_action_items";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get("x-hub-signature") ?? "")) {
    return new Response("invalid signature", { status: 401 });
  }

  let payload: { meetingId?: string; eventType?: string };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  if (payload.eventType !== "Transcription completed" || !payload.meetingId) {
    return new Response("ignored", { status: 200 });
  }

  // Ack immediately; Fireflies retries on slow responses. Transcript fetch +
  // Claude extraction run after the response is sent.
  waitUntil(processMeeting(payload.meetingId));
  return new Response("ok", { status: 200 });
}

function verifySignature(raw: string, header: string): boolean {
  const expected = crypto
    .createHmac("sha256", env("FIREFLIES_WEBHOOK_SECRET"))
    .update(raw, "utf8")
    .digest("hex");
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

type Transcript = {
  title: string | null;
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

function serviceClient() {
  return createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

type Db = ReturnType<typeof serviceClient>;

async function processMeeting(meetingId: string): Promise<void> {
  const supabase = serviceClient();

  if (!(await claimMeeting(supabase, meetingId))) return; // already processed

  const transcript = await fetchTranscript(meetingId);
  const items = await extractActionItems(transcript);
  if (items.length === 0) return;

  await insertItems(supabase, transcript.title, items);
}

async function claimMeeting(supabase: Db, meetingId: string): Promise<boolean> {
  const { error } = await supabase.from("fireflies_ingests").insert({ meeting_id: meetingId });
  if (!error) return true;
  if (error.code === "23505") return false; // unique violation — a retry
  throw error;
}

async function fetchTranscript(meetingId: string): Promise<Transcript> {
  const query = `query($id: String!) {
    transcript(id: $id) {
      title
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
  const json = (await res.json()) as {
    data?: { transcript: Transcript };
    errors?: unknown;
  };
  if (json.errors || !json.data) throw new Error(`Fireflies GraphQL: ${JSON.stringify(json.errors)}`);
  return json.data.transcript;
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

async function insertItems(
  supabase: Db,
  meetingTitle: string | null,
  items: z.infer<typeof Extraction>["action_items"],
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  const { data: last } = await supabase
    .from("tdl_items")
    .select("position")
    .eq("snapshot_date", today)
    .eq("section", SECTION)
    .eq("is_recurring", false)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1);
  let position = last && last.length ? (last[0].position as number) + 1 : 0;

  const now = new Date().toISOString();
  const rows = items.map((it) => ({
    id: crypto.randomUUID(),
    snapshot_date: today,
    section: SECTION,
    is_recurring: false,
    position: position++,
    title: it.owner ? `${it.task} (@${it.owner})` : it.task,
    due_date: it.due_date,
    time_estimate_min: null,
    status: "open",
    is_priority: it.priority === "high",
    notes: meetingTitle ? `From meeting: ${meetingTitle}` : null,
    origin_item_id: null,
    origin_snapshot_date: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }));

  const { error } = await supabase.from("tdl_items").insert(rows);
  if (error) throw error;
}
