-- Board View lists: the Trello-style lanes *inside* one category (Backlog,
-- In progress, Done, …). Lists belong to a category (tdl_categories.key) and
-- are user-managed rows, so each category can carry its own set.
create table public.tdl_board_lists (
  id uuid primary key default gen_random_uuid(),
  category_key text not null,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tdl_board_lists_category_idx
  on public.tdl_board_lists (category_key, sort_order)
  where deleted_at is null;

alter table public.tdl_board_lists enable row level security;

create policy "tdl_board_lists_charlie" on public.tdl_board_lists
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_tdl_board_lists
  before update on public.tdl_board_lists
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.tdl_board_lists;

-- Which list a card sits in. Null means "not placed yet" and reads as the
-- category's first list, so the column needs no backfill for history.
alter table public.tdl_items
  add column board_list_id uuid references public.tdl_board_lists(id) on delete set null;

create index tdl_items_board_list_idx
  on public.tdl_items (board_list_id)
  where deleted_at is null;

-- Every live category starts with the three standard lists; they can be
-- renamed, reordered, added to and deleted from the board itself.
insert into public.tdl_board_lists (category_key, label, sort_order)
select c.key, v.label, v.sort_order
from public.tdl_categories c
cross join (values ('Backlog', 0), ('In progress', 1), ('Done', 2)) as v(label, sort_order)
where c.deleted_at is null and c.is_archived = false;

-- Place the cards on the boards that are actually open (today and later) from
-- their current status, so the first Board View isn't one giant Backlog.
-- Older days stay null and read as Backlog.
update public.tdl_items i
set board_list_id = l.id
from public.tdl_board_lists l
where l.category_key = i.section
  and l.deleted_at is null
  and i.deleted_at is null
  and i.board_list_id is null
  and i.snapshot_date >= current_date
  and l.label = case
    when i.status in ('done', 'cancelled') then 'Done'
    when i.status in ('worked_today', 'ready_for_testing') then 'In progress'
    else 'Backlog'
  end;
