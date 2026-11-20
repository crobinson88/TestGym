# Session Sticky

A small always-on-top sticky note for your desktop that lists every Claude session you have going.

- Claude Code sessions from the terminal and from the desktop app's Code tab
- Web and Cowork chats you add to it

This is a standalone Electron app. It is **not part of the Gym Tracker PWA**: Vite doesn't import it, the root tsconfig/vitest don't cover it, and Vercel doesn't deploy it.

## What it shows

- **Header:** `N needs you · N running`. Click it to collapse the note to a one-line pill.
- **Rows**, sorted needs-you → running → stale → failed → done:
  - 🟠 amber = waiting for your input (permission prompt, question)
  - 🟢 pulsing green = running
  - grey = stale (no update for 30 min, probably a dead terminal)
  - dim = finished (hidden after 2 h)
- **Click a row:**
  - Claude Code session: copies a resume command to the clipboard (`cd '<dir>' && claude --resume <id>`, or the PowerShell form on Windows)
  - web chat: opens its link
- **× on a row:** dismisses it. Soft-deletes the `workstreams` row, the same as the Command Center does.
- **+ in the header:** adds a web or Cowork chat (title + optional link). Claude.ai has no public API for live chats, so these are added by hand.
- **Notifications:** a desktop notification fires when a session starts waiting on you.
- **Tray icon:** turns amber when anything needs you, and on macOS shows the count in the menu bar.
- **Tray menu:** Show/Hide, Refresh, Open at login, Quit.
- **Shortcut:** `Ctrl/⌘ + Alt + J` shows or hides the note from anywhere.
- **Placement:** stays above other windows and on every desktop/Space. Drag it by the header, resize from the edges. Position, size and collapsed state are remembered.

## Where the data comes from

1. **Supabase `workstreams` table:** the same rows the Workstream Command Center (`/workstreams`) shows. `scripts/workstream-hook.sh` writes them on every Claude Code SessionStart / Notification / Stop / SessionEnd.
2. **Local transcripts:** `~/.claude/projects/*/*.jsonl` changed in the last 2 h.
   - Sessions show up even without the hook or with no network.
   - The note can tell a session is working again after a Stop, which the hook alone can't (it has no prompt event).
   - Matched to the cloud row by session id.

Polled every 8 s. No sign-in: the note reads `~/.claude/workstream.env`.

**What reports where:**

| Sessions | How they reach the note |
| --- | --- |
| Claude Code on this computer (terminal or desktop-app Code tab) | Local transcripts straight away; live status once `npm run setup` wires the hook in |
| Claude Code in the cloud (claude.ai/code, the app) | The cloud environment's setup script installs the same hook (see below). Rows are tagged **cloud**, and clicking one opens that session on claude.ai |
| Cowork, regular claude.ai chats | No feed exists, so add them with **+** |

**Credentials:** the note and the hooks use a **workstream token**, not the Supabase service-role key.
- A token can only read and write `workstreams`, through the `workstream_*` database functions.
- Only its SHA-256 is stored, in `workstream_tokens`.
- Revoke one by setting `revoked_at` on its row.
- An older Mac setup that has `SUPABASE_SERVICE_ROLE_KEY` in the env file still works; when both are present, the token wins.

## Install (one time)

You need Node.js 18+ and git. Check with `node -v` and `git --version`.

### macOS (Terminal)

From the TestGym repo root:

```bash
cd desktop/session-sticky
```

```bash
npm install
```

```bash
npm run install-app
```

- `Session Sticky.app` goes into `/Applications`, or `~/Applications` if that isn't writable.
- Open it from Spotlight or Launchpad like any app.
- It's built on your own machine, so there's no "unidentified developer" prompt.

### Windows (PowerShell)

Run one line at a time; PowerShell 5.1 can't chain commands with `&&`.

If `node -v` fails, install Node, then close and reopen PowerShell:

```powershell
winget install OpenJS.NodeJS.LTS
```

Clone the repo. It's private, so a GitHub sign-in window pops up the first time:

