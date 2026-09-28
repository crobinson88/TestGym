-- Workstreams: named sub-groups *inside* one category (e.g. "Billing revamp",
-- "Onboarding" under Product). User-managed rows, one set per category
-- (`category_key` is a tdl_categories.key). Unrelated to public.workstreams,
-- which tracks live Claude sessions.
create table public.tdl_workstreams (
  id uuid primary key default gen_random_uuid(),
  category_key text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tdl_workstreams_category_idx
  on public.tdl_workstreams (category_key, sort_order)
  where deleted_at is null;

alter table public.tdl_workstreams enable row level security;

create policy "tdl_workstreams_charlie" on public.tdl_workstreams
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_tdl_workstreams
  before update on public.tdl_workstreams
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.tdl_workstreams;

-- Which workstream an item belongs to. Null = no workstream (the category's
-- ungrouped bucket). Carried forward day to day.
alter table public.tdl_items
  add column workstream_id uuid references public.tdl_workstreams(id) on delete set null;

create index tdl_items_workstream_idx
  on public.tdl_items (workstream_id)
  where deleted_at is null;
