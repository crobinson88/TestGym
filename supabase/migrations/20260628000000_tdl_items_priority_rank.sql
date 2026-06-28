-- Replace the boolean priority flag with a 1–10 priority rank (1 = most
-- important). Ranks are NOT unique — several items may share a number; null
-- means unranked. Existing flagged items become rank 1.
alter table public.tdl_items
  add column if not exists priority_rank integer
  check (priority_rank is null or (priority_rank >= 1 and priority_rank <= 10));

update public.tdl_items
  set priority_rank = 1
  where is_priority = true and priority_rank is null;

alter table public.tdl_items drop column if exists is_priority;
