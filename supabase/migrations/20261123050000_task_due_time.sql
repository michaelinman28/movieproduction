-- Tasks can be due at a part of the day (morning, afternoon, evening) or at an
-- exact time, on top of the due date. Times are the production's local time.
do $$ begin
  create type public.day_part as enum ('morning', 'afternoon', 'evening');
exception when duplicate_object then null; end $$;

alter table public.tasks
  add column if not exists due_part public.day_part,
  add column if not exists due_time time;

alter table public.tasks drop constraint if exists tasks_due_when;
alter table public.tasks add constraint tasks_due_when check (
  (due_part is null or due_time is null)
  and (due_date is not null or (due_part is null and due_time is null))
);
