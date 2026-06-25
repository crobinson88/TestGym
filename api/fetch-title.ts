// Fetches a URL server-side (browsers can't, CORS) and pulls out a page title
// so the Reading list's "Save to read" flow can autopopulate the title field.
// Auth reuses the app's magic-link gate, same as the other endpoints.
import { authedUser, json, serviceClient } from "./_fireflies.js";

export const maxDuration = 15;

const USER_AGENT =
  process.env.RESEARCH_USER_AGENT ?? "gym-tracker reading-list (charlie@theglassmarket.co)";
const MAX_HTML_BYTES = 2 * 1024 * 1024; // titles live in <head>; cap the read

type Body = { url?: string };

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

// Prefer Open Graph / Twitter titles (cleaner than the raw <title>), fall back
// to <title>.
function extractTitle(html: string): string | null {
  const meta = (prop: string) => {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${prop}["'][^>]*>`,
      "i",
    );
    const tag = html.match(re)?.[0];
    return tag?.match(/content\s*=\s*["']([^"']*)["']/i)?.[1] ?? null;
  };
  const candidate =
    meta("og:title") ??
    meta("twitter:title") ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    null;
  if (!candidate) return null;
  const title = decodeEntities(candidate).replace(/\s+/g, " ").trim();
  return title || null;
}

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

  const raw = (body.url ?? "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return json({ error: "invalid url" }, 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return json({ error: "url must be http(s)" }, 400);
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      redirect: "follow",
    });
    if (!res.ok) return json({ error: `fetch failed (${res.status})` }, 502);
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return json({ title: null }, 200);

    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    return json({ title: extractTitle(html) }, 200);
  } catch (e) {
    console.error("fetch-title failed", e);
    return json({ error: e instanceof Error ? e.message : "fetch failed" }, 502);
  }
}
