-- Additive column for the TDL category archive feature.
-- Already applied live on project rgslyxzeyjiypzilpxpf; recorded here so the
-- schema is reproducible. Idempotent so re-running is safe.
alter table public.tdl_categories
  add column if not exists is_archived boolean not null default false;
