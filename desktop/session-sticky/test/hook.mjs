import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildReport,
  buildRequest,
  cloudSessionUrl,
  resolveConfig,
  DEFAULT_ANON_KEY,
  DEFAULT_SUPABASE_URL,
} from "../hook/workstream-hook.mjs";

const HOOK = fileURLToPath(new URL("../hook/workstream-hook.mjs", import.meta.url));

test("buildReport maps events to statuses like the bash hook", () => {
  const base = { session_id: "s1", cwd: "/code/TestGym" };
  assert.equal(buildReport({ ...base, hook_event_name: "SessionStart" }).p_status, "in_progress");
  const n = buildReport({ ...base, hook_event_name: "Notification", message: "Claude needs your permission to use Bash" });
  assert.equal(n.p_status, "waiting_input");
  assert.equal(n.p_last_action, "Claude needs your permission to use Bash");
  assert.equal(buildReport({ ...base, hook_event_name: "Stop" }).p_last_action, "Turn finished");
  assert.equal(buildReport({ ...base, hook_event_name: "SessionEnd" }).p_status, "completed");
  assert.equal(buildReport({ cwd: "/x", hook_event_name: "Stop" }), null);
});

test("buildReport titles as 'project (branch)', Windows paths too", () => {
  assert.equal(buildReport({ session_id: "s", cwd: "/code/TestGym" }, {}, "main").p_title, "TestGym (main)");
  assert.equal(buildReport({ session_id: "s", cwd: "C:\\Users\\carob\\TestGym\\" }, {}, "HEAD").p_title, "TestGym");
  assert.equal(buildReport({ session_id: "s", cwd: "" }).p_title, "Claude Code");
});

test("cloud sessions carry remote + their claude.ai link", () => {
  const r = buildReport({ session_id: "s", cwd: "/home/user/TestGym", hook_event_name: "Stop" }, { CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01ABCxyz" }, "feat");
  assert.deepEqual(r.p_metadata, { cwd: "/home/user/TestGym", branch: "feat", remote: true, url: "https://claude.ai/code/session_01ABCxyz" });
  assert.equal(cloudSessionUrl("weird/../id"), null);
  assert.equal(cloudSessionUrl(""), null);
  assert.equal(buildReport({ session_id: "s", cwd: "/x" }).p_metadata.remote, undefined);
});

test("resolveConfig: env beats file, defaults fill the rest", () => {
  const cfg = resolveConfig({ WORKSTREAM_TOKEN: "env-token" }, { WORKSTREAM_TOKEN: "file-token", SUPABASE_URL: "https://f.supabase.co/" });
  assert.equal(cfg.token, "env-token");
  assert.equal(cfg.url, "https://f.supabase.co");
  assert.equal(cfg.anonKey, DEFAULT_ANON_KEY);
  assert.equal(resolveConfig({}).url, DEFAULT_SUPABASE_URL);
});

test("buildRequest prefers the token, falls back to the service key, else nothing", () => {
  const report = { p_type: "code_cli", p_source_id: "s" };
  const t = buildRequest({ url: "https://x", anonKey: DEFAULT_ANON_KEY, token: "tok", serviceKey: "svc" }, report);
  assert.equal(t.url, "https://x/rest/v1/rpc/workstream_report");
  assert.equal(t.body.p_token, "tok");
  assert.equal(t.headers.Authorization, `Bearer ${DEFAULT_ANON_KEY}`);
  const pub = buildRequest({ url: "https://x", anonKey: "sb_publishable_abc", token: "tok" }, report);
  assert.equal(pub.headers.Authorization, undefined);
  const s = buildRequest({ url: "https://x", anonKey: "a", token: "", serviceKey: "svc" }, report);
  assert.equal(s.url, "https://x/rest/v1/rpc/workstream_upsert");
  assert.equal(s.body.p_token, undefined);
  assert.equal(buildRequest({ url: "https://x", anonKey: "a", token: "", serviceKey: "" }, report), null);
});

function runHook(stdin, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], { env: { PATH: process.env.PATH, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolve({ code, out }));
    child.stdin.end(stdin);
  });
}

test("the hook posts to the RPC end to end and always exits 0", async () => {
  const hits = [];
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      hits.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body) });
      res.end("null");
    });
  });
  await new Promise((r) => srv.listen(0, r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const env = { SUPABASE_URL: url, WORKSTREAM_TOKEN: "tok-123", WORKSTREAM_ENV_FILE: "/nonexistent", CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01Q" };
  const ok = await runHook(JSON.stringify({ session_id: "abc", cwd: "/tmp", hook_event_name: "Notification", message: "Needs you" }), env);
  assert.equal(ok.code, 0);
  assert.equal(ok.out, "");
  assert.equal(hits.length, 1);
  assert.equal(hits[0].url, "/rest/v1/rpc/workstream_report");
  assert.equal(hits[0].body.p_token, "tok-123");
  assert.equal(hits[0].body.p_status, "waiting_input");
  assert.equal(hits[0].body.p_metadata.url, "https://claude.ai/code/session_01Q");
  srv.close();

  assert.equal((await runHook("not json", env)).code, 0);
  assert.equal((await runHook(JSON.stringify({ session_id: "x" }), { ...env, SUPABASE_URL: "http://127.0.0.1:1" })).code, 0);
  assert.equal((await runHook(JSON.stringify({ session_id: "x" }), { WORKSTREAM_ENV_FILE: "/nonexistent" })).code, 0);
});
