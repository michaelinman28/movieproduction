-- Task notes: a task has one description and any number of notes. Everyone who
-- can work on the task can read and add notes; only a note's author can edit it,
-- and the author or a company admin can delete it.
create table if not exists public.task_notes (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_notes_task_idx on public.task_notes (task_id, created_at);

create or replace function public.task_project(tid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from tasks where id = tid;
$$;

-- Notes are stored trimmed; the author and task can't be changed afterwards.
create or replace function public.tidy_task_note()
returns trigger language plpgsql as $$
begin
  new.body := trim(new.body);
  if tg_op = 'UPDATE' then
    new.author_id := old.author_id;
    new.task_id := old.task_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists task_notes_tidy on public.task_notes;
create trigger task_notes_tidy
  before insert or update on public.task_notes
  for each row execute function public.tidy_task_note();

alter table public.task_notes enable row level security;

drop policy if exists task_notes_select on public.task_notes;
create policy task_notes_select on public.task_notes for select to authenticated
  using (public.can_access_project(public.task_project(task_id)));

drop policy if exists task_notes_insert on public.task_notes;
create policy task_notes_insert on public.task_notes for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_project(public.task_project(task_id)));

drop policy if exists task_notes_update on public.task_notes;
create policy task_notes_update on public.task_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists task_notes_delete on public.task_notes;
create policy task_notes_delete on public.task_notes for delete to authenticated
  using (author_id = auth.uid() or public.is_company_admin(public.project_company(public.task_project(task_id))));

grant select, insert, update, delete on public.task_notes to authenticated;
