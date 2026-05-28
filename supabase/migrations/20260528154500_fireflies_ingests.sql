-- Dedupe table for the Fireflies webhook: one row per processed meeting so
-- Fireflies' retries can't create duplicate action items.
create table if not exists public.fireflies_ingests (
  meeting_id text primary key,
  created_at timestamptz not null default now()
);

-- Only the service-role key (which bypasses RLS) touches this table; deny all
-- other access. No policies are added, so anon/authenticated cannot read it.
alter table public.fireflies_ingests enable row level security;
