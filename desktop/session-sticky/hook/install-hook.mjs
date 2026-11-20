#!/usr/bin/env node
// Wires workstream-hook.mjs into Claude Code's user settings
// (~/.claude/settings.json) on SessionStart / Notification / Stop / SessionEnd.
//
//   node install-hook.mjs [path/to/workstream-hook.mjs]
//
// Idempotent: entries pointing at a workstream-hook.mjs are replaced, never
// duplicated, and everything else in the file is left alone. The file is
// backed up before it changes, and a file that isn't valid JSON is never
// overwritten. Shared by `npm run setup` (your computers) and the cloud
// environment setup script.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const HOOK_EVENTS = ["SessionStart", "Notification", "Stop", "SessionEnd"];
const MARKER = "workstream-hook.mjs";

// Forward slashes work in cmd, PowerShell and Git Bash alike, which is what
// Claude Code on Windows may run the command through.
export function hookCommand(hookPath) {
  return `node "${String(hookPath).replace(/\\/g, "/")}"`;
}

function isOurs(group) {
  return Array.isArray(group && group.hooks) && group.hooks.some((h) => h && typeof h.command === "string" && h.command.includes(MARKER));
}

export function mergeHooks(settings, command) {
  const next = { ...(settings || {}) };
  const hooks = { ...(next.hooks || {}) };
  for (const event of HOOK_EVENTS) {
    const kept = (Array.isArray(hooks[event]) ? hooks[event] : []).filter((g) => !isOurs(g));
    hooks[event] = [...kept, { hooks: [{ type: "command", command, timeout: 10 }] }];
  }
  next.hooks = hooks;
  return next;
}

export function installHook({ hookPath, settingsPath, now = new Date() }) {
  let current = {};
  let raw = null;
  if (existsSync(settingsPath)) {
    raw = readFileSync(settingsPath, "utf8");
    try {
      current = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      throw new Error(`${settingsPath} isn't valid JSON — fix it by hand, nothing was changed.`);
    }
  }
  const next = mergeHooks(current, hookCommand(hookPath));
  const text = `${JSON.stringify(next, null, 2)}\n`;
  if (raw === text) return { changed: false, backup: null };
  let backup = null;
  if (raw !== null) {
    backup = `${settingsPath}.bak-${now.toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(settingsPath, backup);
  }
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, text);
  return { changed: true, backup };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const claudeDir = join(homedir(), ".claude");
  const hookPath = resolve(process.argv[2] || join(claudeDir, "workstream-hook.mjs"));
  const settingsPath = process.env.CLAUDE_SETTINGS_FILE || join(claudeDir, "settings.json");
  try {
    const { changed, backup } = installHook({ hookPath, settingsPath });
    console.log(changed ? `Hook wired into ${settingsPath}${backup ? ` (backup: ${backup})` : ""}` : "Hook already wired in.");
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
