-- Food Diary balance: let the user type their own baseline daily burn instead of
-- relying on the Mifflin-St Jeor × activity-factor estimate (e.g. a number off a
-- watch or a metabolic test). Nullable — null means use the estimate.
alter table public.food_goals
  add column baseline_kcal integer check (baseline_kcal is null or baseline_kcal >= 0);
