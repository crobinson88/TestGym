// Per-meeting worker. Processes exactly one Fireflies meeting: fetch transcript,
// extract action items with Claude, insert the rows, then claim the meeting so a
// re-tap won't re-import it. One meeting per request keeps each invocation well
// under the function time limit; the client fans these out in parallel.
import {
  authedUser,
  buildRow,
  extractActionItems,
  fetchTranscript,
  json,
  serviceClient,
  titlePrefix,
} from "./_fireflies.js";

// One transcript fetch + one Claude call; bump the ceiling for long meetings.
export const maxDuration = 60;

type Body = { meetingId?: string; basePosition?: number; meetingIndex?: number };

export async function POST(request: Request): Promise<Response> {
  let supabase: ReturnType<typeof serviceClient>;
  try {
    // serviceClient() throws on a missing env var; keep it inside a try so the
    // failure returns JSON instead of an opaque FUNCTION_INVOCATION_FAILED 500.
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
  const { meetingId, basePosition = 0, meetingIndex = 0 } = body;
  if (!meetingId) return json({ error: "missing meetingId" }, 400);

  try {
    const transcript = await fetchTranscript(meetingId);
    const items = await extractActionItems(transcript);

    let added = 0;
    if (items.length > 0) {
      const prefix = titlePrefix(transcript);
      // Stride positions per meeting so parallel workers don't collide and the
      // items from one meeting stay grouped in board order.
      const start = basePosition + meetingIndex * 1000;
      const rows = items.map((it, i) => buildRow(it, prefix, start + i));
      const { error: insertErr } = await supabase.from("tdl_items").insert(rows);
      if (insertErr) throw insertErr;
      added = rows.length;
    }

    // Mark processed only after a successful run so failures retry on the next tap.
    const { error: claimErr } = await supabase
      .from("fireflies_ingests")
      .insert({ meeting_id: meetingId });
    if (claimErr && claimErr.code !== "23505") throw claimErr;

    return json({ added, ok: true }, 200);
  } catch (e) {
    // Log so the real cause is visible in Vercel runtime logs (the 200 below
    // otherwise hides it from the platform's error view).
    console.error("fireflies-process failed", meetingId, e);
    // 200 with ok:false: a single meeting failing isn't a request error — the
    // client tallies it as failed and the user can re-tap to retry just that one.
    return json({ added: 0, ok: false, error: e instanceof Error ? e.message : "failed" }, 200);
  }
}
