-- Remove the "new" section (it held zero rows). Imports now go to
-- meeting_action_items instead.
alter table public.tdl_items drop constraint tdl_items_section_check;
alter table public.tdl_items add constraint tdl_items_section_check
  check (section in
    ('weekly_goals','follow_ups','product','tgm_tasks','personal_other','meeting_action_items'));
