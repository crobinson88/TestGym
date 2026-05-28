alter table public.tdl_items drop constraint tdl_items_section_check;
alter table public.tdl_items add constraint tdl_items_section_check
  check (section in
    ('weekly_goals','follow_ups','product','tgm_tasks','personal_other','new','meeting_action_items'));
