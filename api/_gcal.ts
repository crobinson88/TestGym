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

// Mint an OAuth access token for the calendar scope by signing a service-account
// JWT and exchanging it at the token endpoint. `sub` impersonates the user whose
// calendar we write to (domain-wide delegation on a Workspace domain).
export async function getCalendarAccessToken(): Promise<string> {
  const clientEmail = env("GOOGLE_SA_CLIENT_EMAIL");
  // The private key is stored with literal "\n" in env vars; restore newlines.
  const privateKey = env("GOOGLE_SA_PRIVATE_KEY").replace(/\\n/g, "\n");
  const subject = process.env.GOOGLE_CALENDAR_SUBJECT ?? ALLOWED_EMAIL;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    sub: subject,
    scope: "https://www.googleapis.com/auth/calendar.events",
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
