create table public.tdl_items (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null,
  section text not null check (section in
    ('weekly_goals','follow_ups','product','tgm_tasks','personal_other','new')),
  is_recurring boolean not null default false,
  position integer not null default 0,
  title text not null,
  due_date date,
  time_estimate_min integer,
  status text not null default 'open' check (status in
    ('open','worked_today','ready_for_testing','done','cancelled')),
  constraint tdl_items_rft_only_on_product
    check (status <> 'ready_for_testing' or section = 'product'),
  is_priority boolean not null default false,
  notes text,
  origin_item_id uuid,
  origin_snapshot_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tdl_items_date_idx on public.tdl_items (snapshot_date);
create index tdl_items_section_idx on public.tdl_items (snapshot_date, section, position);

create table public.tdl_days (
  snapshot_date date primary key,
  limiting_factor_date date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.tdl_items enable row level security;
alter table public.tdl_days  enable row level security;

create policy "tdl_items_charlie" on public.tdl_items
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create policy "tdl_days_charlie" on public.tdl_days
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_tdl_items
  before update on public.tdl_items
  for each row execute function public.set_updated_at();

create trigger set_updated_at_tdl_days
  before update on public.tdl_days
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.tdl_items;
alter publication supabase_realtime add table public.tdl_days;
