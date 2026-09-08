-- Comments on a to-do card. A task gets a fresh tdl_items row every day it
-- rolls forward, so a comment hangs off the *chain*, not the row: `thread_id`
-- is the id of the first row in the roll-forward chain (origin_item_id walked
-- to the root), which keeps a thread readable on tomorrow's card. `item_id`
-- records the row it was actually written on.
create table public.tdl_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  item_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tdl_comments_thread_idx
  on public.tdl_comments (thread_id, created_at)
  where deleted_at is null;

alter table public.tdl_comments enable row level security;

create policy "tdl_comments_charlie" on public.tdl_comments
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_tdl_comments
  before update on public.tdl_comments
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.tdl_comments;
