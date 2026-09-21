// Google Calendar helpers for the "Add Calendar" flow. Auth against the calendar
// via a Google service account with domain-wide delegation, impersonating the
// single app user, then create events over the REST API — no googleapis
// dependency, just a signed JWT + fetch. The leading `_` keeps Vercel from
// routing this file; it's only imported.
import crypto from "node:crypto";
import { ALLOWED_EMAIL, env } from "./_fireflies.js";

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
// Reading the user's full calendar list needs a read scope; calendar.events
// alone can't enumerate calendarList. Must also be authorised on the service
// account's client id in Workspace admin (domain-wide delegation).
export const CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// Mint an OAuth access token for the calendar scope by signing a service-account
// JWT and exchanging it at the token endpoint. `sub` impersonates the user whose
// calendar we write to (domain-wide delegation on a Workspace domain).
export async function getCalendarAccessToken(): Promise<string> {
  return getGoogleAccessToken(CALENDAR_SCOPE);
}

// Read-scope token used for enumerating calendars and reading busy time across
// all of them (freeBusy works under either scope, but calendarList.list needs a
// read scope).
export async function getCalendarReadAccessToken(): Promise<string> {
  return getGoogleAccessToken(CALENDAR_READONLY_SCOPE);
}

// Same JWT dance for any delegated scope. Each scope must also be authorised on
// the service account's client id in Workspace admin, or the exchange 401s with
// "unauthorized_client".
export async function getGoogleAccessToken(scope: string): Promise<string> {
  const clientEmail = env("GOOGLE_SA_CLIENT_EMAIL");
  // The private key is stored with literal "\n" in env vars; restore newlines.
  const privateKey = env("GOOGLE_SA_PRIVATE_KEY").replace(/\\n/g, "\n");
  const subject = process.env.GOOGLE_CALENDAR_SUBJECT ?? ALLOWED_EMAIL;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    sub: subject,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput =
    `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(claim)))}`;
  const signature = crypto.createSign("RSA-SHA256").update(signingInput).sign(privateKey);
  const assertion = `${signingInput}.${b64url(signature)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null;
  if (!res.ok || !body?.access_token) {
    const detail = body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
    throw new Error(`Google token exchange failed: ${detail}`);
  }
  return body.access_token;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  // Naive local wall-clock strings ("YYYY-MM-DDTHH:MM:SS"); paired with timeZone.
  startDateTime: string;
  endDateTime: string;
}

export interface BusyPeriod {
  // RFC3339 UTC instants as returned by Google (e.g. "2026-07-27T13:00:00Z").
  start: string;
  end: string;
}

// List every calendar the impersonated user can see, returning their ids so
// busy time can be read across all of them. Hidden calendars are skipped. Needs
// a read scope (see getCalendarReadAccessToken). Paginates in case the account
// has many calendars.
export async function listBusyCalendarIds(accessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("minAccessRole", "reader");
    url.searchParams.set("showHidden", "false");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = (await res.json().catch(() => null)) as
      | {
          items?: { id?: string; hidden?: boolean; deleted?: boolean }[];
          nextPageToken?: string;
          error?: { message?: string };
        }
      | null;
    if (!res.ok || !body) {
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }
    for (const c of body.items ?? []) {
      if (c.id && !c.hidden && !c.deleted) ids.push(c.id);
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return ids;
}

// Read busy blocks between two instants via the freeBusy API across one or more
// calendars, so the client can slot new events into the gaps left by every
// calendar. `timeMin`/`timeMax` are RFC3339 with an offset (or Z) — the client
// builds them from its own clock. Busy periods from all calendars are unioned;
// the client merges any that overlap. freeBusy caps at 50 calendars per call,
// so the ids are chunked. A per-calendar error (e.g. one calendar the account
// lost access to) is skipped rather than failing the whole read.
export async function getCalendarBusy(
  accessToken: string,
  timeMin: string,
  timeMax: string,
  timeZone: string,
  calendarIds: string[] = [process.env.GOOGLE_CALENDAR_ID ?? ALLOWED_EMAIL],
): Promise<BusyPeriod[]> {
  const ids = calendarIds.length > 0 ? calendarIds : [process.env.GOOGLE_CALENDAR_ID ?? ALLOWED_EMAIL];
  const busy: BusyPeriod[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ timeMin, timeMax, timeZone, items: chunk.map((id) => ({ id })) }),
    });
    const body = (await res.json().catch(() => null)) as
      | {
          calendars?: Record<string, { busy?: BusyPeriod[]; errors?: { reason?: string }[] }>;
          error?: { message?: string };
        }
      | null;
    if (!res.ok || !body) {
      throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
    }
    for (const cal of Object.values(body.calendars ?? {})) {
      // Skip a calendar the account can't read rather than aborting the day.
      if (cal?.errors?.length) continue;
      for (const b of cal?.busy ?? []) busy.push({ start: b.start, end: b.end });
    }
  }
  return busy;
}

// Create one event on the target calendar. Returns the new event id.
export async function createCalendarEvent(
  accessToken: string,
  timeZone: string,
  event: CalendarEventInput,
): Promise<string> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? ALLOWED_EMAIL;
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description,
        start: { dateTime: event.startDateTime, timeZone },
        end: { dateTime: event.endDateTime, timeZone },
      }),
    },
  );
  const body = (await res.json().catch(() => null)) as
    | { id?: string; error?: { message?: string } }
    | null;
  if (!res.ok || !body?.id) {
    const detail = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body.id;
}
