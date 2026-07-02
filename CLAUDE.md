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
- `stocks(id uuid pk, ticker text, name text, notes text, links jsonb default '[]', documents jsonb default '[]', client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — per-ticker record holding the "general notes" / running thesis for a stock (one row per ticker, deduped client-side via `ensureStock`). `links` are `{url,addedAt,addedBy}` and `documents` are `{path,name,mediaType,addedAt,addedBy}` (provenance for the library); document blobs live in the `share-images` bucket. The Stock page's Research library lists these plus the links/images attached to that ticker's trades. Same sync rules. Surfaced at `/shares/stock/:ticker`. **PDF annotation**: research-library PDFs (and remote IR filings) can be opened in an in-app annotator (`/shares/stock/:ticker/annotate`, `AnnotateDoc` page + `annotate/` folder) to drag highlights and drop numbered comments. Annotations are additive fields on the `documents` jsonb entry: `annotations` (re-editable overlay of `{id,page,type:'highlight'|'comment',rect|x/y,color,text,…}`, coords normalised [0..1] top-left), `flatPath` (a flattened copy with the marks burned in, uploaded under `docs/`), and `annotatedFrom` (`ir:<url>` or the source doc path). `path` always stays the **clean base PDF** — re-editing re-flattens from base, never the flat copy, so marks stay non-destructive. Rendering uses `pdfjs-dist`; the flattened export uses `pdf-lib` (both dynamically imported, like exceljs). Pure coord math + tests live in `annotate/geometry.ts`. Remote IR filings can't be fetched in-browser (SEC/FMP block CORS + require a User-Agent), so `POST /api/doc-proxy` (auth-gated like the other endpoints) streams the bytes: PDFs pass straight through, while **HTML filings are reflowed into a PDF server-side** (`api/_htmlpdf.ts` — strips markup to paragraph-preserving text, lays it out with `pdf-lib`; tables/images/exact layout are lost but the prose is annotatable) so the annotator opens them too. Other content types are rejected.
- Research summaries: `POST /api/stock-summarize` (Vercel function) takes a prompt + document URLs (server-fetches SEC filings / annual reports) and/or uploaded PDFs/text, calls Claude (`claude-sonnet-4-6`), and returns a free-text summary. Output is pasted into stock or trade `notes` — nothing is persisted server-side. Auth gate + `ANTHROPIC_API_KEY` match the receipt scanner. Shared doc-loading lives in `api/_research.ts`.
- `french_attempts(id uuid pk, kind text check in (vocab, rules, conjug, listening), total int check >= 0, correct int check (>= 0 and <= total), duration_ms int, details jsonb default '[]', started_at timestamptz, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — one row per completed French test (vocab, grammar-rules, verb-conjugation, or listening). Same RLS / Realtime / offline-sync rules as `sets`. `details` is a `jsonb` array of `{questionId, prompt, correct}` per question so the stats view can surface most-missed items. The **study content is static client-side data, not a table**: `src/modules/french/data/` holds the top-2100 vocab list (`verbs.ts` = 200 most-common verbs + `words.ts` = 800 most-common non-verbs + `words2.ts` = ~1100 more words ranked ~801–1900, combined in `vocab.ts`; the Dashboard tracks vocab "mastery" — words answered correctly >90% over ≥3 showings — as a % of this 2100), `rules.ts` (multiple-choice grammar questions derived from the French Grammar Guide), and `conjugations.ts` (present-tense tables for the core auxiliaries + top irregulars — être, avoir, faire, aller, pouvoir, vouloir, devoir, venir, prendre, dire, voir). The French module (`/french`) generates a 10-question vocab, rules, or conjugation test (`quiz.ts`, pure + seeded-rng testable), scores it, and writes one `french_attempts` row; `stats.ts` aggregates accuracy/best/most-missed (the Dashboard's "French accuracy · last 8 weeks" chart plots weekly per-kind accuracy via `weeklyAccuracy`). Vocab tests take a `direction` (`fr2en`/`en2fr`/`mixed`, passed as `?dir=`). **Vocab word selection is spaced-repetition, not random**: `computeVocabSchedules` (in `stats.ts`) replays each word's showings from `french_attempts.details` into a Leitner box (correct answer → climb a box and widen the review gap via `REVIEW_INTERVALS_DAYS` = `[0,1,3,7,16,35]` days; any miss → box 0, due immediately), and `selectVocab` (`quiz.ts`) builds each test by **mixing reviews with new words**: it reserves a share of the test (`NEW_WORD_RATIO` = 0.3) for brand-new words and gives the rest to due/overdue reviews (most-lapsed = lowest box first, and within a box the most-recently-missed word leads — so a word you just got wrong jumps to the top of the queue and is retested in the very next test), then tops up any remaining slots with leftover reviews, not-yet-due words, and finally mastered ones — so wrong answers resurface at the optimal frequency until they stick, while new vocabulary keeps coming every session even when the review backlog could fill the whole test on its own (the reservation collapses to all-reviews only when there are no new words left to learn). The home screen shows the live "due for review" count (`dueForReview`); rules and conjugation tests stay uniform-random. The **listening test** (`kind='listening'`, question ids `listen:{fr}`) speaks each French word (or short phrase) via the Web Speech API (`speech.ts`, `fr-FR`; nothing is pre-recorded) and the learner reproduces what they heard by tapping words out of a shuffled **word bank** — the spoken words mixed with `LISTENING_ORDER_DISTRACTORS` (4) decoys — placing them in the order heard, so it grades on picking the right words **and** ordering them (`Question.sequence` = the spoken words in order; `checkOrder` grades the built list; `answer` is unused for these). The prompt text stays hidden until answered (`Question.audioText` drives the audio UI in `TestRunner`). Length (`?n=`, includes a single-word ear check), **words per round** (`?words=` → 1–4, `LISTENING_WORDS_PER_ROUND`/`clampWordsPerRound`), and playback speed (`?speed=` → normal/slow/very-slow, `LISTENING_SPEEDS`/`speedRate`) are chosen on the home screen. Word selection reuses `selectVocab`, but over the listening test's **own** Leitner schedule (`computeListeningSchedules`, kept independent of vocab so hearing and reading build separate review queues); it has its own stat card, recent-test entries, and accuracy line. With `words=1` each round speaks one word (`listen:{fr}`, the canonical per-word SR drill — the bank is that word plus decoys and the "order" is trivially one word). With `words>1` each round strings that many words into a spoken phrase and the learner rebuilds the phrase word-by-word in order from the bank (`makeListeningOrderingQuestion` builds both cases); these multi-word rounds carry a `phrase:{…}` id prefix so — since `listenKeyFromQuestionId` only recognises `listen:` ids — they stay out of the per-word schedule (connected-speech comprehension practice, not the per-word drill). Conjugation tests cover the **present tense** and the **futur proche** ("going to …", derived at quiz time as aller-present + infinitive — not stored); question ids are `conjug:{infinitive}:{tense}:{person}`. `/french/rules` renders a static reference guide (`data/guide.ts`). `/french/chat` is a roleplay conversation partner: `POST /api/french-chat` sends a scenario + the conversation so far to Claude (`claude-sonnet-4-6`) and returns the next French line (beginner-level, with a short `✏️` correction when the learner slips); nothing is persisted server-side, same auth gate as the other AI endpoints.
- `reading_items(id uuid pk, url text not null, title text not null, description text, is_read boolean not null default false, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — a "read/listen later" queue: articles or podcasts saved by URL + title + free-text description. Same RLS / Realtime / offline-sync rules as `sets`. `is_read` flags an item done (toggled from the list). The Reading module (`/reading`, `src/modules/reading_list/`) lists items newest-first with unread above read; `/reading/add` saves a new item and `/reading/add/:id` edits or deletes one. No server-side enrichment — title/description are typed by hand.
- `tips(id uuid pk, ticker text not null, tipped_by text not null, note text, status text check in (watching, dismissed) default 'watching', received_at date not null default current_date, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — the Shares "Tip list": stocks friends flagged to watch, one row per ticker tip. Same RLS / Realtime / offline-sync rules as `sets`. `tipped_by` is a free-text friend name (no friend accounts — single-user app), `note` is the free-text reason/reaction, `status` toggles watching↔dismissed from the list (dismissed tips sink to the bottom). Lives inside the Shares module (`src/modules/shares/`, hooks `useTips`/`useTip`): `/shares/tips` lists tips (watching above dismissed, newest `received_at` first) with a live "watching" count surfaced on the Shares index; `/shares/tips/add` adds one and `/shares/tips/add/:id` edits or deletes. No link-out to the Stock page and no server-side enrichment — fields are typed by hand.
- `market_notes(id uuid pk, indices jsonb not null default '[]', body text not null, noted_at date not null default current_date, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — the Shares "Markets" section: free-text notes on the markets, each tagged with one or more market indices. Same RLS / Realtime / offline-sync rules as `sets`. `indices` is a `jsonb` array of stable index **keys** (`sp500` → S&P 500, `asx200` → ASX 200, `nasdaq` → Nasdaq Composite) — the taggable indices are a **fixed client-side list, not a table** (`src/modules/shares/markets.ts`: `MARKET_INDICES` + `indexLabel`/`sortIndices` helpers); a note must have ≥1 index and non-empty `body`, both enforced client-side. Lives inside the Shares module (hooks `useMarketNotes`/`useMarketNote`): `/shares/markets` lists notes newest `noted_at` first with a filter chip per index and a total count surfaced on the Shares index; `/shares/markets/add` adds one and `/shares/markets/add/:id` edits or deletes. No link-out and no server-side enrichment — fields are typed by hand.
- `tdl_items(id uuid pk, snapshot_date date, section text, is_recurring bool, position int, title text, due_date date, time_estimate_min int, status text check in (open, worked_today, ready_for_testing, done, cancelled), priority_rank int check (null or 1..10), is_archived bool, snoozed_until date, is_reluctant bool, reluctance_reason text, notes text, images jsonb, origin_item_id uuid, origin_snapshot_date date, client_id, user_id, created_at, updated_at, deleted_at)` + `tdl_days(snapshot_date pk, note text, …)` + `tdl_categories(id uuid pk, key text, label text, sort_order int, has_due_date bool, has_time_estimate bool, …)` — the **To-Do List module** (`/tdl`, `src/modules/tdl/`). Same RLS / Realtime / offline-sync rules as `sets`. A per-day board (`DayView`) groups items by `section` (a `tdl_categories.key`; categories are user-managed rows) into recurring vs dated buckets, ordered by `position` (drag to reorder). `status` cycles open → worked_today → done (Product also gets ready_for_testing). **Priority is a rank, not a flag**: `priority_rank` is `1` (most important) … `10`, or `null` when unranked — set via a per-row dropdown (`ItemRow`) or the `p` key (toggles rank 1). Ranks are **unique within a day** — the picker disables already-taken numbers, and `setPriorityRank` takes a rank from any sibling that held it (displacing the loser to unranked). The day header's "Priority" target pie and `priorityActive`/`priorityTotal` (`dayCompletion`) count items with any rank set. Rank helpers (`setPriorityRank`, `clampRank`, `usedRanks`, `MAX_PRIORITY_RANK`) live in `repo.ts`. **Roll-forward** (`rollForward.ts`) carries every non-archived item to the next day (new `id`, `origin_item_id` links the chain), preserving `priority_rank` and the reluctance flag/reason; recurring items reset to `open`. Items also support snooze (`snoozed_until`), archive (`is_archived`), soft delete, and a detail panel with notes + images (private `share-images` bucket, `tdl/` prefix). **Reluctance**: `is_reluctant` flags an item we don't want to do but still need to (toggled from the row's "More" menu, marked with a thumbs-down on the row); `reluctance_reason` records why, surfaced and edited under the description in the detail panel (`ItemDetail`). Clearing the flag clears the reason (`setReluctant`/`setReluctanceReason` in `repo.ts`). The day header's third target pie ("Did Anyway", `RELUCTANT_TARGET` = 5) tracks `reluctantDone`/`reluctantTotal` (`dayCompletion`) — how many reluctant items you've finished today against the goal of doing 5. Meeting action items import from Fireflies via `POST /api/fireflies-import` + `/api/fireflies-process` (`api/_fireflies.ts`); imported items start unranked (a `high` flag is noted in `notes`, since ranks are unique).
- `smoking_logs(id uuid pk, log_date date not null default current_date, smoked boolean not null, client_id uuid, user_id uuid default auth.uid(), created_at, updated_at, deleted_at)` — the **daily smoking tracker**, surfaced on the Today screen (`SmokingTracker` in `routes/Today.tsx`). Same RLS / Realtime / offline-sync rules as `sets`. One **live row per day**: `smoked` is `true` (smoking day) or `false` (smoke-free); **no live row = the day is unmarked**. There's no DB unique on `log_date` — dedup is client-side (`useSmokingForDate` and `setSmoked` resolve the newest live row, matching how `stocks` dedups). The Today card shows a two-button toggle (Smoke-free / Smoked); tapping the active choice again clears the mark. The `setSmoked(date, true|false|null)` mutation (`sync/mutations.ts`) updates the day's live row, creates it, or soft-deletes every live row for the day when passed `null`. The Stats page (`Dashboard.tsx`) has a **Smoking** section: a month calendar (`SmokingCalendar`, Monday-first, prev/next month nav) colouring each day green (smoke-free), red (smoked), or neutral (no data), fed by the `useSmokingLogMap` date→smoked map.
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
