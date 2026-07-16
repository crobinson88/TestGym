-- Food Diary module: log each food's calories + protein and track daily goals.
-- Two tables:
--   food_entries — one row per food logged on a given day.
--   food_goals   — the daily calorie + protein targets. One live row is kept
--                  client-side (dedup on read), matching how the app handles
--                  other per-key singletons (stocks, smoking_logs).
-- Both share the same RLS / Realtime / soft-delete rules as `sets`.

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  name text not null,
  calories integer not null check (calories >= 0),
  protein numeric(7, 2) not null check (protein >= 0),
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index food_entries_entry_date_idx on public.food_entries (entry_date);

alter table public.food_entries enable row level security;

create policy "food_entries_charlie" on public.food_entries
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_food_entries
  before update on public.food_entries
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.food_entries;

create table public.food_goals (
  id uuid primary key default gen_random_uuid(),
  calorie_goal integer not null check (calorie_goal >= 0),
  protein_goal integer not null check (protein_goal >= 0),
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.food_goals enable row level security;

create policy "food_goals_charlie" on public.food_goals
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_food_goals
  before update on public.food_goals
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.food_goals;
