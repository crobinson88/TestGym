-- Email review flow: the mailboxes to review, and the ledger of what was ruled.
--
-- Two tables because they have opposite access needs.
--
-- `email_accounts` holds an OAuth refresh token per outside mailbox, so it is
-- service-role only — no policies are added, exactly as fireflies_ingests does
-- it, which means the anon/authenticated client cannot read a token even with a
-- valid magic-link session. The review endpoint hands the browser only the
-- label and address it needs to render a badge.
--
-- `email_reviews` is the opposite: it holds nothing secret (a Gmail thread id
-- and what was decided) and the browser writes it as the review pass is
-- confirmed, so it gets the standard per-email policy.
create table public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  address text not null,
  -- 'delegated': a theglassmarket.co mailbox reached with the existing Google
  -- service account's domain-wide delegation (no token stored).
  -- 'oauth': any other mailbox — a personal Gmail, another domain — reached
  -- with its own refresh token, granted once via `npm run gmail:auth`.
  auth_mode text not null default 'delegated' check (auth_mode in ('delegated', 'oauth')),
  refresh_token text,
  -- Per-mailbox Gmail search override; null uses the server's default window.
  search_query text,
  is_active boolean not null default true,
  last_reviewed_at timestamptz,
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- Domain-wide delegation cannot reach outside the Workspace domain, so an
  -- oauth mailbox without a token is unusable rather than merely unconfigured.
  constraint email_accounts_oauth_needs_token
    check (auth_mode <> 'oauth' or refresh_token is not null)
);

-- One live row per mailbox, so re-running the authorize script re-grants rather
-- than doubling up the account on the review pass.
create unique index email_accounts_address_live
  on public.email_accounts (lower(address))
  where deleted_at is null;

alter table public.email_accounts enable row level security;

create trigger set_updated_at_email_accounts
  before update on public.email_accounts
  for each row execute function public.set_updated_at();

-- One row per reviewed thread. The server reads this with the service-role key
-- to drop already-decided threads from the next pass, which is what stops a
-- skipped newsletter coming back every morning.
create table public.email_reviews (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.email_accounts (id),
  thread_id text not null,
  -- 'added': became a tdl_items task. 'skipped': seen and ruled not a task.
  -- "Leave for later" writes no row at all, so the thread returns next pass.
  ruling text not null check (ruling in ('added', 'skipped')),
  sender text,
  subject text,
  -- The task this thread became, for 'added' rulings. Not a foreign key: the
  -- task can be deleted, and the ledger entry should outlive it.
  item_id uuid,
  reviewed_at timestamptz not null default now(),
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- A thread is ruled once per mailbox. Soft-deleting the row puts the thread
-- back in the pass, which is how a mis-ruling is undone after the fact.
create unique index email_reviews_thread_live
  on public.email_reviews (account_id, thread_id)
  where deleted_at is null;

create index email_reviews_reviewed_idx
  on public.email_reviews (reviewed_at desc)
  where deleted_at is null;

alter table public.email_reviews enable row level security;

create policy "email_reviews_charlie" on public.email_reviews
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_email_reviews
  before update on public.email_reviews
  for each row execute function public.set_updated_at();

-- Seed the one mailbox the existing service account can already reach. Outside
-- accounts are added by `npm run gmail:auth`, which needs a browser consent.
insert into public.email_accounts (label, address, auth_mode)
values ('The Glass Market', 'charlie@theglassmarket.co', 'delegated')
on conflict do nothing;