```powershell
cd $HOME
git clone -b claude/upbeat-ritchie-r66r3k https://github.com/crobinson88/TestGym.git
```

Build and install:

```powershell
cd $HOME\TestGym\desktop\session-sticky
npm install
npm run install-app
```

- The one-click installer adds Start menu and desktop shortcuts, then launches the app.
- If `npm` says "running scripts is disabled on this system", use `npm.cmd` in place of `npm`, or allow local scripts once:

  ```powershell
  Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  ```

- Clicking a Claude Code row copies a PowerShell-ready command: `Set-Location -LiteralPath '<dir>'; claude --resume <id>`.
- The optional hook (`scripts/workstream-hook.sh`) is a bash script, so on Windows it needs Git Bash and `jq`. Without it the note still lists your Claude Code sessions from local transcripts.

### Linux

Same three commands as macOS. The AppImage is copied to `~/Applications`.

The installed app turns on **Open at login** the first time it runs, so after this you never launch it by hand. Untick it in the tray menu if you'd rather not. To update, run `git pull` in the repo, then `npm run install-app` again from this folder.

For hacking on it, `npm start` runs it straight from source. "Open at login" is greyed out in that mode, because it would start a bare Electron window rather than the note.

## Connect it (one time per computer, plus once for the cloud)

Run this from this folder:

```bash
npm run setup
```

It:
- puts a new workstream token in `~/.claude/workstream.env`. An existing one is kept; `npm run setup -- --force` replaces it.
- copies `hook/workstream-hook.mjs` to `~/.claude`.
- wires the hook into `~/.claude/settings.json` on SessionStart / Notification / Stop / SessionEnd. The file is backed up first and nothing is duplicated.
- writes and opens `~/.claude/session-sticky-cloud-setup.txt`.

Then:
1. **Switch the token on.** Send Claude the hash printed at the end. It's safe to share. Claude adds it to `workstream_tokens`; until then the footer says the token isn't switched on.
2. **Cloud sessions.** In the cloud environment's settings (environment menu in a session's title bar → Edit), follow STEP 2 of that file:
   - add `WORKSTREAM_TOKEN` as an environment variable
   - allow `rgslyxzeyjiypzilpxpf.supabase.co` under Network access
   - paste the setup script (`cloud/setup-script.sh`) into Setup script
3. **Restart the note** so it picks up the token: tray menu → Quit, then open Session Sticky.

The hook is plain Node, with no bash, `jq` or `curl`, so it runs on Windows too. It never blocks or fails a Claude turn: 4 s timeout, errors swallowed, always exits 0.

After changing `hook/`, run `npm run cloud-script` to regenerate `cloud/setup-script.sh`. A test fails if the two drift apart.

## Overrides (optional env vars)

| Var | Default |
| --- | --- |
| `WORKSTREAM_ENV_FILE` | `~/.claude/workstream.env` |
| `WORKSTREAM_TOKEN` | read from the env file |
| `SUPABASE_ANON_KEY` | the project's publishable anon key |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | read from the env file |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` |

## Files

- `main.js`: window, tray, shortcut, polling, notifications, IPC
- `preload.js`: the small `window.sticky` bridge (context isolation on, sandboxed renderer)
- `sources.js`: Supabase (token or service key) + transcript readers and the pure merge/sort/visibility logic
- `hook/workstream-hook.mjs`: the cross-platform Claude Code hook; `hook/install-hook.mjs` wires it into `settings.json`
- `scripts/setup.js`: `npm run setup`; `scripts/cloud-script.js` generates `cloud/setup-script.sh`
- `icon.js`: draws the tray dot and the app icon at runtime, so the repo has no binary assets
- `scripts/install-app.js`: `npm run install-app` (build → install → launch for this OS); `scripts/make-icon.js` writes `build/icon.png` for the packager
- `renderer/`: the note UI (vanilla JS, no build step)
- `test/`: `npm test` (`node:test`, no extra deps): data layer, hook, installer, setup and the generated cloud script
