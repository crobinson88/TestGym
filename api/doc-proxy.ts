// Byte proxy for the PDF annotator. Investor-relations filings live on remote
// hosts (SEC EDGAR, FMP) that block cross-origin browser fetches and require a
// declared User-Agent, so the client can't pull the PDF itself. This streams a
// single PDF back to the annotator. Auth reuses the app's magic-link gate.
import { authedUser, serviceClient, json } from "./_fireflies.js";

export const maxDuration = 30;

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const USER_AGENT =
  process.env.RESEARCH_USER_AGENT ?? "gym-tracker research (charlie@theglassmarket.co)";

type Body = { url?: string };

export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = serviceClient();
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

  const url = (body.url ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return json({ error: "missing or invalid url" }, 400);

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/pdf,*/*" } });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "fetch failed" }, 502);
  }
  if (!upstream.ok) return json({ error: `upstream HTTP ${upstream.status}` }, 502);

  const contentType = upstream.headers.get("content-type") ?? "";
  const buf = Buffer.from(await upstream.arrayBuffer());
  // Sniff the magic bytes too: some hosts mislabel the content-type.
  const looksPdf = contentType.includes("application/pdf") || buf.subarray(0, 5).toString("latin1") === "%PDF-";
  if (!looksPdf) {
    return json({ error: "not a PDF — only PDF filings can be annotated" }, 415);
  }
  if (buf.byteLength > MAX_PDF_BYTES) return json({ error: "PDF too large" }, 413);

  return new Response(buf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(buf.byteLength),
      "Cache-Control": "private, max-age=0",
    },
  });
}
