// Emails a digest of the reading items marked read in the last 7 days to a set
// of recipients typed in the app. The server is the source of truth: it reads
// reading_items itself (service client) rather than trusting a client-supplied
// body, so the email can only ever contain the user's own list. Auth reuses the
// app's magic-link gate, same as the other endpoints.
import { authedUser, json, serviceClient, env } from "./_fireflies.js";

export const maxDuration = 15;

// No dedicated read_at column on reading_items, so "read this week" uses
// updated_at (the LWW clock) as the read-time proxy: an item that is currently
// read and whose row last changed within the window. Toggling read sets
// updated_at, so this captures things marked read in the last 7 days.
const WINDOW_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = { recipients?: unknown };

type Item = { url: string; title: string; description: string | null; updated_at: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtml(items: Item[]): string {
  const rows = items
    .map((it) => {
      const desc = it.description?.trim()
        ? `<p style="margin:4px 0 0;color:#555;font-size:14px">${escapeHtml(it.description.trim())}</p>`
        : "";
      return `<li style="margin:0 0 16px">
        <a href="${escapeHtml(it.url)}" style="font-size:16px;font-weight:600;color:#1a56db;text-decoration:none">${escapeHtml(it.title)}</a>
        ${desc}
        <p style="margin:4px 0 0;color:#999;font-size:12px">${escapeHtml(it.url)}</p>
      </li>`;
    })
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:8px">
    <h2 style="font-size:20px;margin:0 0 4px">Read this week</h2>
    <p style="color:#777;font-size:13px;margin:0 0 20px">${items.length} item${items.length === 1 ? "" : "s"} marked read in the last ${WINDOW_DAYS} days.</p>
    <ul style="list-style:none;padding:0;margin:0">${rows}</ul>
  </div>`;
}

function renderText(items: Item[]): string {
  const lines = items.map((it) => {
    const desc = it.description?.trim() ? `\n  ${it.description.trim()}` : "";
    return `• ${it.title}${desc}\n  ${it.url}`;
  });
  return `Read this week — ${items.length} item${items.length === 1 ? "" : "s"} in the last ${WINDOW_DAYS} days\n\n${lines.join("\n\n")}`;
}

export async function POST(request: Request): Promise<Response> {
  let supabase;
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

  // Normalise + validate recipients. De-dupe, lower-case, reject anything that
  // isn't an email so we never hand Resend junk.
  const raw = Array.isArray(body.recipients) ? body.recipients : [];
  const recipients = [
    ...new Set(
      raw
        .filter((r): r is string => typeof r === "string")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (recipients.length === 0) return json({ error: "no recipients" }, 400);
  const bad = recipients.filter((r) => !EMAIL_RE.test(r));
  if (bad.length) return json({ error: `invalid email: ${bad.join(", ")}` }, 400);

  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("reading_items")
    .select("url, title, description, updated_at")
    .is("deleted_at", null)
    .eq("is_read", true)
    .gte("updated_at", since)
    .order("updated_at", { ascending: false });
  if (error) return json({ error: error.message }, 500);

  const items = (data ?? []) as Item[];
  if (items.length === 0) return json({ sent: false, count: 0 }, 200);

  let apiKey: string;
  let from: string;
  try {
    apiKey = env("RESEND_API_KEY");
    from = env("RESEND_FROM");
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "email not configured" }, 500);
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: recipients,
        subject: `Read this week — ${items.length} item${items.length === 1 ? "" : "s"}`,
        html: renderHtml(items),
        text: renderText(items),
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      return json({ error: `email send failed (${res.status}): ${detail}` }, 502);
    }
    return json({ sent: true, count: items.length, recipients }, 200);
  } catch (e) {
    console.error("reading-digest failed", e);
    return json({ error: e instanceof Error ? e.message : "send failed" }, 502);
  }
}
