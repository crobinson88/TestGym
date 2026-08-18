# Gym Tracker

Personal phone-first gym-logging PWA for `charlie@theglassmarket.co`. Offline-first writes to IndexedDB, background sync to Supabase, Realtime push for multi-device.

See `CLAUDE.md` for architecture and schema details.

## Run

```bash
npm install
cp .env.example .env.local       # already has the right URL + publishable key
npm run dev                      # http://localhost:5173

npm run db:check                 # prints sets/exercises/categories counts (sets >= 1456)
npm run build                    # tsc + vite build → dist/
npm run preview                  # serve dist/ locally

npm run test                     # unit tests (vitest)
npm run test:integration         # real Supabase round-trip; see below
```

## Integration tests

`npm run test:integration` exercises the real Supabase + Postgres triggers + Realtime against `rgslyxzeyjiypzilpxpf`. They:

- require `SUPABASE_TEST_ENV=1` (set by the script) AND `SUPABASE_SERVICE_ROLE_KEY` (you supply, in `.env.local`)
- skip cleanly if `SUPABASE_SERVICE_ROLE_KEY` isn't set
- tag every row they create with a unique `__test__<uuid>__` marker in `notes` and delete those rows in `afterAll`

To run them, add a temporary line to `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=...   # from Supabase dashboard → API → service_role key
```

Then load env and run:

```bash
set -a && source .env.local && set +a && npm run test:integration
```

## Supabase auth redirect URLs

Magic-link emails redirect to the URL the link was generated from. For the link to land back in the app instead of Supabase's default page, add the URLs to **Supabase dashboard → Authentication → URL Configuration → Redirect URLs**:

- `http://localhost:5173`
- `https://<your-vercel-domain>`

Site URL can be either; redirect URLs is the allow-list.

## Deploy (Vercel)

`vercel.json` is configured. First time:

```bash
npx vercel --prod
```

Set env vars in the Vercel dashboard (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) — values are the same as `.env.local`. The publishable key is safe to ship in the client bundle.

The site is unlisted (`robots.txt: Disallow: /`, no sitemap). The magic-link auth gate is the real defense.

## Install on iPhone

1. Open the Vercel URL in **Safari** (not Chrome — iOS only supports PWA install from Safari)
2. Tap the Share button → **Add to Home Screen**
3. The app icon appears on the home screen; tap to open in full-screen, no Safari chrome

Sign in once via magic link; session persists indefinitely.

## Icons

The PWA icons (`public/icon-{192,512,512-maskable}.png`, `apple-touch-icon.png`, `favicon-32.png`) are generated from `public/icon.svg`.

```bash
npm run icons    # regenerate after editing icon.svg
```

Uses `@resvg/resvg-js` (a Rust/WASM SVG renderer). Commit the regenerated PNGs.

## Export to CSV

The Stats tab has an "Export all sets to CSV" button. The file is `gym-export-YYYY-MM-DD.csv` with one row per live (non-deleted) set:

```
id,exercise,category,weight,reps,weight_unit,performed_at,target_weight,target_reps,notes,volume,created_at,updated_at
```

Open it in Excel/Numbers; commas inside fields are quoted per RFC 4180.

## Backup

```bash
pg_dump "postgresql://postgres:[PWD]@db.rgslyxzeyjiypzilpxpf.supabase.co:5432/postgres" \
  --schema=public --data-only \
  --file=gym-backup-$(date +%F).sql
```

Get `[PWD]` from Supabase dashboard → Project Settings → Database → Connection string.

## Workstream Command Center (desktop)

A live table of every Claude workstream — CLI sessions, web/Cowork chats, and
actionable email — at `/workstreams`. The **Command Center** button appears in
the app header on desktop only (≥1024px with a mouse); on a phone the route
shows a "desktop-only" notice instead.

Rows push in over Supabase Realtime — no polling, no reload.

### 1. Feed it your CLI sessions

```
cp scripts/workstream-hook.sh ~/.claude/workstream-hook.sh
chmod +x ~/.claude/workstream-hook.sh
printf 'SUPABASE_URL=https://rgslyxzeyjiypzilpxpf.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=<service key>\n' > ~/.claude/workstream.env
chmod 600 ~/.claude/workstream.env
```

Then in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "~/.claude/workstream-hook.sh" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "~/.claude/workstream-hook.sh" }] }],
    "Stop":         [{ "hooks": [{ "type": "command", "command": "~/.claude/workstream-hook.sh" }] }],
    "SessionEnd":   [{ "hooks": [{ "type": "command", "command": "~/.claude/workstream-hook.sh" }] }]
  }
}
```

The hook posts to the `workstream_upsert` RPC in a detached subshell and always
exits 0 — a Supabase outage or missing config can never block or fail a CLI
turn. It needs `curl` and `jq`; without either it exits silently.

Status mapping: `SessionStart` → running, `Notification` → **waiting on you**,
`Stop`/`SessionEnd` → done. Repeat fires for one session update the same row
(deduped on the terminal session id), so the board shows one line per terminal,
not one per turn. A session killed without a Stop is greyed out as *stale* after
30 minutes.

### Naming a workstream

Click any row's title to type your own name for it — "Fixing the food pie chart"
reads better than `gym-tracker (claude/food-pie)` when five terminals are open.

Your name is stored in `metadata.label`, never over `title`. The CLI hook
rewrites `title` from repo + branch on every turn, so a row that overwrote the
title would lose your name on the next fire; the upsert RPC merges metadata
rather than replacing it, so the label survives. Both are shown — your name
leads, the system title and branch sit underneath. Clear the field to go back to
the system name.

Search matches either one.

### 2. Email triage (optional)

The **Triage email** button pulls recent unread Gmail, has Claude
(`claude-sonnet-4-6`) pick out what genuinely needs you to act, and logs one row
per thread. Re-triaging is safe — rows dedup on the Gmail thread id.

It reuses the Google service account already delegated for calendar sync, so
there are no new credentials. You do need to authorise the extra scope once, in
Workspace admin → Security → API controls → Domain-wide delegation → the
existing client id → add:

```
https://www.googleapis.com/auth/gmail.readonly
```

Read-only: nothing is ever marked read, replied to, or moved. Until the scope is
added the button returns `unauthorized_client` and everything else keeps working.

It runs on demand rather than on a cron because Vercel Hobby crons only fire once
a day, which is useless for a live board.

### 3. Web/Cowork chats

There's no public webhook for Claude web or Cowork sessions, so those rows are
added by hand with **+ Web session** (optionally with the claude.ai link) and
their status is edited from the table.

## Re-import from Excel (rare)

`scripts/import.py` is a placeholder. The 1,456 historicals are already loaded. If you ever add new rows to the spreadsheet, call the `public.bulk_load_sets(payload jsonb)` Postgres function — it's idempotent on `(exercise_id, performed_at, weight, reps)`, so re-running is safe.

## Rotate Supabase keys

Supabase dashboard → API → Rotate publishable key → update `.env.local` + Vercel env vars → redeploy. No client code change.

## Secrets

- `.env.local` holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publishable). Gitignored.
- Service-role key never leaves your laptop — not in this repo.
