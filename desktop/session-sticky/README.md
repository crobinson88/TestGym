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

Polled every 8 s. No sign-in: the note reads the hook's own config file, `~/.claude/workstream.env`. The service-role key never leaves the laptop, the same as with the hook.

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

Optional: install the hook (see the header of `scripts/workstream-hook.sh`; it creates `~/.claude/workstream.env`) to get web chats and "needs you" alerts. Without it the note runs local-only and the footer says so.

## Overrides (optional env vars)

| Var | Default |
| --- | --- |
| `WORKSTREAM_ENV_FILE` | `~/.claude/workstream.env` |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | read from the env file |
| `CLAUDE_PROJECTS_DIR` | `~/.claude/projects` |

## Files

- `main.js`: window, tray, shortcut, polling, notifications, IPC
- `preload.js`: the small `window.sticky` bridge (context isolation on, sandboxed renderer)
- `sources.js`: Supabase + transcript readers and the pure merge/sort/visibility logic
- `icon.js`: draws the tray dot and the app icon at runtime, so the repo has no binary assets
- `scripts/install-app.js`: `npm run install-app` (build → install → launch for this OS); `scripts/make-icon.js` writes `build/icon.png` for the packager
- `renderer/`: the note UI (vanilla JS, no build step)
- `test/sources.js`: `npm test` (`node:test`, no extra deps)
