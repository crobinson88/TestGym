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
  - Claude Code session: copies `cd '<dir>' && claude --resume <session-id>` to the clipboard
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

## Setup

1. Install the hook if you haven't. See the header of `scripts/workstream-hook.sh`; it creates `~/.claude/workstream.env`.
2. Run it:

   ```bash
   cd desktop/session-sticky
   npm install
   npm start
   ```

3. Tick **Open at login** in the tray menu to have it start with your computer.

Without `workstream.env` the note runs local-only: it still shows your Claude Code sessions, but not web chats or hook statuses. The footer says which mode it's in.

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
- `icon.js`: draws the tray dot at runtime, so the repo has no binary assets
- `renderer/`: the note UI (vanilla JS, no build step)
- `test/sources.js`: `npm test` (`node:test`, no extra deps)
