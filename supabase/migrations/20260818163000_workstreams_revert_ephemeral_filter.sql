-- Revert the "drop ephemeral sessions" rule.
--
-- It assumed the flood of one-second sessions from the home directory was noise
-- from a probe or scripted call. They appear instead to be the Claude desktop
-- app, which runs sessions from $HOME — i.e. the user's real work. The filter
-- was deleting exactly what the board exists to show.
--
-- Restores the plain upsert. Any future noise filter needs to key off something
-- that actually distinguishes a probe from a session, which a short lifetime
-- does not.

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
