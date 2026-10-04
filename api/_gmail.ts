// Multi-account Gmail reading, shared by the Workstream Command Center's email
// triage and the to-do list's email review pass.
//
// Two auth modes, because one is not enough. A mailbox inside
// theglassmarket.co is read with the Google service account already doing
// domain-wide delegation for the calendar, impersonating that address. Domain-
// wide delegation stops at the Workspace boundary, so an outside mailbox — a
// personal Gmail, another company's domain — carries its own OAuth refresh
// token, granted once by `npm run gmail:auth` and stored on its
// `email_accounts` row. Both modes end up with a short-lived read-only access
// token and the same message-reading code below.
//
// The leading `_` keeps this out of Vercel's route table; it is only imported.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env, type Db } from "./_fireflies.js";
import { GMAIL_READONLY_SCOPE, getGoogleAccessToken } from "./_gcal.js";

const MODEL = "claude-sonnet-4-6";
const MAX_BODY_CHARS = 2000;

// The review pass shows read mail too — the question is "is this a task?", not
// "have I opened it?" — so it windows on age rather than unread state.
export const REVIEW_QUERY = "in:inbox newer_than:7d -category:promotions -category:social";
// Per mailbox. Each message is one Gmail GET, then a single Claude call over the
// batch, and several mailboxes run at once: keep the fan-out inside the
// function's 60s ceiling.
export const REVIEW_MAX_MESSAGES = 25;

export interface EmailAccount {
  id: string;
  label: string;
  address: string;
  auth_mode: "delegated" | "oauth";
  refresh_token: string | null;
  search_query: string | null;
}

// What the browser is told about a mailbox: enough to badge a card, and never
// the refresh token.
export interface PublicAccount {
  id: string;
  label: string;
  address: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  body: string;
  receivedAt: string | null;
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

export function headerValue(
  headers: { name?: string; value?: string }[] | undefined,
  name: string,
): string {
  const hit = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return hit?.value ?? "";
}

// Gmail nests the readable text arbitrarily deep in a MIME tree; walk it and
// take the first text/plain leaf, falling back to stripped HTML.
export function extractBody(payload: GmailPart | undefined): string {
  if (!payload) return "";
  const decode = (data?: string) =>
    data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";

  const walk = (part: GmailPart, wanted: string): string => {
    if (part.mimeType === wanted && part.body?.data) return decode(part.body.data);
    for (const child of part.parts ?? []) {
      const found = walk(child, wanted);
      if (found) return found;
    }
    return "";
  };

  const plain = walk(payload, "text/plain");
  if (plain) return plain;
  const html = walk(payload, "text/html");
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

export async function gmailFetch<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (!res.ok || !body) {
    throw new Error(body?.error?.message ?? `Gmail API ${res.status}`);
  }
  return body;
}

// Swap a stored refresh token for an access token. Unlike the delegated path
// this needs the OAuth client the consent was granted to, so the same client id
// and secret must be set here and in the authorize script.
async function oauthAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;
  if (!res.ok || !body?.access_token) {
    const detail = body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
    // A revoked grant lands here ("invalid_grant"); say what fixes it.
    throw new Error(`refresh failed: ${detail} — re-run npm run gmail:auth`);
  }
  return body.access_token;
}

export async function accessTokenFor(account: EmailAccount): Promise<string> {
  if (account.auth_mode === "oauth") {
    if (!account.refresh_token) throw new Error("no refresh token — run npm run gmail:auth");
    return oauthAccessToken(account.refresh_token);
  }
  return getGoogleAccessToken(GMAIL_READONLY_SCOPE, account.address);
}

export async function listAccounts(supabase: Db): Promise<EmailAccount[]> {
  const { data, error } = await supabase
    .from("email_accounts")
    .select("id, label, address, auth_mode, refresh_token, search_query")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EmailAccount[];
}

export function publicAccount(a: EmailAccount): PublicAccount {
  return { id: a.id, label: a.label, address: a.address };
}

