-- "P" tracker on the Stats page: one row per counted instance, each carrying
-- how long it took in minutes. A day's count is its number of live rows and its
-- time is the sum of `minutes`. Same RLS / Realtime / soft-delete rules as `sets`.
create table public.p_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  minutes int check (minutes is null or minutes >= 0),
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index p_logs_log_date_idx on public.p_logs (log_date);

alter table public.p_logs enable row level security;

create policy "p_logs_charlie" on public.p_logs
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_p_logs
  before update on public.p_logs
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.p_logs;
