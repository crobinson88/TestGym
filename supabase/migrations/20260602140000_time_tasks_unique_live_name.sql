-- Guard against two live time_tasks sharing a name (case-insensitive).
-- Backstops the client-side dedupe in createTimeTask; offline double-creates
-- across devices were producing duplicate categories (e.g. two "TGM"), which
-- made the Time Tracking task list and day grid diverge between phone/desktop.
create unique index if not exists time_tasks_name_live_uidx
  on public.time_tasks (lower(name))
  where deleted_at is null;
