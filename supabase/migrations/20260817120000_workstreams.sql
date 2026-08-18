-- Workstream Command Center: one row per live AI workstream (Claude Code CLI
-- session, web/Cowork chat, or an actionable task extracted from email).
--
-- Deliberately NOT part of the Dexie offline-sync set, unlike every other table
-- in this app. These rows describe remote processes on other machines: an
-- offline copy is meaningless, and CLI hooks fire on every turn, so syncing the
-- churn to the phone would be pure noise. The desktop view reads Supabase
-- directly and subscribes to Realtime while it is open.
--
-- Same RLS shape as `sets` (JWT email gate) so the browser client can read and
-- edit; CLI hooks write with the service-role key, which bypasses RLS.

create table public.workstreams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  type text not null check (type in ('code_cli', 'web_chat', 'email_task')),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'waiting_input', 'completed', 'failed')),
  -- Terminal session id, web session id, or Gmail thread id. Null for rows
  -- typed by hand.
  source_id text,
  last_action text,
  metadata jsonb not null default '{}'::jsonb,
  client_id uuid,
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index workstreams_updated_at_idx on public.workstreams (updated_at desc);
create index workstreams_status_idx on public.workstreams (status);

-- One live row per external source. Repeated hook fires for the same terminal
-- session, and re-triaging an email thread already logged, update in place
-- rather than piling up duplicates. Nulls are distinct in a unique index, so
-- hand-typed rows (source_id null) are unaffected.
create unique index workstreams_live_source_idx
  on public.workstreams (type, source_id)
  where deleted_at is null and source_id is not null;

alter table public.workstreams enable row level security;

create policy "workstreams_charlie" on public.workstreams
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_workstreams
  before update on public.workstreams
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.workstreams;

-- Upsert-by-source for the CLI hooks and the email triage worker.
--
-- Exists as an RPC rather than a PostgREST upsert because the dedup key is a
-- PARTIAL unique index (live rows only) — ON CONFLICT cannot infer one without
-- a matching WHERE clause, which PostgREST does not emit. Doing the lookup here
-- also lets a hook send only the fields it knows: nulls leave the stored value
-- alone, and metadata is merged rather than replaced, so a Stop hook does not
-- wipe the cwd/branch that SessionStart recorded.
--
-- security invoker (the default): callers are service_role only, so the
-- function grants no access the caller does not already have.
create or replace function public.workstream_upsert(
  p_type text,
  p_source_id text,
  p_title text default null,
  p_status text default null,
  p_last_action text default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.workstreams
  where deleted_at is null
    and type = p_type
    and source_id = p_source_id
  order by updated_at desc
  limit 1;

  if v_id is null then
    insert into public.workstreams (type, source_id, title, status, last_action, metadata)
    values (
      p_type,
      p_source_id,
      coalesce(p_title, p_source_id),
      coalesce(p_status, 'in_progress'),
      p_last_action,
      coalesce(p_metadata, '{}'::jsonb)
    )
    returning id into v_id;
  else
    update public.workstreams
    set title       = coalesce(p_title, title),
        status      = coalesce(p_status, status),
        last_action = coalesce(p_last_action, last_action),
        metadata    = metadata || coalesce(p_metadata, '{}'::jsonb)
    where id = v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.workstream_upsert(text, text, text, text, text, jsonb) from public;
grant execute on function public.workstream_upsert(text, text, text, text, text, jsonb) to service_role;
