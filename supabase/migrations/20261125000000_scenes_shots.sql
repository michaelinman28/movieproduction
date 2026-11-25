-- Scenes and shot lists. A project's scenes are typed in (script import can come
-- later), each with its set, interior/exterior, time of day, length in eighths of a
-- page, characters, needs and a location. Each scene has an ordered list of shots.
-- Scenes feed shoot days and call sheets next.
--
-- Everyone on the project (and company admins) can see, add, edit and reorder
-- scenes and shots. Whoever added a scene, or a company admin, deletes it (with its
-- shots); anyone on the project can delete a shot.

do $$ begin
  create type public.scene_int_ext as enum ('int', 'ext', 'int_ext');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scene_time as enum ('day', 'night', 'dawn', 'dusk');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scene_status as enum ('not_scheduled', 'scheduled', 'shot');
exception when duplicate_object then null; end $$;

create table if not exists public.scenes (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  number        text not null check (length(trim(number)) > 0 and length(number) <= 20),
  set_name      text check (length(set_name) <= 200),
  int_ext       public.scene_int_ext,
  time_of_day   public.scene_time,
  -- Length in eighths of a page, the industry's unit: 11 = 1 3/8 pages.
  pages_eighths integer check (pages_eighths between 0 and 8000),
  synopsis      text check (length(synopsis) <= 1000),
  characters    text check (length(characters) <= 1000),
  needs         text check (length(needs) <= 2000),
  location_id   uuid references public.project_locations (id) on delete set null,
  status        public.scene_status not null default 'not_scheduled',
  sort_order    integer not null default 0,
  created_by    uuid default auth.uid() references public.profiles (id) on update cascade on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists scenes_number_key on public.scenes (project_id, lower(number));
create index if not exists scenes_project_idx on public.scenes (project_id, sort_order);
create index if not exists scenes_location_idx on public.scenes (location_id);

-- Stored trimmed, with blanks as null; new scenes go to the end of the list. The
-- project and creator don't change, and the location must be on the same project.
create or replace function public.tidy_scene()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.number := trim(new.number);
  new.set_name := nullif(trim(new.set_name), '');
  new.synopsis := nullif(trim(new.synopsis), '');
  new.characters := nullif(trim(new.characters), '');
  new.needs := nullif(trim(new.needs), '');
  if tg_op = 'INSERT' and new.sort_order = 0 then
    new.sort_order := coalesce((select max(sort_order) from scenes where project_id = new.project_id), 0) + 1;
  end if;
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if new.location_id is not null
     and (select project_id from project_locations where id = new.location_id) is distinct from new.project_id then
    raise exception 'That location belongs to another project';
  end if;
  return new;
end;
$$;
drop trigger if exists scenes_tidy on public.scenes;
create trigger scenes_tidy before insert or update on public.scenes
  for each row execute function public.tidy_scene();

alter table public.scenes enable row level security;

drop policy if exists scenes_select on public.scenes;
create policy scenes_select on public.scenes for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists scenes_insert on public.scenes;
create policy scenes_insert on public.scenes for insert to authenticated
  with check (created_by = auth.uid() and public.can_access_project(project_id));

drop policy if exists scenes_update on public.scenes;
create policy scenes_update on public.scenes for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

drop policy if exists scenes_delete on public.scenes;
create policy scenes_delete on public.scenes for delete to authenticated
  using (created_by = auth.uid() or public.is_company_admin(public.project_company(project_id)));

grant select, insert, update, delete on public.scenes to authenticated;

-- A scene's shots, in shooting order. Size, angle and movement are picked from
-- lists in the app; they're stored as text so a company can add its own later.
create table if not exists public.shots (
  id           uuid primary key default gen_random_uuid(),
  scene_id     uuid not null references public.scenes (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  sort_order   integer not null default 0,
  description  text not null check (length(trim(description)) > 0 and length(description) <= 500),
  size         text check (length(size) <= 40),
  angle        text check (length(angle) <= 40),
  movement     text check (length(movement) <= 40),
  lens         text check (length(lens) <= 40),
  equipment    text check (length(equipment) <= 300),
  est_minutes  integer check (est_minutes between 0 and 1440),
  done         boolean not null default false,
  notes        text check (length(notes) <= 2000),
  created_by   uuid default auth.uid() references public.profiles (id) on update cascade on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists shots_scene_idx on public.shots (scene_id, sort_order);
create index if not exists shots_project_idx on public.shots (project_id);

-- A shot takes its scene's project and stays in its scene; text is trimmed and new
-- shots go to the end of the scene's list.
create or replace function public.tidy_shot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.scene_id := old.scene_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  new.project_id := (select project_id from scenes where id = new.scene_id);
  new.description := trim(new.description);
  new.size := nullif(trim(new.size), '');
  new.angle := nullif(trim(new.angle), '');
  new.movement := nullif(trim(new.movement), '');
  new.lens := nullif(trim(new.lens), '');
  new.equipment := nullif(trim(new.equipment), '');
  new.notes := nullif(trim(new.notes), '');
  if tg_op = 'INSERT' and new.sort_order = 0 then
    new.sort_order := coalesce((select max(sort_order) from shots where scene_id = new.scene_id), 0) + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists shots_tidy on public.shots;
create trigger shots_tidy before insert or update on public.shots
  for each row execute function public.tidy_shot();

alter table public.shots enable row level security;

drop policy if exists shots_select on public.shots;
create policy shots_select on public.shots for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists shots_insert on public.shots;
create policy shots_insert on public.shots for insert to authenticated
  with check (created_by = auth.uid() and public.can_access_project(project_id));

drop policy if exists shots_update on public.shots;
create policy shots_update on public.shots for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

drop policy if exists shots_delete on public.shots;
create policy shots_delete on public.shots for delete to authenticated
  using (public.can_access_project(project_id));

grant select, insert, update, delete on public.shots to authenticated;
