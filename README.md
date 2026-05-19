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
npm run test:integration         # real Supabase round-trip; gated on SUPABASE_TEST_ENV
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
