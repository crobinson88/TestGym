"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const src = require("../sources");

const NOW = Date.parse("2026-11-20T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const min = 60 * 1000;

function row(over = {}) {
  return {
    id: "row-1",
    title: "TestGym (main)",
    type: "code_cli",
    status: "in_progress",
    source_id: "sess-1",
    last_action: "Session started",
    metadata: { cwd: "/code/TestGym", branch: "main" },
    updated_at: iso(NOW - 5 * min),
    ...over,
  };
}

function local(over = {}) {
  return { sessionId: "sess-1", mtimeMs: NOW - 5 * min, cwd: "/code/TestGym", branch: "main", title: null, prompt: "fix it", turnEnded: false, ...over };
}

test("parseEnvFile reads the hook's env file, quotes, comments and export", () => {
  const env = src.parseEnvFile(
    "# comment\nSUPABASE_URL=https://x.supabase.co\nexport SUPABASE_SERVICE_ROLE_KEY='abc=def'\nFOO=bar # trailing\n\nbad line\n",
  );
  assert.deepEqual(env, { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "abc=def", FOO: "bar" });
});

test("loadConfig: env overrides file, missing file means local-only", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sticky-"));
  const file = path.join(dir, "workstream.env");
  fs.writeFileSync(file, "SUPABASE_URL=https://file.supabase.co/\nSUPABASE_SERVICE_ROLE_KEY=k\n");
  const cfg = await src.loadConfig({ WORKSTREAM_ENV_FILE: file }, dir);
  assert.equal(cfg.supabaseUrl, "https://file.supabase.co");
  assert.equal(cfg.configured, true);
  const none = await src.loadConfig({ WORKSTREAM_ENV_FILE: path.join(dir, "nope") }, dir);
  assert.equal(none.configured, false);
  assert.equal(none.projectsDir, path.join(dir, ".claude", "projects"));
});

test("parseTranscriptTail picks cwd, branch, last real prompt and turn end", () => {
  const lines = [
    "partial garbage from the cut",
    JSON.stringify({ type: "user", cwd: "/code/a", gitBranch: "feat", message: { role: "user", content: "first prompt" } }),
    JSON.stringify({ type: "assistant", message: { stop_reason: "tool_use", content: [] } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } }),
    JSON.stringify({ type: "user", isMeta: true, message: { content: "meta" } }),
    JSON.stringify({ type: "user", message: { content: "<command-name>/clear</command-name>" } }),
    JSON.stringify({ type: "assistant", message: { stop_reason: "end_turn", content: [] } }),
    JSON.stringify({ type: "summary", summary: "Build the sticky note" }),
  ].join("\n");
  const info = src.parseTranscriptTail(lines, true);
  assert.equal(info.cwd, "/code/a");
  assert.equal(info.branch, "feat");
  assert.equal(info.prompt, "first prompt");
  assert.equal(info.title, "Build the sticky note");
  assert.equal(info.turnEnded, true);
});

test("parseTranscriptTail: a prompt after end_turn means working again", () => {
  const lines = [
    JSON.stringify({ type: "assistant", message: { stop_reason: "end_turn" } }),
    JSON.stringify({ type: "user", message: { content: [{ type: "text", text: "and now this" }] } }),
  ].join("\n");
  const info = src.parseTranscriptTail(lines);
  assert.equal(info.turnEnded, false);
  assert.equal(info.prompt, "and now this");
});

test("scanLocalSessions reads recent top-level transcripts only", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sticky-proj-"));
  const proj = path.join(dir, "-code-TestGym");
  fs.mkdirSync(path.join(proj, "sess-a", "subagents"), { recursive: true });
  const line = JSON.stringify({ type: "user", cwd: "/code/TestGym", message: { content: "hi" } });
  fs.writeFileSync(path.join(proj, "sess-a.jsonl"), line + "\n");
  fs.writeFileSync(path.join(proj, "sess-a", "subagents", "agent.jsonl"), line + "\n");
  fs.writeFileSync(path.join(proj, "old.jsonl"), line + "\n");
  const old = (Date.now() - src.LOCAL_WINDOW_MS - min) / 1000;
  fs.utimesSync(path.join(proj, "old.jsonl"), old, old);
  const found = await src.scanLocalSessions(dir);
  assert.deepEqual(found.map((f) => f.sessionId), ["sess-a"]);
  assert.equal(found[0].cwd, "/code/TestGym");
  assert.deepEqual(await src.scanLocalSessions(path.join(dir, "missing")), []);
});

