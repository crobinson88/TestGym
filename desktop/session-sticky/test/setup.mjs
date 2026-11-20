import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { hookCommand, installHook, mergeHooks, HOOK_EVENTS } from "../hook/install-hook.mjs";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { upsertEnv, readVar, tokenHash, newToken, cloudSetupText } = require("../scripts/setup.js");
const { currentCloudScript, OUT } = require("../scripts/cloud-script.js");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sticky-setup-"));

test("hookCommand uses forward slashes so any Windows shell runs it", () => {
  assert.equal(hookCommand("C:\\Users\\carob\\.claude\\workstream-hook.mjs"), 'node "C:/Users/carob/.claude/workstream-hook.mjs"');
});

test("mergeHooks adds all four events, keeps other hooks, never duplicates", () => {
  const start = {
    model: "x",
    hooks: {
      Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
      SessionStart: [{ hooks: [{ type: "command", command: 'node "/old/workstream-hook.mjs"' }] }],
    },
  };
  const once = mergeHooks(start, 'node "/new/workstream-hook.mjs"');
  const twice = mergeHooks(once, 'node "/new/workstream-hook.mjs"');
  assert.deepEqual(twice, once);
  assert.equal(once.model, "x");
  for (const e of HOOK_EVENTS) {
    const ours = once.hooks[e].filter((g) => g.hooks[0].command.includes("workstream-hook.mjs"));
    assert.equal(ours.length, 1, e);
    assert.equal(ours[0].hooks[0].command, 'node "/new/workstream-hook.mjs"');
  }
  assert.equal(once.hooks.Stop[0].hooks[0].command, "say done");
});

test("installHook backs up, is idempotent, and refuses broken JSON", () => {
  const dir = tmp();
  const settings = path.join(dir, "settings.json");
  assert.equal(installHook({ hookPath: "/h/workstream-hook.mjs", settingsPath: settings }).backup, null);
  assert.deepEqual(installHook({ hookPath: "/h/workstream-hook.mjs", settingsPath: settings }), { changed: false, backup: null });
  fs.writeFileSync(settings, JSON.stringify({ theme: "dark" }));
  const r = installHook({ hookPath: "/h/workstream-hook.mjs", settingsPath: settings });
  assert.ok(r.backup && fs.existsSync(r.backup));
  assert.equal(JSON.parse(fs.readFileSync(settings, "utf8")).theme, "dark");
  fs.writeFileSync(settings, "{ not json");
  assert.throws(() => installHook({ hookPath: "/h/workstream-hook.mjs", settingsPath: settings }), /isn't valid JSON/);
  assert.equal(fs.readFileSync(settings, "utf8"), "{ not json");
});

test("upsertEnv adds the token, keeps a Mac's service key, reuses unless forced", () => {
  const mac = "SUPABASE_URL=https://x.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=svc";
  const a = upsertEnv(mac, { url: "https://y", token: "t1" });
  assert.equal(readVar(a, "SUPABASE_SERVICE_ROLE_KEY"), "svc");
  assert.equal(readVar(a, "SUPABASE_URL"), "https://x.supabase.co");
  assert.equal(readVar(a, "WORKSTREAM_TOKEN"), "t1");
  assert.equal(upsertEnv(a, { url: "https://y", token: "t2" }), a);
  const forced = upsertEnv(a, { url: "https://y", token: "t2", force: true });
  assert.equal(readVar(forced, "WORKSTREAM_TOKEN"), "t2");
  assert.equal(forced.match(/WORKSTREAM_TOKEN/g).length, 1);
  assert.equal(readVar(upsertEnv("", { url: "https://y", token: "t3" }), "SUPABASE_URL"), "https://y");
});

test("tokens are long enough for the database gate and hash to its format", () => {
  const t = newToken();
  assert.ok(t.length >= 32 && t.length <= 200);
  assert.match(tokenHash(t), /^[0-9a-f]{64}$/);
  assert.equal(tokenHash("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("cloud setup text carries the hash, token, host and script", () => {
  const txt = cloudSetupText({ token: "TOK", hash: "HASH", script: "#!/bin/bash\necho hi\n" });
  for (const s of ["HASH", "WORKSTREAM_TOKEN=TOK", "rgslyxzeyjiypzilpxpf.supabase.co", "echo hi"]) assert.ok(txt.includes(s), s);
});

test("committed cloud/setup-script.sh matches the hook source (run npm run cloud-script)", () => {
  assert.equal(fs.readFileSync(OUT, "utf8"), currentCloudScript());
});

test("the cloud setup script installs a working hook into a fresh HOME", () => {
  const home = tmp();
  fs.mkdirSync(path.join(home, ".claude"));
  fs.writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify({ permissions: { allow: ["Bash"] } }));
  execFileSync("bash", [path.join(ROOT, "cloud", "setup-script.sh")], { env: { PATH: process.env.PATH, HOME: home }, stdio: "pipe" });
  const hook = path.join(home, ".claude", "workstream-hook.mjs");
  assert.equal(fs.readFileSync(hook, "utf8"), fs.readFileSync(path.join(ROOT, "hook", "workstream-hook.mjs"), "utf8"));
  const settings = JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8"));
  assert.deepEqual(settings.permissions, { allow: ["Bash"] });
  assert.equal(settings.hooks.Notification[0].hooks[0].command, `node "${hook}"`);
  // Running it again (a re-provisioned container) changes nothing.
  execFileSync("bash", [path.join(ROOT, "cloud", "setup-script.sh")], { env: { PATH: process.env.PATH, HOME: home }, stdio: "pipe" });
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8")).hooks.Stop.length, 1);
});
