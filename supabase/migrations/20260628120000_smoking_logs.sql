-- Daily smoking tracker: one row per day flagging whether the day was a smoking
-- day or smoke-free. Surfaced on the Today screen. Same RLS / Realtime /
-- soft-delete rules as `sets`. One live row per date is kept client-side
-- (dedup on read), matching how the app handles other per-key rows.
create table public.smoking_logs (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  smoked boolean not null,
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index smoking_logs_log_date_idx on public.smoking_logs (log_date);

alter table public.smoking_logs enable row level security;

create policy "smoking_logs_charlie" on public.smoking_logs
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_smoking_logs
  before update on public.smoking_logs
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.smoking_logs;
