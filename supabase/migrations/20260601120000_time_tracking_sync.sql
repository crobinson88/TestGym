create table public.time_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null,
  is_work boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.time_allocations (
  id text primary key,
  date date not null,
  slot integer not null check (slot >= 0 and slot < 96),
  task_id uuid not null references public.time_tasks (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index time_allocations_date_idx on public.time_allocations (date);
create index time_allocations_task_idx on public.time_allocations (task_id);

alter table public.time_tasks       enable row level security;
alter table public.time_allocations enable row level security;

create policy "time_tasks_charlie" on public.time_tasks
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create policy "time_allocations_charlie" on public.time_allocations
  for all to public
  using ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co')
  with check ((auth.jwt() ->> 'email') = 'charlie@theglassmarket.co');

create trigger set_updated_at_time_tasks
  before update on public.time_tasks
  for each row execute function public.set_updated_at();

create trigger set_updated_at_time_allocations
  before update on public.time_allocations
  for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.time_tasks;
alter publication supabase_realtime add table public.time_allocations;
