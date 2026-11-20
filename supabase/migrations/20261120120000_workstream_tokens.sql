-- Scoped access to `workstreams` for things that aren't the browser app:
-- Claude Code hooks in cloud sessions and on other machines, and the Session
-- Sticky desktop note (desktop/session-sticky/).
--
-- The alternative was handing them the service-role key, which bypasses RLS on
-- every table (email_accounts refresh tokens included) and would sit in every
-- cloud session's environment. A workstream token can only touch workstreams.
--
-- Only the SHA-256 of a token is stored. Service-role only, exactly as
-- fireflies_ingests / email_accounts: RLS on, no policies.
create table public.workstream_tokens (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  label text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.workstream_tokens enable row level security;

create or replace function public.workstream_token_ok(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_token is not null
     and length(p_token) between 32 and 200
     and exists (
       select 1 from public.workstream_tokens
       where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
         and revoked_at is null
     );
$$;

revoke all on function public.workstream_token_ok(text) from public;

-- Hook writes. Same upsert-by-source rules as workstream_upsert (nulls keep the
-- stored value, metadata merges); limited to session rows, with sizes capped so
-- a leaked token can't stuff the table.
create or replace function public.workstream_report(
  p_token text,
  p_type text,
  p_source_id text,
  p_title text default null,
  p_status text default null,
  p_last_action text default null,
  p_metadata jsonb default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.workstream_token_ok(p_token) then
    raise exception 'invalid workstream token' using errcode = '28000';
  end if;
  if p_type not in ('code_cli', 'web_chat') then
    raise exception 'unsupported workstream type %', p_type using errcode = '22023';
  end if;
  if p_source_id is null or length(p_source_id) > 200
     or length(coalesce(p_title, '')) > 300
     or length(coalesce(p_last_action, '')) > 500
     or length(coalesce(p_metadata, '{}'::jsonb)::text) > 4000 then
    raise exception 'workstream report too large' using errcode = '22001';
  end if;
  return public.workstream_upsert(p_type, p_source_id, p_title, p_status, p_last_action, p_metadata);
end;
$$;

create or replace function public.workstream_feed(p_token text)
returns setof public.workstreams
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.workstream_token_ok(p_token) then
    raise exception 'invalid workstream token' using errcode = '28000';
  end if;
  return query
    select * from public.workstreams
    where deleted_at is null
      and type in ('code_cli', 'web_chat')
      and updated_at > now() - interval '7 days'
    order by updated_at desc
    limit 200;
end;
$$;

create or replace function public.workstream_dismiss(p_token text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.workstream_token_ok(p_token) then
    raise exception 'invalid workstream token' using errcode = '28000';
  end if;
  update public.workstreams
  set deleted_at = now(), updated_at = now()
  where id = p_id and deleted_at is null;
end;
$$;

-- Hand-added web / Cowork chats. id is set client-side, like every other row.
create or replace function public.workstream_add_web(
  p_token text,
  p_id uuid,
  p_title text,
  p_url text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.workstream_token_ok(p_token) then
    raise exception 'invalid workstream token' using errcode = '28000';
  end if;
  if p_title is null or length(trim(p_title)) = 0 or length(p_title) > 300
     or length(coalesce(p_url, '')) > 500
     or (p_url is not null and p_url !~* '^https?://') then
    raise exception 'invalid web chat' using errcode = '22023';
  end if;
  insert into public.workstreams (id, title, type, status, source_id, last_action, metadata, client_id)
  values (
    p_id,
    trim(p_title),
    'web_chat',
    'in_progress',
    null,
    'Added from sticky note',
    case when p_url is null then '{}'::jsonb else jsonb_build_object('url', p_url) end,
    p_id
  );
  return p_id;
end;
$$;

revoke all on function public.workstream_report(text, text, text, text, text, text, jsonb) from public;
revoke all on function public.workstream_feed(text) from public;
revoke all on function public.workstream_dismiss(text, uuid) from public;
revoke all on function public.workstream_add_web(text, uuid, text, text) from public;
grant execute on function public.workstream_report(text, text, text, text, text, text, jsonb) to anon, authenticated, service_role;
grant execute on function public.workstream_feed(text) to anon, authenticated, service_role;
grant execute on function public.workstream_dismiss(text, uuid) to anon, authenticated, service_role;
grant execute on function public.workstream_add_web(text, uuid, text, text) to anon, authenticated, service_role;
