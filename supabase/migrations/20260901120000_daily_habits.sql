-- Daily habits tracker: one row per day holding the hand-marked habits behind
-- the Stats page's habit grid. Only the manual habits live here — the grid's
-- other columns (rolling 7-day hours, priority task, task completion, gym
-- weight) are derived from time allocations, tdl_items and sets at read time.
-- `early_start` / `early_bed` are nullable: null = the day is unmarked.
-- One live row per `habit_date` is kept (dedup on read), matching smoking_logs.
create table public.daily_habits (
  id uuid primary key default gen_random_uuid(),
  habit_date date not null default current_date,
  early_start boolean,
  early_bed boolean,
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index daily_habits_habit_date_idx on public.daily_habits (habit_date);

alter table public.daily_habits enable row level security;

create policy "daily_habits_charlie" on public.daily_habits
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_daily_habits
  before update on public.daily_habits
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.daily_habits;
