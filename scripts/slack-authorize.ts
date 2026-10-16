// One-time Slack grant for a workspace the comms review pass should read.
//
//   npm run slack:auth                       # prompts for the token
//   npm run slack:auth -- --label "TGM"      # name it yourself
//
// Unlike `npm run gmail:auth` this does NOT run a loopback consent flow.
// Slack requires every redirect URL to be HTTPS and rejects a 127.0.0.1
// callback, so the installed-app trick the Gmail script plays is not available
// here. Instead the install happens in Slack's own app-config UI — which needs
// no redirect URL at all — and this script takes the token that produces,
// checks it really works, and writes the `slack_workspaces` row.
//
// Set-up, once per workspace:
//   1. api.slack.com/apps → Create New App → From scratch, pick the workspace.
//   2. OAuth & Permissions → User Token Scopes → add `search:read`.
//      It must be a USER scope: `search.messages` runs as you, and a bot token
//      cannot call it at all.
//   3. Install to Workspace, then copy the "User OAuth Token" (xoxp-…).
//   4. Run this script and paste it.
//
// It lives in scripts/ rather than /api for the same two reasons the Gmail one
// does: api/ is at Vercel's Hobby-plan 12-function cap, and the grant belongs
// to whoever owns the workspace, not to the deployment.
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

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

const supabaseUrl = required("SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");

async function readToken(): Promise<string> {
  const fromArg = argValue("--token") ?? process.env.SLACK_USER_TOKEN ?? null;
  if (fromArg) return fromArg.trim();
  const rl = createInterface({ input: stdin, output: stdout });
  // Prompted rather than taken as an argument by default, so the token does not
  // sit in shell history.
  const answer = await rl.question("Paste the workspace's User OAuth Token (xoxp-…): ");
  rl.close();
  return answer.trim();
}

type SlackResponse = { ok: boolean; error?: string };

async function slackGet<T extends SlackResponse>(
  token: string,
  path: string,
): Promise<T> {
  const res = await fetch(`https://slack.com/api/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json().catch(() => null)) as T | null;
  // Slack answers HTTP 200 with ok:false, so the status alone proves nothing.
  if (!body) throw new Error(`Slack API ${res.status} returned no JSON`);
  if (!body.ok) throw new Error(body.error ?? "slack call failed");
  return body;
}

const token = await readToken();
if (!token) {
  console.error("No token given.");
  process.exit(1);
}
if (!token.startsWith("xoxp-")) {
  // A bot token is the likely mistake, and it would fail much later, inside a
  // review pass, with a confusing "not_allowed_token_type".
  console.error(
    `That looks like a ${token.slice(0, token.indexOf("-") + 1) || "non-user"} token.\n` +
      "The comms review needs the User OAuth Token (xoxp-…): search.messages runs as\n" +
      "you, and a bot token cannot call it. Check OAuth & Permissions → User Token Scopes.",
  );
  process.exit(1);
}

let who: { team: string; team_id: string; user_id: string };
try {
  who = await slackGet<SlackResponse & { team: string; team_id: string; user_id: string }>(
    token,
    "auth.test",
  );
} catch (e) {
  console.error(`Token rejected: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}

// Prove the scope before storing the token, so a missing `search:read` surfaces
// here rather than as an empty review pass days later.
try {
  await slackGet(token, "search.messages?query=from%3Ame&count=1");
} catch (e) {
  const detail = e instanceof Error ? e.message : String(e);
  console.error(
    `Token works but cannot search (${detail}).\n` +
      "Add `search:read` under OAuth & Permissions → User Token Scopes, reinstall the\n" +
      "app to the workspace, and copy the new User OAuth Token.",
  );
  process.exit(1);
}

console.log(`\nGranted for ${who.team} (you are ${who.user_id})`);

const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

// The unique index is partial (live rows only), so ON CONFLICT cannot infer it
// — the same reason the Gmail authorize script and the workstreams writer look
// before they write.
const { data: existing, error: readErr } = await sb
  .from("slack_workspaces")
  .select("id")
  .eq("team_id", who.team_id)
  .is("deleted_at", null)
  .limit(1);
if (readErr) {
  console.error("Lookup failed:", readErr.message);
  process.exit(1);
}

const label = argValue("--label") ?? who.team;
const row = {
  label,
  team_id: who.team_id,
  slack_user_id: who.user_id,
  access_token: token,
  is_active: true,
};

const { error: writeErr } = existing?.length
  ? await sb.from("slack_workspaces").update(row).eq("id", existing[0].id)
  : await sb.from("slack_workspaces").insert(row);

if (writeErr) {
  console.error("Save failed:", writeErr.message);
  process.exit(1);
}

console.log(
  `Saved as "${label}". It will appear in the next comms review pass on the to-do list.`,
);
