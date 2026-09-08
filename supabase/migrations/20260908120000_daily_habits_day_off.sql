-- Hand-marked days off (sick, PTO, anything that legitimately stops the day),
-- stored on the existing per-day habit row rather than a table of their own:
-- `daily_habits` already is "the hand-set facts about a day", keyed one live
-- row per `habit_date`.
--
-- A day off pauses every derived stat except Smoke-free — being ill is no
-- reason to smoke, and the run should survive it. Like a US public holiday, a
-- day off is only ignored when nothing was logged against it; work you did
-- anyway still counts.
alter table public.daily_habits
  add column day_off boolean not null default false,
  add column day_off_reason text;
