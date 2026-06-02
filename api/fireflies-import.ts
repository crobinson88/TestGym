// Lister/trigger for the meeting import. Returns instantly: it lists recent
// Fireflies meetings, drops ones already ingested, and hands the client the set
// of new meeting ids to process. The heavy per-meeting work (transcript fetch +
// Claude extraction) happens in /api/fireflies-process, one request per meeting,
// so no single request blows past the function time limit.
import {
  authedUser,
  json,
  serviceClient,
  listRecentTranscripts,
  SECTION,
  type Db,
} from "./_fireflies.js";

// Listing + a dedupe query only; this stays well under the limit.
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  try {
    // Inside the try: serviceClient() throws on a missing env var, which would
    // otherwise escape as Vercel's opaque FUNCTION_INVOCATION_FAILED 500.
    const supabase = serviceClient();
    if (!(await authedUser(request, supabase))) return json({ error: "unauthorized" }, 401);

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
