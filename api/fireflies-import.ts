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
//  3. action:"workstream-triage" — Gmail → Claude → `workstreams` rows for the
//     desktop Command Center. Same reason it lives here: no function slots left.
//  5. action:"email-apply" — archives / labels the threads a confirmed review
//     pass ruled on. The only path in this file that WRITES to a mailbox.
//  4. action:"email-review" — every configured mailbox → Claude → candidate
//     tasks handed back for the user to rule on. Writes NOTHING; the browser
//     creates the tasks and the ledger rows once the pass is confirmed. Paged:
//     one page per mailbox per request, `cursors` in and out, because the
//     window runs to four figures. Same budget reason again: api/ is at
//     exactly 12 functions.
import {
  authedUser,
  json,
  serviceClient,
  listRecentTranscripts,
  SECTION,
  type Db,
} from "./_fireflies.js";
import {
  createCalendarEvent,
  getCalendarAccessToken,
  getCalendarBusy,
  getCalendarReadAccessToken,
  listBusyCalendarIds,
} from "./_gcal.js";
import { applyEmailActions, collectReviewCandidates } from "./_gmail.js";
import { triageInbox } from "./_workstreams.js";

// Listing is quick; the calendar branch loops a handful of REST calls, and the
// review branch reads several mailboxes and calls Claude once per mailbox. 60s
// covers them all.
export const maxDuration = 60;

type CalendarEventInput = {
  title?: string;
  description?: string;
  startDateTime?: string;
  endDateTime?: string;
};
type CalendarSyncBody = {
  action?: string;
  // Triage takes no arguments; the server picks the Gmail window itself.
  timeZone?: string;
  events?: CalendarEventInput[];
  // calendar-busy window (RFC3339 with offset/Z).
  timeMin?: string;
  timeMax?: string;
  // email-review: where each mailbox got to, from the previous response.
  cursors?: Record<string, string | null>;
  // email-apply: the mailbox side of a confirmed review pass.
  actions?: {
    accountId?: string;
    threadId?: string;
    archive?: boolean;
    labelNames?: string[];
  }[];
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
    if (body?.action === "calendar-busy") return handleCalendarBusy(body);
    if (body?.action === "workstream-triage") return json(await triageInbox(supabase), 200);
    if (body?.action === "email-review")
      return json(await collectReviewCandidates(supabase, body.cursors ?? {}), 200);
    if (body?.action === "email-apply") return handleEmailApply(supabase, body);

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

// Archive / label the threads of a confirmed review pass. Drops anything
// malformed rather than guessing, and reports per-thread so a partial run is
// honest. Auth was already checked by the caller.
async function handleEmailApply(supabase: Db, body: CalendarSyncBody): Promise<Response> {
  const actions = (body.actions ?? [])
    .filter((a): a is { accountId: string; threadId: string; archive?: boolean; labelNames?: string[] } =>
      Boolean(a?.accountId && a.threadId),
    )
    .map((a) => ({
      accountId: a.accountId,
      threadId: a.threadId,
      archive: a.archive === true,
      labelNames: (a.labelNames ?? []).filter((n) => typeof n === "string" && n.trim()),
    }))
    // Nothing to do for a thread that is neither archived nor labelled.
    .filter((a) => a.archive || a.labelNames.length > 0);

  if (actions.length === 0) return json({ results: [] }, 200);
  try {
    return json(await applyEmailActions(supabase, actions), 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "apply failed" }, 500);
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

// Return the day's busy blocks so the client can schedule around them. Auth was
// already checked by the caller.
async function handleCalendarBusy(body: CalendarSyncBody): Promise<Response> {
  const timeMin = body.timeMin?.trim();
  const timeMax = body.timeMax?.trim();
  if (!timeMin || !timeMax) return json({ error: "missing window" }, 400);
  const timeZone = body.timeZone?.trim() || "America/New_York";

  // Read busy time across ALL the user's calendars so tasks are scheduled around
  // every calendar, not just the primary one. Enumerating the calendar list
  // needs a read scope; if that scope isn't authorised yet (calendarList 403s),
  // fall back to the single write-target calendar under the events scope so the
  // feature keeps working exactly as before.
  try {
    let calendarIds: string[] | undefined;
    let accessToken: string;
    try {
      accessToken = await getCalendarReadAccessToken();
      calendarIds = await listBusyCalendarIds(accessToken);
    } catch {
      accessToken = await getCalendarAccessToken();
      calendarIds = undefined;
    }
    const busy = await getCalendarBusy(accessToken, timeMin, timeMax, timeZone, calendarIds);
    return json({ busy }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "freebusy failed" }, 500);
  }
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
