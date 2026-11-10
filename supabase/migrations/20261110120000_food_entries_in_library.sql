-- Food Diary library: an AI-estimated entry asks whether it should join the
-- library (the library is derived from entries, so opting out needs a flag on
-- the entry). Existing rows and hand-typed logs stay in it — default true.
alter table public.food_entries
  add column in_library boolean not null default true;
