-- Project locations: the places a production works (a set, a studio, a warehouse),
-- each with a description, an address and an on-site contact. Everyone on the
-- project (and company admins) can see, add and edit them; the person who added
-- a location or a company admin can delete it. A task can be assigned to one.
create table if not exists public.project_locations (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  name          text not null check (length(trim(name)) > 0 and length(name) <= 120),
  description   text check (length(description) <= 2000),
  address       text check (length(address) <= 500),
  contact_name  text check (length(contact_name) <= 120),
  contact_email text check (length(contact_email) <= 254 and contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone text check (length(contact_phone) <= 40),
  created_by    uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists project_locations_name_key on public.project_locations (project_id, lower(name));

-- Stored trimmed, with blanks as null; the project and creator don't change.
create or replace function public.tidy_location()
returns trigger language plpgsql as $$
begin
  new.name := trim(new.name);
  new.description := nullif(trim(new.description), '');
  new.address := nullif(trim(new.address), '');
  new.contact_name := nullif(trim(new.contact_name), '');
  new.contact_email := nullif(lower(trim(new.contact_email)), '');
  new.contact_phone := nullif(trim(new.contact_phone), '');
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists project_locations_tidy on public.project_locations;
create trigger project_locations_tidy before insert or update on public.project_locations
  for each row execute function public.tidy_location();

alter table public.project_locations enable row level security;

drop policy if exists project_locations_select on public.project_locations;
create policy project_locations_select on public.project_locations for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists project_locations_insert on public.project_locations;
create policy project_locations_insert on public.project_locations for insert to authenticated
  with check (created_by = auth.uid() and public.can_access_project(project_id));

drop policy if exists project_locations_update on public.project_locations;
create policy project_locations_update on public.project_locations for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

drop policy if exists project_locations_delete on public.project_locations;
create policy project_locations_delete on public.project_locations for delete to authenticated
  using (created_by = auth.uid() or public.is_company_admin(public.project_company(project_id)));

grant select, insert, update, delete on public.project_locations to authenticated;

-- A task can happen at one of its project's locations.
alter table public.tasks
  add column if not exists location_id uuid references public.project_locations (id) on delete set null;
create index if not exists tasks_location_idx on public.tasks (location_id);

create or replace function public.check_task_location()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.location_id is not null
     and (select project_id from project_locations where id = new.location_id) is distinct from new.project_id then
    raise exception 'That location belongs to another project';
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_check_location on public.tasks;
create trigger tasks_check_location before insert or update of location_id, project_id on public.tasks
  for each row execute function public.check_task_location();
