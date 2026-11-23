-- Step 4: tasks and sub-tasks.
--
-- The tasks table, its security rule (anyone who can open the project can work
-- on its tasks) and the sub-task checks are in the initial schema. This adds:

-- When someone leaves a project, their tasks there become unassigned, so the
-- tasks can still be edited (a task can only be assigned to people on the project).
create or replace function public.unassign_removed_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update tasks set assignee_id = null
   where project_id = old.project_id and assignee_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists project_members_unassign on public.project_members;
create trigger project_members_unassign
  after delete on public.project_members
  for each row execute function public.unassign_removed_member();

-- Titles and descriptions are stored trimmed, with an empty description as null.
create or replace function public.tidy_task()
returns trigger language plpgsql as $$
begin
  new.title := trim(new.title);
  new.description := nullif(trim(new.description), '');
  return new;
end;
$$;

drop trigger if exists tasks_tidy on public.tasks;
create trigger tasks_tidy
  before insert or update on public.tasks
  for each row execute function public.tidy_task();

create index if not exists tasks_assignee_idx on public.tasks (assignee_id);
