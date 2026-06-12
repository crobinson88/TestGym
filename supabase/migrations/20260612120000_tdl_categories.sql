-- Dynamic to-do-list categories. Previously the section was a fixed enum baked
-- into a check constraint; now categories are user-managed rows so they can be
-- added, renamed, and deleted. `tdl_items.section` stores a category `key`.
create table public.tdl_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  sort_order integer not null default 0,
  has_due_date boolean not null default true,
  has_time_estimate boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.tdl_categories enable row level security;

create policy "tdl_categories_charlie" on public.tdl_categories
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_tdl_categories
  before update on public.tdl_categories
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.tdl_categories;

-- Seed the six sections that used to be hardcoded. Keys match the strings
-- already stored in tdl_items.section so existing rows keep their category.
insert into public.tdl_categories (key, label, sort_order, has_due_date, has_time_estimate) values
  ('weekly_goals',          'Weekly Goals',         0, false, false),
  ('follow_ups',            'Follow Ups',           1, false, false),
  ('product',               'Product',              2, true,  true),
  ('tgm_tasks',             'TGM Tasks',            3, true,  true),
  ('meeting_action_items',  'Meeting Action Items', 4, true,  true),
  ('personal_other',        'Personal Other',       5, false, false);

-- section is now a dynamic category key, not a fixed enum
alter table public.tdl_items drop constraint if exists tdl_items_section_check;
