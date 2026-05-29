-- Additive columns for the TDL archive + snooze features.
-- Already applied live on project rgslyxzeyjiypzilpxpf; recorded here so the
-- schema is reproducible. Idempotent so re-running is safe.
alter table public.tdl_items
  add column if not exists is_archived boolean not null default false;
alter table public.tdl_items
  add column if not exists snoozed_until date;
