-- French module: stores one row per completed vocab/rules test so performance is
-- tracked across devices. Same RLS / Realtime / soft-delete rules as `sets`.
-- The vocab list (top 1000 words incl. top 200 verbs) and the grammar rule bank
-- are static client-side data; only test attempts are persisted.
create table public.french_attempts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('vocab', 'rules')),
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

alter table public.french_attempts enable row level security;

create policy "french_attempts_charlie" on public.french_attempts
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_french_attempts
  before update on public.french_attempts
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.french_attempts;
