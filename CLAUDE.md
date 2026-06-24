# CLAUDE.md — Gym Tracker

Personal phone-first gym-logging PWA for a single user (`charlie@theglassmarket.co`). Offline-first writes to IndexedDB, background sync to Supabase Postgres, Realtime push for multi-device.

## How to run

```
npm install
cp .env.example .env.local   # fill in URL + anon key
npm run dev                  # http://localhost:5173
npm run db:check             # prints sets row count, should be >= 1456
npm run build                # tsc + vite build
npm run test                 # unit (vitest)
npm run test:integration     # real Supabase round-trip; needs SUPABASE_TEST_ENV=1
```

## Stack

- Vite + React 18 + TypeScript + Tailwind + shadcn/ui
- Dexie (IndexedDB) — local store, every write hits this first
- `@supabase/supabase-js` — cloud store + auth (magic link) + Realtime
- `recharts` — history charts
- `vite-plugin-pwa` — installable PWA, service worker, iOS home-screen icons
- `vitest` — unit + integration tests
- Deploy: Vercel (`vercel.json` configures SPA rewrites + PWA headers)

## Data model (live; do not redefine)

Schema is owned by Supabase project `rgslyxzeyjiypzilpxpf`. Introspect, do not re-derive:

```
select * from information_schema.columns where table_schema='public';
```

Snapshot at project start (2026-05-18):

