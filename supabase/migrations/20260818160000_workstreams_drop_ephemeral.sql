-- Drop ephemeral sessions from the board.
--
-- Something on the Windows box (an IDE integration or a scripted `claude` call)
-- opens and closes a session inside one second, from the home directory. Each
-- one earned a row, so the board filled with identical noise.
--
-- The rule is deliberately narrow: delete only when a session ENDS having never
-- done anything — still in_progress, last_action still the literal
-- "Session started", and less than EPHEMERAL_SECS old. A real session that ran
-- even one fast turn has already had last_action rewritten to "Turn finished"
-- by its Stop hook, so it can never match, however quick it was.
--
-- Done here rather than in the hooks so both the bash and PowerShell versions
-- get it without being reinstalled.

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
  v_created timestamptz;
  v_status text;
  v_last_action text;
  c_ephemeral_secs constant int := 10;
begin
  select id, created_at, status, last_action
    into v_id, v_created, v_status, v_last_action
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

  elsif p_status = 'completed'
    and p_last_action = 'Session ended'
    and v_status = 'in_progress'
    and v_last_action = 'Session started'
    and now() - v_created < make_interval(secs => c_ephemeral_secs)
  then
    -- Opened and closed having done nothing. Soft delete, freeing the live
    -- (type, source_id) slot as any other dismissal would.
    update public.workstreams
    set deleted_at = now()
    where id = v_id;

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
