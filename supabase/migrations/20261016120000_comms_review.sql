-- Comms review flow: the Slack workspaces to read, and the ledger of which
-- communications were matched to which to-do task.
--
-- Two tables, the same opposite-access split the email review pass uses.
--
-- `slack_workspaces` holds a Slack USER token per workspace, so it is
-- service-role only — no policies are added, exactly as `email_accounts` and
-- `fireflies_ingests` do it, which means the anon/authenticated client cannot
-- read a token even with a valid magic-link session. The review endpoint hands
-- the browser only the label it needs to badge a card.
--
-- It has to be a user token (xoxp-), not a bot token: `search.messages` runs as
-- the user and a bot token cannot call it at all. That also rules out a single
-- env-var token, since the whole point is several workspaces — hence a table,
-- one row per workspace, each granted once by `npm run slack:auth`.
--
-- `comms_matches` is the opposite: it holds nothing secret (a message
-- permalink and what was decided) and the browser writes it as the pass is
-- confirmed, so it gets the standard per-email policy.
create table public.slack_workspaces (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  team_id text not null,
  -- Whose messages to search for. `from:<@id>` is the whole filter, so without
  -- it a pass would read the entire workspace rather than the user's own work.
  slack_user_id text not null,
  -- xoxp- user token carrying search:read. Never leaves the server.
  access_token text not null,
  is_active boolean not null default true,
  last_reviewed_at timestamptz,
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One live row per workspace, so re-running the authorize script re-grants
-- rather than doubling the workspace up on the review pass.
create unique index slack_workspaces_team_live
  on public.slack_workspaces (team_id)
  where deleted_at is null;

alter table public.slack_workspaces enable row level security;

create trigger set_updated_at_slack_workspaces
  before update on public.slack_workspaces
  for each row execute function public.set_updated_at();

-- One row per ruled (task, communication) pair.
--
-- A task gets a fresh `tdl_items` row every day it rolls forward, so the match
-- hangs off the CHAIN, not the row: `thread_id` is the roll-forward chain root
-- (`rootItemId`), the same trick `tdl_comments.thread_id` and
-- `tdl_completions.thread_id` play. `item_id` records the row it was ruled on.
--
-- An entry is a SNAPSHOT, not a pointer: `comm_excerpt` / `comm_url` /
-- `item_title` are copied in at ruling time so the ledger still reads right
-- after the task is renamed or the Slack message is edited.
create table public.comms_matches (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  item_id uuid,
  item_title text not null,
  -- 'slack' or 'email'. Not a foreign key to anything: the sources are code,
  -- not rows, exactly as the taggable market indices are.
  source text not null check (source in ('slack', 'email')),
  -- Stable id for the communication within its source: a Slack `ts` or a Gmail
  -- thread id. Scoped by source, which is what makes the pair unique below.
  comm_key text not null,
  comm_url text,
  comm_excerpt text,
  comm_at timestamptz,
  -- 'done': the comms are evidence the task shipped, so it went to the
  -- Completed list. 'connected': related, attached to the task as evidence but
  -- not finished. 'skipped': seen and ruled not a match.
  -- "Decide later" writes no row at all, so the pair returns in the next pass.
  ruling text not null check (ruling in ('done', 'connected', 'skipped')),
  reviewed_at timestamptz not null default now(),
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- A given communication is ruled once against a given task chain. Soft-deleting
-- the row puts the pair back in the pass, which is how a mis-ruling is undone
-- after the fact — the same escape hatch `email_reviews` gives a thread.
create unique index comms_matches_pair_live
  on public.comms_matches (thread_id, source, comm_key)
  where deleted_at is null;

create index comms_matches_reviewed_idx
  on public.comms_matches (reviewed_at desc)
  where deleted_at is null;

alter table public.comms_matches enable row level security;

create policy "comms_matches_charlie" on public.comms_matches
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_comms_matches
  before update on public.comms_matches
  for each row execute function public.set_updated_at();
