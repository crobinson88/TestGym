-- Push to Trello: a log of every to-do task sent to a Trello board as a card.
--
-- Keyed on the roll-forward chain root (`thread_id`), the same trick
-- tdl_comments and tdl_completions play: a task gets a fresh tdl_items row every
-- day it carries over, so "has this task already been pushed?" has to be asked
-- of the chain, not of today's row. Not unique — pushing the same task again
-- (to another board, say) is allowed; the push dialog warns first.
--
-- Written by the server with the service-role key once the card exists on
-- Trello, so a closed tab never loses the record of a card that was created.
-- Read by the browser straight from Supabase (pushing needs the network anyway),
-- so it is not in the Dexie offline-sync set — the same reasoning as
-- email_reviews.
create table public.tdl_trello_cards (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  -- The row the push was made from. Not a foreign key: the task can be deleted
  -- and the record of the card should outlive it.
  item_id uuid not null,
  board_id text not null,
  board_name text,
  list_id text not null,
  list_name text,
  card_id text not null,
  card_url text not null,
  card_name text not null,
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index tdl_trello_cards_thread_idx
  on public.tdl_trello_cards (thread_id)
  where deleted_at is null;

alter table public.tdl_trello_cards enable row level security;

create policy "tdl_trello_cards_charlie" on public.tdl_trello_cards
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_tdl_trello_cards
  before update on public.tdl_trello_cards
  for each row execute function public.set_updated_at();
