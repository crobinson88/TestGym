"use strict";

// One command: build Session Sticky for this machine, install it, launch it.
//   macOS   → copies "Session Sticky.app" into /Applications (~/Applications
//             if that isn't writable) and opens it.
//   Windows → runs the one-click installer (Start menu + desktop shortcut),
//             which launches the app when it finishes.
//   Linux   → copies the AppImage to ~/Applications and starts it.
// Built locally, so macOS doesn't quarantine it — no "unidentified developer"
// prompt, no code-signing account needed.

const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const APP = "Session Sticky";

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32", ...opts });
}

function findAll(dir, test, depth = 2) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (test(entry)) out.push(full);
    else if (entry.isDirectory() && depth > 0 && !entry.name.endsWith(".app")) out.push(...findAll(full, test, depth - 1));
  }
  return out;
}

function newest(paths) {
  return paths.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function writable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  run("npm", ["run", "dist"]);
}

function installMac() {
  const built = newest(findAll(DIST, (e) => e.isDirectory() && e.name === `${APP}.app`));
  if (!built) throw new Error("Build finished but no .app was found in dist/.");
  try {
    execFileSync("osascript", ["-e", `quit app "${APP}"`], { stdio: "ignore" });
  } catch {
    // Not running.
  }
  const targetDir = writable("/Applications") ? "/Applications" : path.join(os.homedir(), "Applications");
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, `${APP}.app`);
  fs.rmSync(target, { recursive: true, force: true });
  run("ditto", [built, target]);
  run("open", [target]);
  return target;
}

function installWindows() {
  const installer = newest(findAll(DIST, (e) => e.isFile() && /setup.*\.exe$/i.test(e.name), 0));
  if (!installer) throw new Error("Build finished but no installer .exe was found in dist/.");
  spawn(installer, [], { detached: true, stdio: "ignore" }).unref();
  return "Start menu → Session Sticky";
}

function installLinux() {
  const image = newest(findAll(DIST, (e) => e.isFile() && e.name.endsWith(".AppImage"), 0));
  if (!image) throw new Error("Build finished but no AppImage was found in dist/.");
  const dir = path.join(os.homedir(), "Applications");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, "Session-Sticky.AppImage");
  fs.copyFileSync(image, target);
  fs.chmodSync(target, 0o755);
  spawn(target, [], { detached: true, stdio: "ignore" }).unref();
  return target;
}

function main() {
  console.log("Building Session Sticky for this computer…");
  build();
  const where =
    process.platform === "darwin" ? installMac() : process.platform === "win32" ? installWindows() : installLinux();
  console.log(`\n✓ Installed: ${where}`);
  console.log("  It's running now and starts by itself at login (untick in the tray menu).");
  console.log("  Show / hide any time: Ctrl/Cmd + Alt + J");
}

try {
  main();
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exit(1);
}
