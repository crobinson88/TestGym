"use strict";

// Data layer for the sticky note. Two sources merged into one list:
//   1. Supabase `workstreams` rows, written by scripts/workstream-hook.sh (CLI)
//      and by hand (web / Cowork chats).
//   2. Local Claude Code transcripts in ~/.claude/projects, so sessions still
//      show when the hook isn't installed or Supabase is unreachable — and so a
//      new turn after a Stop reads as running (the hook has no prompt event).
// Everything except the fs/network edges is pure and tested.

const fsp = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

// Same window as src/modules/workstreams/compute.ts: a session killed without a
// Stop hook greys out instead of claiming to be live forever.
const STALE_AFTER_MS = 30 * 60 * 1000;
// Finished sessions linger briefly so you can see what just wrapped up.
const DONE_VISIBLE_MS = 2 * 60 * 60 * 1000;
// A CLI session nobody has touched for this long is dead; drop it from the note.
const ACTIVE_VISIBLE_MS = 12 * 60 * 60 * 1000;
// Only transcripts written inside this window are scanned.
const LOCAL_WINDOW_MS = 2 * 60 * 60 * 1000;
// A transcript newer than the cloud row by more than this means the session
// moved on since the hook last fired, so the local reading wins.
const LOCAL_NEWER_SLACK_MS = 2000;
const TAIL_BYTES = 64 * 1024;
const FETCH_TIMEOUT_MS = 8000;

function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, "");
    out[m[1]] = value;
  }
  return out;
}

async function loadConfig(env = process.env, home = os.homedir()) {
  const configFile = env.WORKSTREAM_ENV_FILE || path.join(home, ".claude", "workstream.env");
  let fileVars = {};
  try {
    fileVars = parseEnvFile(await fsp.readFile(configFile, "utf8"));
  } catch {
    // No file = local-only mode.
  }
  const supabaseUrl = (env.SUPABASE_URL || fileVars.SUPABASE_URL || "").replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || fileVars.SUPABASE_SERVICE_ROLE_KEY || "";
  return {
    configFile,
    supabaseUrl,
    serviceKey,
    configured: Boolean(supabaseUrl && serviceKey),
    projectsDir: env.CLAUDE_PROJECTS_DIR || path.join(home, ".claude", "projects"),
  };
}

function headers(cfg, extra = {}) {
  return {
    apikey: cfg.serviceKey,
    Authorization: `Bearer ${cfg.serviceKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function request(cfg, urlPath, init, fetchImpl) {
  const res = await fetchImpl(`${cfg.supabaseUrl}${urlPath}`, {
    ...init,
    headers: headers(cfg, init.headers),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  return res;
}

// Email tasks live on the Command Center too, but they aren't sessions.
async function fetchWorkstreams(cfg, fetchImpl = fetch) {
  if (!cfg.configured) return [];
  const q = new URLSearchParams({
    select: "id,title,type,status,source_id,last_action,metadata,updated_at,created_at",
    deleted_at: "is.null",
    type: "in.(code_cli,web_chat)",
    order: "updated_at.desc",
    limit: "200",
  });
  const res = await request(cfg, `/rest/v1/workstreams?${q}`, { method: "GET" }, fetchImpl);
  return res.json();
}

async function dismissWorkstream(cfg, id, fetchImpl = fetch) {
  const ts = new Date().toISOString();
  await request(
    cfg,
    `/rest/v1/workstreams?id=eq.${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ deleted_at: ts, updated_at: ts }) },
    fetchImpl,
  );
}

// Mirrors addWorkstream in src/modules/workstreams/api.ts: id set client-side,
// source_id null so it never collides with a hook-driven row.
async function addWebSession(cfg, { title, url }, fetchImpl = fetch) {
  const id = crypto.randomUUID();
  const cleanUrl = normaliseUrl(url);
  await request(
    cfg,
    "/rest/v1/workstreams",
    {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id,
        title: String(title).trim(),
        type: "web_chat",
        status: "in_progress",
        source_id: null,
        last_action: "Added from sticky note",
        metadata: cleanUrl ? { url: cleanUrl } : {},
        client_id: id,
      }),
    },
    fetchImpl,
  );
  return id;
}