- `categories(id uuid pk, name text unique, sort_order int, created_at, updated_at, deleted_at)` — 4 rows: Back, Chest, Legs, Shoulder.
- `exercises(id uuid pk, name text, category_id → categories, is_archived bool, …)` — 26 rows. Unique on `(name, category_id)`.
- `sets(id uuid pk, exercise_id, category_id, weight numeric(7,2), reps int check >= 0, weight_unit text check in (lbs, kg) default 'lbs', performed_at date, target_weight numeric, target_reps int, notes text, volume numeric generated always as (weight * reps) stored, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — 1,456 rows, 2025-11-23 → 2026-04-29.
- `conflicts(id, table_name, row_id, local_row jsonb, remote_row jsonb, resolved_to text check in (local, remote), created_at)`.
- `share_trades(id uuid pk, ticker text, side text check in (buy, sell) default 'buy', quantity numeric(16,6) check > 0, price numeric(16,4) check >= 0, currency text check in (USD, GBP, EUR, AUD) default 'USD', traded_at date, target_price numeric(16,4), target_date date, notes text, links jsonb default '[]', images jsonb default '[]', models jsonb default '[]', is_opening boolean not null default false, total numeric generated always as (quantity * price) stored, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — share-trading log, one row per buy/sell decision. Same RLS / Realtime / offline-sync rules as `sets`. **Never write `total`** (Postgres maintains it from `quantity * price`). `is_opening` flags an existing holding recorded after the fact (an opening position you already owned, not a logged buy decision) — added via the "Add holding" flow (`/shares/add-holding`, `AddHolding` page, always `side='buy'` with no target). It rolls into `computePositions` like any buy but is hidden from the Shares trade log; the Stock page tags it "Opening". Trade images live in the private `share-images` Storage bucket; the row stores object paths in `images`, links are a `jsonb` array of URLs. `models` is a `jsonb` array of `{kind:'sheet'|'file', name, url, path}` (financial models attached at log time — a Google Sheet link, an uploaded spreadsheet, or a generated 3-statement workbook — see Model builder below); the Stock page aggregates them with upload date/time + user. Buys require `target_price` + `target_date`; the implied CAGR is derived client-side (`impliedCagr`) from `price`, target, and the horizon — not stored.
- `forecasts(id uuid pk, ticker text, base_price numeric(16,4), target_price numeric(16,4), target_date date, made_on date, currency text check in (USD,GBP,EUR,AUD) default 'USD', notes text, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — standalone price forecasts not tied to a buy/sell. Same sync rules. The Stock page's Forecasts section merges these with buy-derived targets; implied CAGR is derived from `base_price` → `target_price` over `made_on` → `target_date`. Adding a standalone forecast **derives `target_price` from a valuation multiple × metric** (P/E×EPS gives price directly; EV/EBITDA, EV/EBIT, EV/Sales give EV, bridged `− net debt ÷ shares`) — no free-typed target. The metric/net-debt can be pulled from the ticker's latest saved model for the target year; the derivation string is prepended to `notes`. Pure math lives in `model/valuation.ts`.
- `stocks(id uuid pk, ticker text, name text, notes text, links jsonb default '[]', documents jsonb default '[]', client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — per-ticker record holding the "general notes" / running thesis for a stock (one row per ticker, deduped client-side via `ensureStock`). `links` are `{url,addedAt,addedBy}` and `documents` are `{path,name,mediaType,addedAt,addedBy}` (provenance for the library); document blobs live in the `share-images` bucket. The Stock page's Research library lists these plus the links/images attached to that ticker's trades. Same sync rules. Surfaced at `/shares/stock/:ticker`.
- Research summaries: `POST /api/stock-summarize` (Vercel function) takes a prompt + document URLs (server-fetches SEC filings / annual reports) and/or uploaded PDFs/text, calls Claude (`claude-sonnet-4-6`), and returns a free-text summary. Output is pasted into stock or trade `notes` — nothing is persisted server-side. Auth gate + `ANTHROPIC_API_KEY` match the receipt scanner. Shared doc-loading lives in `api/_research.ts`.
- `french_attempts(id uuid pk, kind text check in (vocab, rules, conjug), total int check >= 0, correct int check (>= 0 and <= total), duration_ms int, details jsonb default '[]', started_at timestamptz, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — one row per completed French test (vocab, grammar-rules, or verb-conjugation). Same RLS / Realtime / offline-sync rules as `sets`. `details` is a `jsonb` array of `{questionId, prompt, correct}` per question so the stats view can surface most-missed items. The **study content is static client-side data, not a table**: `src/modules/french/data/` holds the top-2100 vocab list (`verbs.ts` = 200 most-common verbs + `words.ts` = 800 most-common non-verbs + `words2.ts` = ~1100 more words ranked ~801–1900, combined in `vocab.ts`; the Dashboard tracks vocab "mastery" — words answered correctly >90% over ≥3 showings — as a % of this 2100), `rules.ts` (multiple-choice grammar questions derived from the French Grammar Guide), and `conjugations.ts` (present-tense tables for the core auxiliaries + top irregulars — être, avoir, faire, aller, pouvoir, vouloir, devoir, venir, prendre, dire, voir). The French module (`/french`) generates a 10-question vocab, rules, or conjugation test (`quiz.ts`, pure + seeded-rng testable), scores it, and writes one `french_attempts` row; `stats.ts` aggregates accuracy/best/most-missed (the Dashboard's "French accuracy · last 8 weeks" chart plots weekly per-kind accuracy via `weeklyAccuracy`). Vocab tests take a `direction` (`fr2en`/`en2fr`/`mixed`, passed as `?dir=`). **Vocab word selection is spaced-repetition, not random**: `computeVocabSchedules` (in `stats.ts`) replays each word's showings from `french_attempts.details` into a Leitner box (correct answer → climb a box and widen the review gap via `REVIEW_INTERVALS_DAYS` = `[0,1,3,7,16,35]` days; any miss → box 0, due immediately), and `selectVocab` (`quiz.ts`) fills a test from due/overdue words first (most-lapsed = lowest box first), then brand-new words, then not-yet-due words, then mastered ones — so wrong answers resurface at the optimal frequency until they stick, while new words keep coming once the day's review backlog is clear. The home screen shows the live "due for review" count (`dueForReview`); rules and conjugation tests stay uniform-random. Conjugation tests cover the **present tense** and the **futur proche** ("going to …", derived at quiz time as aller-present + infinitive — not stored); question ids are `conjug:{infinitive}:{tense}:{person}`. `/french/rules` renders a static reference guide (`data/guide.ts`). `/french/chat` is a roleplay conversation partner: `POST /api/french-chat` sends a scenario + the conversation so far to Claude (`claude-sonnet-4-6`) and returns the next French line (beginner-level, with a short `✏️` correction when the learner slips); nothing is persisted server-side, same auth gate as the other AI endpoints.
- `reading_items(id uuid pk, url text not null, title text not null, description text, is_read boolean not null default false, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — a "read/listen later" queue: articles or podcasts saved by URL + title + free-text description. Same RLS / Realtime / offline-sync rules as `sets`. `is_read` flags an item done (toggled from the list). The Reading module (`/reading`, `src/modules/reading_list/`) lists items newest-first with unread above read; `/reading/add` saves a new item and `/reading/add/:id` edits or deletes one. No server-side enrichment — title/description are typed by hand.
- Model builder: `/shares/stock/:ticker/model` (`ModelBuilder` page). Revenue and one profit line are forecast **per business segment** (name, base revenue, growth, margin) and summed to a consolidated P&L. The profit line's **basis is chosen once for the whole model** — Gross Profit, EBIT, or EBITDA — since companies disclose different lines; everything below it (tax, D&A, capex, working capital, balance sheet) stays consolidated (D&A is always an input — it bridges EBITDA↔EBIT and is the cash-flow add-back). A deterministic client-side engine (`src/modules/shares/model/engine.ts`) builds a fully-linked 3-statement model (income statement / balance sheet / cash flow, equity is the opening plug so it always ties out) and renders a live preview. `model/excel.ts` exports a **live formula** `.xlsx` via `exceljs` (assumptions are editable input cells, statements are real formulas that recalc in Excel) — `exceljs` is dynamically imported so it only loads on generate. Download is offline; "Save to library" uploads the workbook to `share-images` (`models/` prefix) and appends it to the ticker's latest trade's `models[]`, stashing the model's `assumptions` + `createdAt` on that jsonb entry (additive fields) so the Stock page's **Company financial forecasts** section (`CompanyForecasts`) can rebuild revenue + the earnings ladder locally from the latest saved model — no workbook parsing, works offline. Optional **hybrid seeding**: `POST /api/model-assumptions` has Claude (`claude-sonnet-4-6`, structured `zodOutputFormat`) read filings and propose the driver assumptions — the engine, not the LLM, owns all arithmetic. The model needs a logged trade to attach to; with no trades, download still works.

Volume by category at start: Back 572 sets / 1,247,882 lb, Chest 444 / 495,291, Legs 314 / 818,284, Shoulder 126 / 80,668.

### Important schema rules

- **Never write to `volume`** — Postgres maintains it from `weight * reps`.
- **Always set `id` client-side** (uuid v4) so offline writes have a stable identity for sync.
- **Soft delete only** — set `deleted_at`, never `DELETE`. Filter `deleted_at is null` on read.
- **`updated_at` is the LWW clock** — set on every local mutation (client clock is fine; single user).
- **`user_id` defaults to `auth.uid()`** server-side. The 1,456 historicals have `user_id = NULL` and stay that way; RLS gates on JWT email, not user_id.

## Auth

Magic-link email, single user. RLS policy on every table:

```
((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
```

Session persists indefinitely (`persistSession: true`). Sign in once per device.

## Sync model

1. UI mutation → `db.sets.put(row)` with `sync_status='pending'`, `updated_at=now`. Returns instantly.
2. Outbox worker drains pending rows to Supabase whenever `navigator.onLine`. On success → `sync_status='synced'`. On failure → exponential backoff.
3. Realtime subscription on `sets`, `exercises`, `categories` upserts incoming rows into Dexie if `remote.updated_at > local.updated_at` (LWW). Otherwise insert into `conflicts` and keep local.
4. Soft deletes propagate via `deleted_at`.

## Project layout

```
.
├── CLAUDE.md             # this file
├── README.md             # human-facing run/back-up/rotate-keys docs
├── vercel.json           # SPA rewrites + PWA headers
├── .env.example          # template; .env.local is gitignored
├── scripts/
│   ├── check-db.ts       # `npm run db:check`
│   └── import.py         # placeholder for bulk_load_sets RPC (not run by default)
├── src/
│   ├── lib/              # supabase client, dexie schema, sync engine
│   ├── hooks/            # data hooks (useSets, useExercises, …)
│   ├── components/       # shadcn-derived primitives + app components
│   ├── routes/           # Today, AddSet, History, Dashboard
│   └── App.tsx
└── public/               # PWA icons, robots.txt (Disallow: /)
```

## Conventions

- Bullet points over prose, in docs and PR descriptions.
- No backwards-compat shims — single user, change forward.
- No comments unless the *why* is non-obvious.
- Phone-first: 44px+ touch targets, no software keyboard on the log-a-set flow, dark mode default.
- Stop and ask on data-model ambiguity. Never silently rename categories or columns.

## Secrets

- `.env.local` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable key — safe to ship in the client bundle).
- Service-role key never leaves the laptop; not in this repo.
- `.env.local` is in `.gitignore`. If a key leaks, rotate via Supabase dashboard.

## Deploy

Vercel. Build command `npm run build`, output `dist/`. `vercel.json` rewrites `/*` to `/index.html`. PWA service worker gets long-cache headers; `/index.html` and `/manifest.webmanifest` stay no-cache so updates ship.

URL is unlisted: `public/robots.txt` disallows all, no `sitemap.xml`. Magic-link auth gate is the real defense.

## Backup

```
pg_dump "postgresql://postgres:[PWD]@db.rgslyxzeyjiypzilpxpf.supabase.co:5432/postgres" \
  --schema=public --data-only --file=gym-backup-$(date +%F).sql
```

## Re-import from Excel (rare)

If the spreadsheet gains rows the app didn't generate, run `scripts/import.py` to call the `public.bulk_load_sets(payload jsonb)` RPC. Idempotent on `(exercise_id, performed_at, weight, reps)` — re-running with the same rows is safe.

## Rotating Supabase keys

Supabase dashboard → API → Rotate publishable key → update `.env.local` + Vercel env vars → redeploy. No client code change needed; the var name is stable.
