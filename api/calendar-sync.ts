// Create Google Calendar events for the TDL "Add Calendar" flow. The client
// sends fully-scheduled events (title + start/end wall-clock + timeZone); this
// endpoint mints a service-account token and creates them one by one, returning
// per-event success/failure so a partial run is honest. Auth-gated to the single
// app user, same as the Fireflies/receipt endpoints.
import { authedUser, json, serviceClient } from "./_fireflies.js";
import { createCalendarEvent, getCalendarAccessToken } from "./_gcal.js";

// A handful of quick REST calls; well under the ceiling but give long runs room.
export const maxDuration = 60;

type EventInput = {
  title?: string;
  description?: string;
  startDateTime?: string;
  endDateTime?: string;
};
type Body = { timeZone?: string; events?: EventInput[] };

export async function POST(request: Request): Promise<Response> {
  let supabase: ReturnType<typeof serviceClient>;
  try {
    supabase = serviceClient();
    if (!(await authedUser(request, supabase))) return json({ error: "unauthorized" }, 401);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "init failed" }, 500);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  const timeZone = body.timeZone?.trim() || "America/New_York";
  const events = (body.events ?? []).filter(
    (e): e is Required<Pick<EventInput, "title" | "startDateTime" | "endDateTime">> & EventInput =>
      Boolean(e?.title && e.startDateTime && e.endDateTime),
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
