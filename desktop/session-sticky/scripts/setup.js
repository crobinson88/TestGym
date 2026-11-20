"use strict";

// npm run setup — one-time wiring on a computer that runs the sticky note:
//   1. a workstream token in ~/.claude/workstream.env (reused if one is there;
//      --force makes a new one)
//   2. the cross-platform hook copied to ~/.claude and wired into Claude Code's
//      settings, so sessions on this computer report their status
//   3. ~/.claude/session-sticky-cloud-setup.txt with what to paste into the
//      cloud environment, plus the token's hash to register in Supabase
// The token never leaves this computer except where you paste it yourself.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { currentCloudScript } = require("./cloud-script");

const ROOT = path.join(__dirname, "..");
const SUPABASE_URL = "https://rgslyxzeyjiypzilpxpf.supabase.co";
const SUPABASE_HOST = new URL(SUPABASE_URL).host;

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

function readVar(text, key) {
  const m = String(text).match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*['"]?([^'"\\s#]+)`, "m"));
  return m ? m[1] : null;
}

// Adds what's missing, keeps everything else (a Mac's service key included).
function upsertEnv(text, { url, token, force }) {
  let out = String(text || "");
  if (out && !out.endsWith("\n")) out += "\n";
  if (!readVar(out, "SUPABASE_URL")) out += `SUPABASE_URL=${url}\n`;
  const existing = readVar(out, "WORKSTREAM_TOKEN");
  if (existing && force) {
    out = out.replace(/^\s*(?:export\s+)?WORKSTREAM_TOKEN\s*=.*$/m, `WORKSTREAM_TOKEN=${token}`);
  } else if (!existing) {
    out += `WORKSTREAM_TOKEN=${token}\n`;
  }
  return out;
}

function cloudSetupText({ token, hash, script }) {
  return [
    "SESSION STICKY - CLOUD SETUP",
    "============================",
    "This file holds your workstream token. Keep it private; it only lives on this computer.",
    "",
    "STEP 1 - Send Claude this hash so it can switch the token on.",
    "         (Safe to share: it can't be turned back into the token.)",
    "",
    `    ${hash}`,
    "",
    "STEP 2 - In the cloud environment's settings",
    "         (the environment menu in a session's title bar, then Edit):",
    "",
    "  a) Environment variables - add this line:",
    "",
    `    WORKSTREAM_TOKEN=${token}`,
    "",
    "  b) Network access - add this under Allowed domains:",
    "",
    `    ${SUPABASE_HOST}`,
    "",
    "  c) Setup script - paste everything between the two scissor lines,",
    "     after anything that's already in the box:",
    "",
    "----- 8< ----------------------------------------------------------",
    script.trimEnd(),
    "----- 8< ----------------------------------------------------------",
    "",
    "STEP 3 - Start a new cloud session. It shows up on the note within ~10 seconds.",
    "",
  ].join(os.EOL);
}

function openFile(file) {
  const [cmd, args] =
    process.platform === "win32" ? ["notepad.exe", [file]] : process.platform === "darwin" ? ["open", ["-e", file]] : ["xdg-open", [file]];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  } catch {
    // Printing the path below is enough.
  }
}

function main() {
  const force = process.argv.includes("--force");
  const claudeDir = path.join(os.homedir(), ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });

  const envFile = process.env.WORKSTREAM_ENV_FILE || path.join(claudeDir, "workstream.env");
  const before = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
  const after = upsertEnv(before, { url: SUPABASE_URL, token: newToken(), force });
  if (after !== before) fs.writeFileSync(envFile, after, { mode: 0o600 });
  const token = readVar(after, "WORKSTREAM_TOKEN");
  const hash = tokenHash(token);
  console.log(`✓ Token in ${envFile}${readVar(before, "WORKSTREAM_TOKEN") && !force ? " (kept the existing one)" : ""}`);

  const hookPath = path.join(claudeDir, "workstream-hook.mjs");
  fs.copyFileSync(path.join(ROOT, "hook", "workstream-hook.mjs"), hookPath);
  execFileSync(process.execPath, [path.join(ROOT, "hook", "install-hook.mjs"), hookPath], { stdio: "inherit" });
  console.log(`✓ Hook installed: ${hookPath}`);

  const txt = path.join(claudeDir, "session-sticky-cloud-setup.txt");
  fs.writeFileSync(txt, cloudSetupText({ token, hash, script: currentCloudScript() }), { mode: 0o600 });
  openFile(txt);

  console.log(`✓ Cloud steps: ${txt}`);
  console.log("\nNext:");
  console.log("  1. Send Claude this hash (safe to share):");
  console.log(`       ${hash}`);
  console.log("  2. Follow STEP 2 in the file that just opened.");
  console.log("  3. Restart the note (tray menu → Quit, then open Session Sticky) so it picks up the token.");
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`\n✗ ${err.message}`);
    process.exit(1);
  }
}

module.exports = { upsertEnv, readVar, tokenHash, newToken, cloudSetupText };