test("mergeSessions joins a hook row to its transcript by session id", () => {
  const [s] = src.mergeSessions([row({ status: "waiting_input", last_action: "Needs Bash permission" })], [local()]);
  assert.equal(s.source, "both");
  assert.equal(s.status, "waiting_input");
  assert.equal(s.lastAction, "Needs Bash permission");
  assert.equal(s.prompt, "fix it");
  assert.equal(s.sessionId, "sess-1");
});

test("mergeSessions: a transcript newer than the row wins (new turn after Stop)", () => {
  const [s] = src.mergeSessions(
    [row({ status: "completed", last_action: "Turn finished", updated_at: iso(NOW - 10 * min) })],
    [local({ mtimeMs: NOW - 1 * min, turnEnded: false })],
  );
  assert.equal(s.status, "in_progress");
  assert.equal(s.updatedAt, NOW - 1 * min);
});

test("mergeSessions: label wins the title, system title kept as subtitle", () => {
  const [s] = src.mergeSessions([row({ metadata: { label: "Sticky note build", cwd: "/x" } })], []);
  assert.equal(s.title, "Sticky note build");
  assert.equal(s.subtitle, "TestGym (main)");
  assert.equal(s.cwd, "/x");
});

test("mergeSessions: local-only sessions get the hook's title shape", () => {
  const out = src.mergeSessions([], [local({ sessionId: "solo", turnEnded: true })]);
  assert.equal(out[0].key, "local:solo");
  assert.equal(out[0].title, "TestGym (main)");
  assert.equal(out[0].status, "completed");
});

test("mergeSessions: web chats carry their url", () => {
  const [s] = src.mergeSessions([row({ type: "web_chat", source_id: null, metadata: { url: "https://claude.ai/chat/1" } })], []);
  assert.equal(s.url, "https://claude.ai/chat/1");
  assert.equal(s.sessionId, null);
});

test("visibleSessions hides old finished and dead CLI rows, keeps web chats", () => {
  const sessions = [
    { key: "a", type: "code_cli", status: "completed", updatedAt: NOW - 3 * 60 * min },
    { key: "b", type: "code_cli", status: "completed", updatedAt: NOW - 30 * min },
    { key: "c", type: "code_cli", status: "in_progress", updatedAt: NOW - 13 * 60 * min },
    { key: "d", type: "web_chat", status: "in_progress", updatedAt: NOW - 72 * 60 * min },
    { key: "e", type: "code_cli", sessionId: "x", status: "in_progress", updatedAt: NOW - 5 * min },
  ];
  const keys = src.visibleSessions(sessions, NOW, { x: NOW - 1 * min }).map((s) => s.key);
  assert.deepEqual(keys, ["b", "d"]);
  // A dismissed session reappears once its transcript is written again.
  const back = src.visibleSessions([{ ...sessions[4], updatedAt: NOW }], NOW, { x: NOW - 1 * min });
  assert.equal(back.length, 1);
});

test("sortForNote: needs-you, running, stale, failed, done; newest first within", () => {
  const sessions = [
    { key: "done", status: "completed", updatedAt: NOW },
    { key: "stale", status: "in_progress", updatedAt: NOW - 40 * min },
    { key: "run-old", status: "in_progress", updatedAt: NOW - 10 * min },
    { key: "run-new", status: "in_progress", updatedAt: NOW - 1 * min },
    { key: "wait", status: "waiting_input", updatedAt: NOW - 20 * min },
    { key: "fail", status: "failed", updatedAt: NOW },
  ];
  assert.deepEqual(src.sortForNote(sessions, NOW).map((s) => s.key), ["wait", "run-new", "run-old", "stale", "fail", "done"]);
});

test("isStale: CLI rows go stale after 30 min, hand-added web chats never do", () => {
  assert.equal(src.isStale({ type: "code_cli", status: "in_progress", updatedAt: NOW - 31 * min }, NOW), true);
  assert.equal(src.isStale({ type: "code_cli", status: "completed", updatedAt: NOW - 31 * min }, NOW), false);
  assert.equal(src.isStale({ type: "web_chat", status: "in_progress", updatedAt: NOW - 72 * 60 * min }, NOW), false);
});

