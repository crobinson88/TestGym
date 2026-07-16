-- Break each to-do category into the Eisenhower priority matrix. Every item
-- gets an optional quadrant: null means unclassified (the default for existing
-- rows), otherwise one of the four urgent/important combinations. Additive and
-- nullable so it is safe to apply live and idempotent to re-run.
alter table public.tdl_items
  add column if not exists eisenhower_quadrant text
  check (
    eisenhower_quadrant is null
    or eisenhower_quadrant in ('do_first', 'schedule', 'delegate', 'eliminate')
  );
