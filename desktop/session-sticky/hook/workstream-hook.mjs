#!/usr/bin/env node
// Claude Code hook → Workstream Command Center / Session Sticky.
//
// Cross-platform port of scripts/workstream-hook.sh: plain Node, no bash, jq or
// curl, so the same file runs on Windows, macOS and Claude Code cloud sessions.
// Wired to SessionStart / Notification / Stop / SessionEnd; Claude Code pipes
// the hook payload as JSON on stdin.
//
// Auth, first match wins:
//   WORKSTREAM_TOKEN          → rpc/workstream_report with the public anon key.
//                               The token can only touch `workstreams`.
//   SUPABASE_SERVICE_ROLE_KEY → rpc/workstream_upsert (the original Mac setup).
// Read from the environment first (cloud sessions), then ~/.claude/workstream.env.
//
// Never fails a turn: every error is swallowed and the exit code is always 0.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_SUPABASE_URL = "https://rgslyxzeyjiypzilpxpf.supabase.co";
// Publishable by design: it ships in the PWA bundle. RLS and the token gate do
// the protecting.
export const DEFAULT_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnc2x5eHpleWppeXB6aWxweHBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzA0MDQsImV4cCI6MjA5NDY0NjQwNH0.LxCjHC0xTvm8jPZvsUy6SyEJvqs2Vziyd5qPCYKRDkg";
const TIMEOUT_MS = 4000;

export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = value.match(/^(['"])(.*)\1$/);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, "");
    out[m[1]] = value;
  }
  return out;
}

export function resolveConfig(env, fileVars = {}) {
  const pick = (k) => env[k] || fileVars[k] || "";
  return {
    url: (pick("SUPABASE_URL") || DEFAULT_SUPABASE_URL).replace(/\/+$/, ""),
    anonKey: pick("SUPABASE_ANON_KEY") || DEFAULT_ANON_KEY,
    token: pick("WORKSTREAM_TOKEN"),
    serviceKey: pick("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

// Cloud sessions carry `cse_<id>`; the session's page is claude.ai/code/session_<id>.
export function cloudSessionUrl(remoteId) {
  if (!remoteId) return null;
  const id = String(remoteId).replace(/^(cse_|session_)/, "");
  return /^[A-Za-z0-9]+$/.test(id) ? `https://claude.ai/code/session_${id}` : null;
}

const EVENTS = {
  SessionStart: ["in_progress", "Session started"],
  Notification: ["waiting_input", null],
  Stop: ["completed", "Turn finished"],
  // A session that ends without a Stop (crash, closed terminal) would otherwise
  // sit on the board as running until the stale window catches it.
  SessionEnd: ["completed", "Session ended"],
};

export function buildReport(payload, env = {}, branch = "") {
  const sessionId = payload && payload.session_id;
  if (!sessionId) return null;
  const event = payload.hook_event_name || "";
  const cwd = payload.cwd || "";
  const message = typeof payload.message === "string" ? payload.message : "";
  const [status, action] = EVENTS[event] || ["in_progress", message || event || "Working"];
  const project = cwd.split(/[\\/]+/).filter(Boolean).pop() || "Claude Code";
  const cleanBranch = branch && branch !== "HEAD" ? branch : "";
  const metadata = { cwd, branch: cleanBranch };
  const url = cloudSessionUrl(env.CLAUDE_CODE_REMOTE_SESSION_ID);
  if (url) {
    metadata.remote = true;
    metadata.url = url;
  }
  return {
    p_type: "code_cli",
    p_source_id: String(sessionId),
    p_title: cleanBranch ? `${project} (${cleanBranch})` : project,
    p_status: status,
    p_last_action: (action || message || "Waiting for your input").slice(0, 500),
    p_metadata: metadata,
  };
}

function isJwt(key) {
  return /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(key);
}

// Token beats service key: it's the narrower credential, so a machine that has
// both never uses more access than it needs.
export function buildRequest(cfg, report) {
  if (cfg.token) {
    const headers = { apikey: cfg.anonKey, "Content-Type": "application/json" };
    if (isJwt(cfg.anonKey)) headers.Authorization = `Bearer ${cfg.anonKey}`;
    return { url: `${cfg.url}/rest/v1/rpc/workstream_report`, headers, body: { p_token: cfg.token, ...report } };
  }
  if (cfg.serviceKey) {
    return {
      url: `${cfg.url}/rest/v1/rpc/workstream_upsert`,
      headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, "Content-Type": "application/json" },
      body: report,
    };
  }
  return null;
}

function gitBranch(cwd) {
  if (!cwd) return "";
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf8",
      timeout: 2000,
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
  } catch {
    return "";
  }
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  let fileVars = {};
  const envFile = process.env.WORKSTREAM_ENV_FILE || join(homedir(), ".claude", "workstream.env");
  try {
    fileVars = parseEnvFile(readFileSync(envFile, "utf8"));
  } catch {
    // Env-only (cloud) or not configured.
  }
  const cfg = resolveConfig(process.env, fileVars);
  const payload = JSON.parse((await readStdin()) || "{}");
  const report = buildReport(payload, process.env, gitBranch(payload.cwd));
  if (!report) return;
  const req = buildRequest(cfg, report);
  if (!req) return;
  await fetch(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify(req.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main()
    .catch(() => {})
    .finally(() => process.exit(0));
}