test("counts skips stale sessions", () => {
  const c = src.counts(
    [
      { status: "in_progress", updatedAt: NOW },
      { status: "in_progress", updatedAt: NOW - 31 * min },
      { status: "waiting_input", updatedAt: NOW },
      { status: "completed", updatedAt: NOW },
    ],
    NOW,
  );
  assert.deepEqual(c, { running: 1, needYou: 1, total: 4 });
});

test("newlyWaiting fires on the transition only, never on first load", () => {
  const list = [{ key: "a", status: "waiting_input" }, { key: "b", status: "in_progress" }];
  assert.deepEqual(src.newlyWaiting(null, list), []);
  const prev = src.statusMap([{ key: "a", status: "in_progress" }, { key: "b", status: "in_progress" }]);
  assert.deepEqual(src.newlyWaiting(prev, list).map((s) => s.key), ["a"]);
  assert.deepEqual(src.newlyWaiting(src.statusMap(list), list), []);
});

test("resumeCommand quotes the cwd for a POSIX shell", () => {
  assert.equal(src.resumeCommand({ sessionId: "s1", cwd: "/a b/it's" }, "darwin"), `cd '/a b/it'\\''s' && claude --resume s1`);
  assert.equal(src.resumeCommand({ sessionId: "s1", cwd: null }, "linux"), "claude --resume s1");
  assert.equal(src.resumeCommand({ sessionId: null }, "darwin"), null);
});

test("resumeCommand on Windows is PowerShell 5.1-safe (no &&)", () => {
  const cmd = src.resumeCommand({ sessionId: "s1", cwd: "C:\\Users\\carob\\it's dir" }, "win32");
  assert.equal(cmd, "Set-Location -LiteralPath 'C:\\Users\\carob\\it''s dir'; claude --resume s1");
  assert.ok(!cmd.includes("&&"));
  assert.equal(src.resumeCommand({ sessionId: "s1", cwd: null }, "win32"), "claude --resume s1");
});

test("normaliseUrl accepts bare hosts, rejects non-web schemes", () => {
  assert.equal(src.normaliseUrl("claude.ai/chat/1"), "https://claude.ai/chat/1");
  assert.equal(src.normaliseUrl("javascript:alert(1)"), null);
  assert.equal(src.normaliseUrl(""), null);
});

test("relativeTime", () => {
  assert.equal(src.relativeTime(NOW - 10 * 1000, NOW), "now");
  assert.equal(src.relativeTime(NOW - 5 * min, NOW), "5m");
  assert.equal(src.relativeTime(NOW - 3 * 60 * min, NOW), "3h");
  assert.equal(src.relativeTime(NOW - 50 * 60 * min, NOW), "2d");
});

test("fetchWorkstreams sends the service key and filters to sessions", async () => {
  let seen;
  const fake = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => [row()] };
  };
  const cfg = { configured: true, supabaseUrl: "https://x.supabase.co", serviceKey: "k" };
  const rows = await src.fetchWorkstreams(cfg, fake);
  assert.equal(rows.length, 1);
  assert.match(seen.url, /type=in\.%28code_cli%2Cweb_chat%29/);
  assert.match(seen.url, /deleted_at=is\.null/);
  assert.equal(seen.init.headers.Authorization, "Bearer k");
  assert.deepEqual(await src.fetchWorkstreams({ configured: false }, fake), []);
});

test("addWebSession inserts a web_chat row with a client-side id", async () => {
  let body;
  const fake = async (_url, init) => {
    body = JSON.parse(init.body);
    return { ok: true };
  };
  const id = await src.addWebSession({ configured: true, supabaseUrl: "https://x", serviceKey: "k" }, { title: " Deck review ", url: "claude.ai/chat/9" }, fake);
  assert.equal(body.id, id);
  assert.equal(body.client_id, id);
  assert.equal(body.type, "web_chat");
  assert.equal(body.title, "Deck review");
  assert.equal(body.source_id, null);
  assert.deepEqual(body.metadata, { url: "https://claude.ai/chat/9" });
});
