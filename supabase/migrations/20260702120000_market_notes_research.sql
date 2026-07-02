-- Market-note AI research: each note keeps a log of validation runs
-- (prompt + Claude's grounded write-up + the sources it cited). Additive
-- jsonb column, same sync/RLS/soft-delete rules as the rest of market_notes.
alter table public.market_notes
  add column if not exists research jsonb not null default '[]'::jsonb;
