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

## Re-import from Excel (rare)

`scripts/import.py` is a placeholder. The 1,456 historicals are already loaded. If you ever add new rows to the spreadsheet, call the `public.bulk_load_sets(payload jsonb)` Postgres function — it's idempotent on `(exercise_id, performed_at, weight, reps)`, so re-running is safe.

## Rotate Supabase keys

Supabase dashboard → API → Rotate publishable key → update `.env.local` + Vercel env vars → redeploy. No client code change.

## Secrets

- `.env.local` holds `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publishable). Gitignored.
- Service-role key never leaves your laptop — not in this repo.
