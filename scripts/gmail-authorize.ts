// One-time Gmail consent for a mailbox the service account cannot reach.
//
//   npm run gmail:auth -- --label "Personal"
//
// Domain-wide delegation only impersonates mailboxes inside theglassmarket.co,
// so a personal Gmail or another company's domain has to grant access itself.
// This runs the installed-app loopback flow on the laptop: it prints a consent
// URL, catches the redirect on 127.0.0.1, swaps the code for a refresh token,
// and writes the `email_accounts` row with the service-role key.
//
// It lives here rather than as an /api route for two reasons: api/ is at
// Vercel's Hobby-plan 12-function cap, and consent has to happen in the
// browser of whoever owns the mailbox — the same reasoning that puts
// scripts/workstream-hook.sh on the laptop with the service-role key.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

// Read AND modify: the review pass can archive a thread and apply labels, and
// a refresh token only carries the scopes consented to when it was granted — so
// a grant made before the write scope existed must be re-run to pick it up.
const SCOPE = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
].join(" ");

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name} in .env.local`);
    process.exit(1);
  }
  return v;
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const clientId = required("GOOGLE_OAUTH_CLIENT_ID");
const clientSecret = required("GOOGLE_OAUTH_CLIENT_SECRET");
const supabaseUrl = required("SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

// Wait for Google to redirect back with the code, checking the state we sent so
// a stray request on the loopback port cannot inject one.
function awaitCode(state: string): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const gotState = url.searchParams.get("state");

      const done = (message: string) => {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<html><body style="font:16px system-ui;padding:3rem">${message}</body></html>`);
      };

      if (error) {
        done(`Authorization failed: ${error}. You can close this tab.`);
        server.close();
        reject(new Error(error));
        return;
      }
      if (!code) {
        // Browsers also ask for /favicon.ico on the way through.
        res.writeHead(404);
        res.end();
        return;
      }
      if (gotState !== state) {
        done("State mismatch — nothing was saved. You can close this tab.");
        server.close();
        reject(new Error("state mismatch"));
        return;
      }

      done("Mailbox authorized. You can close this tab and go back to the terminal.");
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close();
      resolve({ code, redirectUri: `http://127.0.0.1:${port}` });
    });

    // Port 0: let the OS pick. A "Desktop app" OAuth client accepts any
    // loopback port, so nothing has to be registered in the console.
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const redirectUri = `http://127.0.0.1:${port}`;
      const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      consent.searchParams.set("client_id", clientId);
      consent.searchParams.set("redirect_uri", redirectUri);
      consent.searchParams.set("response_type", "code");
      consent.searchParams.set("scope", SCOPE);
      // offline + consent: without both, a re-grant returns no refresh token.
      consent.searchParams.set("access_type", "offline");
      consent.searchParams.set("prompt", "consent");
      consent.searchParams.set("state", state);

      console.log("\nSign in as the mailbox you want to review, and approve access:\n");
      console.log(consent.toString());
      console.log("\nWaiting for the redirect…");

      const opener =
        process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      // Best effort: if there is no browser on this machine, the printed URL is
      // the fallback, so a failure here is not worth reporting.
      spawn(opener, [consent.toString()], { stdio: "ignore", detached: true }).unref();
    });

    server.on("error", reject);
  });
}

async function exchange(
  code: string,
  redirectUri: string,
): Promise<{ refreshToken: string; address: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }),
  });
  const body = (await res.json().catch(() => null)) as
    | { refresh_token?: string; access_token?: string; error_description?: string; error?: string }
    | null;
  if (!res.ok || !body?.refresh_token) {
    const detail = body?.error_description ?? body?.error ?? `HTTP ${res.status}`;
    throw new Error(`Token exchange failed: ${detail}`);
  }
  // The access token is used once, to read back which mailbox was granted.
  const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${body.access_token}` },
  });
  const who = (await profile.json().catch(() => null)) as { emailAddress?: string } | null;
  if (!who?.emailAddress) throw new Error("Could not read the mailbox address back from Gmail");
  console.log(`\nGranted for ${who.emailAddress}`);
  return { refreshToken: body.refresh_token, address: who.emailAddress };
}

const state = randomBytes(16).toString("hex");
const { code, redirectUri } = await awaitCode(state);
const { refreshToken, address } = await exchange(code, redirectUri);
const label = argValue("--label") ?? address.split("@")[0];

const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

// The unique index is partial (live rows only), so ON CONFLICT cannot infer it
// — the same reason the workstreams writer is an RPC. Look first, then write.
const { data: existing, error: readErr } = await sb
  .from("email_accounts")
  .select("id")
  .eq("address", address)
  .is("deleted_at", null)
  .limit(1);
if (readErr) {
  console.error("Lookup failed:", readErr.message);
  process.exit(1);
}

const row = {
  label,
  address,
  auth_mode: "oauth",
  refresh_token: refreshToken,
  is_active: true,
};

const { error: writeErr } = existing?.length
  ? await sb.from("email_accounts").update(row).eq("id", existing[0].id)
  : await sb.from("email_accounts").insert(row);

if (writeErr) {
  console.error("Save failed:", writeErr.message);
  process.exit(1);
}

console.log(
  `Saved as "${label}". It will appear in the next email review pass on the to-do list.`,
);
