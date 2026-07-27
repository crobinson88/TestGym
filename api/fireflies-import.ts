// TDL day-header server actions. Two jobs share this one endpoint to stay within
// Vercel's Hobby-plan 12-Serverless-Function budget (the same reason french-chat
// doubles as the sentence generator):
//
//  1. Default (no/other action) — the meeting-import lister/trigger. Returns
//     instantly: lists recent Fireflies meetings, drops ones already ingested,
//     and hands the client the new meeting ids. The heavy per-meeting work
//     (transcript fetch + Claude extraction) happens in /api/fireflies-process,
//     one request per meeting, so no single request blows the time limit.
//  2. action:"calendar-sync" — creates the "Add Calendar" events on the user's
//     Google Calendar from a client-supplied, already-scheduled event list.
import {
  authedUser,
  json,
  serviceClient,
  listRecentTranscripts,
  SECTION,
  type Db,
} from "./_fireflies.js";
import { createCalendarEvent, getCalendarAccessToken } from "./_gcal.js";

// Listing is quick; the calendar branch loops a handful of REST calls. 60s covers
// both comfortably.
export const maxDuration = 60;

type CalendarEventInput = {
  title?: string;
  description?: string;
  startDateTime?: string;
  endDateTime?: string;
};
type CalendarSyncBody = {
  action?: string;
  timeZone?: string;
  events?: CalendarEventInput[];
};

// The import button posts no body; request.json() then throws. Treat any parse
// failure as "no body" so the default import path runs unchanged.
async function readOptionalBody(request: Request): Promise<CalendarSyncBody | null> {
  try {
    return (await request.json()) as CalendarSyncBody;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    // Inside the try: serviceClient() throws on a missing env var, which would
    // otherwise escape as Vercel's opaque FUNCTION_INVOCATION_FAILED 500.
    const supabase = serviceClient();
    if (!(await authedUser(request, supabase))) return json({ error: "unauthorized" }, 401);

    const body = await readOptionalBody(request);
    if (body?.action === "calendar-sync") return handleCalendarSync(body);

    const recent = await listRecentTranscripts();
    const ids = recent.map((t) => t.id);

    const { data: known } = await supabase
      .from("fireflies_ingests")
      .select("meeting_id")
      .in("meeting_id", ids);
    const seen = new Set((known ?? []).map((r) => r.meeting_id as string));
    const meetingIds = recent.filter((t) => !seen.has(t.id)).map((t) => t.id);

    const basePosition = await nextPosition(supabase);
    return json({ meetingIds, basePosition }, 200);
  } catch (e) {
    // Always answer with JSON so the client surfaces the real reason instead of
    // choking on Vercel's plain-text "A server error has occurred" 500 body.
    return json({ error: e instanceof Error ? e.message : "import failed" }, 500);
  }
}

// Create each scheduled event on the calendar, reporting per-event success so a
// partial run is honest. Auth was already checked by the caller.
async function handleCalendarSync(body: CalendarSyncBody): Promise<Response> {
  const timeZone = body.timeZone?.trim() || "America/New_York";
  const events = (body.events ?? []).filter(
    (e): e is Required<Pick<CalendarEventInput, "title" | "startDateTime" | "endDateTime">> &
      CalendarEventInput => Boolean(e?.title && e.startDateTime && e.endDateTime),
  );
  if (events.length === 0) return json({ error: "no events" }, 400);

  let accessToken: string;
  try {
    accessToken = await getCalendarAccessToken();
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "auth failed" }, 500);
  }

  let created = 0;
  let failed = 0;
  let firstError: string | null = null;
  for (const event of events) {
    try {
      await createCalendarEvent(accessToken, timeZone, {
        title: event.title,
        description: event.description,
        startDateTime: event.startDateTime,
        endDateTime: event.endDateTime,
      });
      created++;
    } catch (e) {
      failed++;
      firstError ??= e instanceof Error ? e.message : "create failed";
    }
  }

  return json({ ok: failed === 0, created, failed, error: firstError ?? undefined }, 200);
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
