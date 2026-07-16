-- Food Diary balance: extend the food_goals singleton with a body profile so the
-- app can compute a baseline daily burn (Mifflin-St Jeor BMR × activity factor).
-- The daily balance = baseline burn + logged gym-cardio burn − food eaten.
-- All profile fields are nullable except sex + activity_factor (which default),
-- so a goals row can exist before the profile is filled in.
alter table public.food_goals
  add column sex text not null default 'male' check (sex in ('male', 'female')),
  add column age integer check (age is null or age > 0),
  add column height_cm numeric(5, 1) check (height_cm is null or height_cm > 0),
  add column weight_lb numeric(6, 2) check (weight_lb is null or weight_lb > 0),
  add column activity_factor numeric(4, 2) not null default 1.2
    check (activity_factor >= 1);
