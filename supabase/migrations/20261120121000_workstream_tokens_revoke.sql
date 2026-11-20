-- Supabase's default privileges grant EXECUTE on new public functions to anon
-- and authenticated directly, so the `revoke ... from public` in the earlier
-- migrations left these two callable by anon. Both are internal: token_ok is
-- only called from inside the workstream_* definer functions, and
-- workstream_upsert is for service-role callers (RLS already blocked anon
-- writes through it, since it runs as the invoker).
revoke execute on function public.workstream_token_ok(text) from anon, authenticated;
revoke execute on function public.workstream_upsert(text, text, text, text, text, jsonb) from anon, authenticated;