function normaliseUrl(url) {
  const s = String(url || "").trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

async function readTail(file, bytes = TAIL_BYTES) {
  const fh = await fsp.open(file, "r");
  try {
    const { size } = await fh.stat();
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    return { text: buf.toString("utf8"), truncated: start > 0 };
  } finally {
    await fh.close();
  }
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  if (content.some((c) => c && c.type === "tool_result")) return "";
  return content
    .filter((c) => c && c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join(" ");
}

// Slash-command echoes and hook output are wrapped in tags; they aren't prompts.
function isRealPrompt(text) {
  const t = text.trim();
  return t.length > 0 && !t.startsWith("<") && !t.startsWith("Caveat:");
}

function oneLine(text, max = 140) {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// Reads the tail of a transcript. `turnEnded` is true when the newest
// conversational entry is an assistant message that stopped on end_turn — the
// same moment the Stop hook fires.
function parseTranscriptTail(text, truncated = false) {
  const lines = String(text).split("\n");
  if (truncated) lines.shift();
  const info = { cwd: null, branch: null, title: null, prompt: null, turnEnded: false };
  for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (!e || typeof e !== "object") continue;
    if (typeof e.cwd === "string" && e.cwd) info.cwd = e.cwd;
    if (typeof e.gitBranch === "string" && e.gitBranch) info.branch = e.gitBranch;
    if (e.type === "summary" && typeof e.summary === "string") info.title = oneLine(e.summary, 80);
    if (e.type === "custom-title" && typeof e.customTitle === "string") info.title = oneLine(e.customTitle, 80);
    if (e.type === "user" && !e.isMeta && e.message) {
      const t = textOf(e.message.content);
      if (isRealPrompt(t)) info.prompt = oneLine(t);
      info.turnEnded = false;
    } else if (e.type === "assistant" && e.message) {
      info.turnEnded = e.message.stop_reason === "end_turn";
    }
  }
  return info;
}

async function scanLocalSessions(projectsDir, now = Date.now(), windowMs = LOCAL_WINDOW_MS) {
  let dirs;
  try {
    dirs = await fsp.readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const full = path.join(projectsDir, dir.name);
    let files;
    try {
      files = await fsp.readdir(full);
    } catch {
      continue;
    }
    for (const name of files) {
      if (!name.endsWith(".jsonl")) continue;
      const file = path.join(full, name);
      try {
        const st = await fsp.stat(file);
        if (now - st.mtimeMs > windowMs) continue;
        const { text, truncated } = await readTail(file);
        out.push({ sessionId: name.slice(0, -".jsonl".length), mtimeMs: st.mtimeMs, ...parseTranscriptTail(text, truncated) });
      } catch {
        // A transcript being rotated mid-read is not worth surfacing.
      }
    }
  }
  return out;
}

// Same "project (branch)" shape the hook writes, so a session doesn't change
// name when its cloud row arrives.
function localTitle(local) {
  if (local.title) return local.title;
  const project = local.cwd ? path.basename(local.cwd) : "Claude Code";
  return local.branch && local.branch !== "HEAD" ? `${project} (${local.branch})` : project;
}

function localStatus(local) {
  return local.turnEnded
    ? { status: "completed", lastAction: "Turn finished" }
    : { status: "in_progress", lastAction: "Working…" };
}

function rowLabel(row) {
  const label = row.metadata && row.metadata.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}

function mergeSessions(rows, locals) {
  const byId = new Map(locals.map((l) => [l.sessionId, l]));
  const used = new Set();
  const out = [];

  for (const row of rows) {
    const meta = row.metadata || {};
    const local = row.type === "code_cli" && row.source_id ? byId.get(row.source_id) : undefined;
    if (local) used.add(local.sessionId);
    const rowMs = Date.parse(row.updated_at);
    const localWins = local && local.mtimeMs > rowMs + LOCAL_NEWER_SLACK_MS;
    const { status, lastAction } = localWins
      ? localStatus(local)
      : { status: row.status, lastAction: row.last_action || "" };
    out.push({
      key: `ws:${row.id}`,
      id: row.id,
      sessionId: row.type === "code_cli" ? row.source_id : null,
      type: row.type,
      title: rowLabel(row) || row.title,
      subtitle: rowLabel(row) ? row.title : null,
      status,
      lastAction,
      prompt: local ? local.prompt : null,
      updatedAt: Math.max(rowMs || 0, local ? local.mtimeMs : 0),
      cwd: meta.cwd || (local && local.cwd) || null,
      url: typeof meta.url === "string" ? meta.url : null,
      source: local ? "both" : "cloud",
    });
  }

  for (const local of locals) {
    if (used.has(local.sessionId)) continue;
    const { status, lastAction } = localStatus(local);
    out.push({
      key: `local:${local.sessionId}`,
      id: null,
      sessionId: local.sessionId,
      type: "code_cli",
      title: localTitle(local),
      subtitle: null,
      status,
      lastAction,
      prompt: local.prompt,
      updatedAt: local.mtimeMs,
      cwd: local.cwd,
      url: null,
      source: "local",
    });
  }
  return out;
}

function isActive(status) {
  return status === "in_progress" || status === "waiting_input";
}

// Web chats are typed in by hand and nothing ever refreshes them, so age says
// nothing about whether they're still open.
function isStale(session, now) {
  if (session.type === "web_chat") return false;
  return isActive(session.status) && now - session.updatedAt > STALE_AFTER_MS;
}

// dismissedLocal: sessionId → dismissed-at ms. A dismissed session stays hidden
// until its transcript is written again.
function visibleSessions(sessions, now, dismissedLocal = {}) {
  return sessions.filter((s) => {
    const dismissedAt = s.sessionId ? dismissedLocal[s.sessionId] : undefined;
    if (dismissedAt && s.updatedAt <= dismissedAt) return false;
    if (!isActive(s.status)) return now - s.updatedAt <= DONE_VISIBLE_MS;
    // Web chats are typed in by hand and never refresh; they stay until dismissed.
    if (s.type === "web_chat") return true;
    return now - s.updatedAt <= ACTIVE_VISIBLE_MS;
  });
}

function rank(s, now) {
  if (s.status === "waiting_input" && !isStale(s, now)) return 0;
  if (s.status === "in_progress" && !isStale(s, now)) return 1;
  if (isActive(s.status)) return 2;
  if (s.status === "failed") return 3;
  return 4;
}

function sortForNote(sessions, now) {
  return [...sessions].sort((a, b) => rank(a, now) - rank(b, now) || b.updatedAt - a.updatedAt);
}

function counts(sessions, now) {
  let running = 0;
  let needYou = 0;
  for (const s of sessions) {
    if (isStale(s, now)) continue;
    if (s.status === "in_progress") running += 1;
    if (s.status === "waiting_input") needYou += 1;
  }
  return { running, needYou, total: sessions.length };
}

// Sessions that just flipped to waiting_input. Nothing fires on the first
// load (prev = null), so opening the note doesn't replay every pending prompt.
function newlyWaiting(prev, sessions) {
  if (!prev) return [];
  return sessions.filter((s) => s.status === "waiting_input" && prev.get(s.key) !== "waiting_input");
}

function statusMap(sessions) {
  return new Map(sessions.map((s) => [s.key, s.status]));
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function resumeCommand(session) {
  if (!session.sessionId) return null;
  const resume = `claude --resume ${session.sessionId}`;
  return session.cwd ? `cd ${shellQuote(session.cwd)} && ${resume}` : resume;
}

function relativeTime(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

module.exports = {
  STALE_AFTER_MS,
  DONE_VISIBLE_MS,
  ACTIVE_VISIBLE_MS,
  LOCAL_WINDOW_MS,
  parseEnvFile,
  loadConfig,
  fetchWorkstreams,
  dismissWorkstream,
  addWebSession,
  normaliseUrl,
  readTail,
  parseTranscriptTail,
  scanLocalSessions,
  mergeSessions,
  isStale,
  visibleSessions,
  sortForNote,
  counts,
  newlyWaiting,
  statusMap,
  resumeCommand,
  relativeTime,
};
