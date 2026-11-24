-- Tasks can have a start date, with a part of the day or an exact time, as well as a
-- due date. A task from its start to its due date shows on each of those days.
alter table public.tasks
  add column start_date date,
  add column start_part public.day_part,
  add column start_time time;

alter table public.tasks add constraint tasks_start_when check (
  (start_part is null or start_time is null)
  and (start_date is not null or (start_part is null and start_time is null))
);

-- A task can't be due before it starts.
create or replace function public.check_task_dates()
returns trigger language plpgsql as $$
begin
  if new.start_date is null then
    new.start_part := null;
    new.start_time := null;
  end if;
  if new.start_date is not null and new.due_date is not null and new.due_date < new.start_date then
    raise exception 'The due date can''t be before the start date';
  end if;
  return new;
end;
$$;
create trigger tasks_check_dates before insert or update on public.tasks
  for each row execute function public.check_task_dates();
