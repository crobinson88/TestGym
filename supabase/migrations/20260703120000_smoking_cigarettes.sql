-- Track how many cigarettes were smoked on a day, alongside the existing
-- `smoked` flag. Nullable: null means the count is unknown (e.g. the day was
-- marked "Smoked" from the Today toggle without entering a number); 0 pairs
-- with a smoke-free day (`smoked = false`). The Stats smoking calendar lets you
-- tap a day and enter the count, which also sets `smoked` (count > 0).
alter table public.smoking_logs
  add column cigarettes int check (cigarettes is null or cigarettes >= 0);
