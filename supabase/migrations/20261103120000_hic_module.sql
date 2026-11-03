-- HIC module: one row per completed NYC Home Improvement Contractor licensing
-- exam practice test, so performance is tracked across devices. Mirrors
-- `driving_attempts` exactly; same RLS / Realtime / soft-delete rules as `sets`.
-- The question bank is static client-side data; only attempts are persisted.
create table public.hic_attempts (
  id uuid primary key default gen_random_uuid(),
  section text not null check (
    section in ('all', 'licensing', 'contracts', 'advertising', 'operations')
  ),
  total integer not null check (total >= 0),
  correct integer not null check (correct >= 0 and correct <= total),
  duration_ms integer,
  details jsonb not null default '[]',
  started_at timestamptz not null default now(),
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index hic_attempts_started_at_idx on public.hic_attempts (started_at desc);
create index hic_attempts_updated_at_idx on public.hic_attempts (updated_at);

alter table public.hic_attempts enable row level security;

create policy "hic_attempts_charlie" on public.hic_attempts
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_hic_attempts
  before update on public.hic_attempts
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.hic_attempts;