// Gmail lists per message, but a thread is what gets ruled on, so collapse to
// the newest message per thread.
export function newestPerThread(messages: readonly GmailMessage[]): GmailMessage[] {
  const byThread = new Map<string, GmailMessage>();
  for (const m of messages) {
    const held = byThread.get(m.threadId);
    if (!held || (m.receivedAt ?? "") > (held.receivedAt ?? "")) byThread.set(m.threadId, m);
  }
  return [...byThread.values()].sort((a, b) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
}

export async function fetchMessages(
  token: string,
  query: string,
  max: number,
): Promise<GmailMessage[]> {
  const list = await gmailFetch<{ messages?: { id: string; threadId: string }[] }>(
    token,
    `messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
  );
  const ids = list.messages ?? [];

  const messages = await Promise.all(
    ids.map(async (m) => {
      try {
        const full = await gmailFetch<{
          id: string;
          threadId: string;
          snippet?: string;
          internalDate?: string;
          payload?: GmailPart & { headers?: { name?: string; value?: string }[] };
        }>(token, `messages/${m.id}?format=full`);
        const ms = Number(full.internalDate);
        return {
          id: full.id,
          threadId: full.threadId,
          from: headerValue(full.payload?.headers, "From"),
          subject: headerValue(full.payload?.headers, "Subject"),
          snippet: full.snippet ?? "",
          body: extractBody(full.payload).slice(0, MAX_BODY_CHARS),
          receivedAt: Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null,
        } satisfies GmailMessage;
      } catch (e) {
        // One unreadable message must not sink the whole run.
        console.warn("gmail message fetch failed", m.id, e);
        return null;
      }
    }),
  );
  return messages.filter((m): m is GmailMessage => m !== null);
}

// One candidate email, as handed to the review UI. The suggestion is advice,
// not a filter: every mail in the window is shown and the user rules on it.
export interface ReviewCandidate {
  accountId: string;
  accountLabel: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  url: string;
  receivedAt: string | null;
  // Claude's read: does this need the user to personally do something?
  suggested: boolean;
  // Proposed task title, in the user's voice. Editable before it is added.
  title: string;
  // One line on what is specifically being asked.
  action: string;
}

export interface ReviewOutcome {
  accounts: PublicAccount[];
  candidates: ReviewCandidate[];
  scanned: number;
  // Per-mailbox failures, so one dead grant does not look like an empty inbox.
  errors: { accountId: string; label: string; message: string }[];
}

const Suggestions = z.object({
  emails: z.array(
    z.object({
      // Index into the batch we sent, so we can map back to the thread.
      index: z.number(),
      is_task: z.boolean(),
      title: z.string(),
      action: z.string(),
    }),
  ),
});

const SYSTEM = `You pre-read a single user's inbox so they can review it quickly.

For EVERY email you are given, return one entry. You are advising, not
filtering — the user makes the final call on each one, so never drop an email.

- is_task: true only when the email needs the user to personally DO something:
  reply with a decision, send or review a document, pay something, attend or
  reschedule. False for newsletters, marketing, automated notifications,
  receipts, FYI/CC-only threads, and anything already handled in the thread.
- title: how the task would read on a to-do list — under 60 chars, starting
  with a verb (e.g. "Reply to Kyp on the Ocean Rd quote"). Write one even when
  is_task is false, so the user can overrule you in one tap.
- action: one short sentence on what is specifically being asked, or what the
  email is, when it asks nothing.`;

export async function suggestForMessages(
  messages: readonly GmailMessage[],
): Promise<Map<number, { is_task: boolean; title: string; action: string }>> {
  const out = new Map<number, { is_task: boolean; title: string; action: string }>();
  if (messages.length === 0) return out;

  const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
  const rendered = messages
    .map((m, i) => `[${i}] From: ${m.from}\nSubject: ${m.subject}\n${m.body || m.snippet}`)
    .join("\n\n---\n\n");

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    output_config: { format: zodOutputFormat(Suggestions) },
    messages: [{ role: "user", content: rendered }],
  });

  for (const e of response.parsed_output?.emails ?? []) {
    // The model can hallucinate an out-of-range index; drop rather than misfile.
    if (e.index < 0 || e.index >= messages.length) continue;
    out.set(e.index, { is_task: e.is_task, title: e.title, action: e.action });
  }
  return out;
}

// Threads already ruled on, so a skipped newsletter does not come back every
// morning. Read with the service-role key; the browser writes these rows itself
// as a pass is confirmed.
async function reviewedThreads(supabase: Db, accountId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("email_reviews")
    .select("thread_id")
    .eq("account_id", accountId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => (r as { thread_id: string }).thread_id));
}

function gmailUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${threadId}`;
}

// Gather what is waiting to be reviewed across every active mailbox. Writes
// nothing: the user rules on each candidate and only then does anything land,
// the same propose-then-confirm rule the snooze and roll-forward flows follow.
export async function collectReviewCandidates(supabase: Db): Promise<ReviewOutcome> {
  const accounts = await listAccounts(supabase);
  const errors: ReviewOutcome["errors"] = [];

  const perAccount = await Promise.all(
    accounts.map(async (account): Promise<{ scanned: number; candidates: ReviewCandidate[] }> => {
      try {
        const token = await accessTokenFor(account);
        const fetched = await fetchMessages(
          token,
          account.search_query?.trim() || REVIEW_QUERY,
          REVIEW_MAX_MESSAGES,
        );

        const seen = await reviewedThreads(supabase, account.id);
        const fresh = newestPerThread(fetched).filter((m) => !seen.has(m.threadId));
        const suggestions = await suggestForMessages(fresh);

        const candidates = fresh.map((m, i) => {
          const s = suggestions.get(i);
          return {
            accountId: account.id,
            accountLabel: account.label,
            threadId: m.threadId,
            from: m.from,
            subject: m.subject,
            snippet: m.snippet,
            url: gmailUrl(m.threadId),
            receivedAt: m.receivedAt,
            // No suggestion for this index means the model skipped it; show the
            // mail anyway, unsuggested, rather than hiding it from the review.
            suggested: s?.is_task ?? false,
            title: s?.title?.trim() || m.subject || "(no subject)",
            action: s?.action?.trim() || "",
          } satisfies ReviewCandidate;
        });
        return { scanned: fetched.length, candidates };
      } catch (e) {
        // One mailbox failing (revoked grant, unauthorised scope) must not sink
        // the others; the UI names the mailbox that could not be read.
        console.warn("email review failed for account", account.address, e);
        errors.push({
          accountId: account.id,
          label: account.label,
          message: e instanceof Error ? e.message : "could not be read",
        });
        return { scanned: 0, candidates: [] };
      }
    }),
  );

  return {
    accounts: accounts.map(publicAccount),
    candidates: perAccount.flatMap((a) => a.candidates),
    scanned: perAccount.reduce((n, a) => n + a.scanned, 0),
    errors,
  };
}
