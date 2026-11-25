-- Shoot days and call sheets. A shoot day is one date of filming: where (a project
-- location), the day's times, weather and notes, an ordered schedule (scenes, meal
-- breaks, company moves, notes) and who is called (each person's own call time, and
-- for cast their character, pickup and makeup times). The call sheet is built from
-- the day. Sending it bumps its version; each person can mark it viewed and confirm
-- that version.
--
-- Everyone on the project (and company admins) can see and edit shoot days and send
-- call sheets. Whoever added a day, or a company admin, deletes it. People confirm
-- only for themselves.

-- Locations get what a call sheet needs about them.
alter table public.project_locations
  add column if not exists parking text check (length(parking) <= 500),
  add column if not exists nearest_hospital text check (length(nearest_hospital) <= 500);

create or replace function public.tidy_location_extras()
returns trigger language plpgsql as $$
begin
  new.parking := nullif(trim(new.parking), '');
  new.nearest_hospital := nullif(trim(new.nearest_hospital), '');
  return new;
end;
$$;
drop trigger if exists project_locations_tidy_extras on public.project_locations;
create trigger project_locations_tidy_extras before insert or update on public.project_locations
  for each row execute function public.tidy_location_extras();

create table if not exists public.shoot_days (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  shoot_date     date not null,
  title          text check (length(title) <= 120),
  location_id    uuid references public.project_locations (id) on delete set null,
  crew_call      time,
  shooting_call  time,
  lunch          time,
  wrap           time,
  weather        text check (length(weather) <= 200),
  sunrise        time,
  sunset         time,
  notes          text check (length(notes) <= 4000),
  version        integer not null default 0,
  sent_at        timestamptz,
  sent_by        uuid references public.profiles (id) on update cascade on delete set null,
  created_by     uuid default auth.uid() references public.profiles (id) on update cascade on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists shoot_days_project_idx on public.shoot_days (project_id, shoot_date);

create or replace function public.tidy_shoot_day()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title := nullif(trim(new.title), '');
  new.weather := nullif(trim(new.weather), '');
  new.notes := nullif(trim(new.notes), '');
  if tg_op = 'INSERT' then
    new.version := 0;
    new.sent_at := null;
    new.sent_by := null;
  else
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- Only publish_call_sheet() changes the version.
    if current_setting('mp.publishing', true) is distinct from 'on' then
      new.version := old.version;
      new.sent_at := old.sent_at;
      new.sent_by := old.sent_by;
    end if;
    new.updated_at := now();
  end if;
  if new.location_id is not null
     and (select project_id from project_locations where id = new.location_id) is distinct from new.project_id then
    raise exception 'That location belongs to another project';
  end if;
  return new;
end;
$$;
drop trigger if exists shoot_days_tidy on public.shoot_days;
create trigger shoot_days_tidy before insert or update on public.shoot_days
  for each row execute function public.tidy_shoot_day();

alter table public.shoot_days enable row level security;
drop policy if exists shoot_days_select on public.shoot_days;
create policy shoot_days_select on public.shoot_days for select to authenticated
  using (public.can_access_project(project_id));
drop policy if exists shoot_days_insert on public.shoot_days;
create policy shoot_days_insert on public.shoot_days for insert to authenticated
  with check (created_by = auth.uid() and public.can_access_project(project_id));
drop policy if exists shoot_days_update on public.shoot_days;
create policy shoot_days_update on public.shoot_days for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
drop policy if exists shoot_days_delete on public.shoot_days;
create policy shoot_days_delete on public.shoot_days for delete to authenticated
  using (created_by = auth.uid() or public.is_company_admin(public.project_company(project_id)));
grant select, insert, update, delete on public.shoot_days to authenticated;

-- The day's schedule, in order: scenes, meal breaks, company moves and notes.
do $$ begin
  create type public.shoot_item_kind as enum ('scene', 'meal', 'move', 'note');
exception when duplicate_object then null; end $$;

create table if not exists public.shoot_day_items (
  id            uuid primary key default gen_random_uuid(),
  shoot_day_id  uuid not null references public.shoot_days (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  sort_order    integer not null default 0,
  kind          public.shoot_item_kind not null,
  scene_id      uuid references public.scenes (id) on delete cascade,
  label         text check (length(label) <= 300),
  at_time       time,
  created_at    timestamptz not null default now(),
  check ((kind = 'scene') = (scene_id is not null))
);
create index if not exists shoot_day_items_day_idx on public.shoot_day_items (shoot_day_id, sort_order);
create index if not exists shoot_day_items_scene_idx on public.shoot_day_items (scene_id);

create or replace function public.tidy_shoot_day_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.shoot_day_id := old.shoot_day_id;
    new.kind := old.kind;
    new.scene_id := old.scene_id;
  end if;
  new.project_id := (select project_id from shoot_days where id = new.shoot_day_id);
  new.label := nullif(trim(new.label), '');
  if new.scene_id is not null then
    if (select project_id from scenes where id = new.scene_id) is distinct from new.project_id then
      raise exception 'That scene belongs to another project';
    end if;
    if tg_op = 'INSERT' and exists (select 1 from shoot_day_items where shoot_day_id = new.shoot_day_id and scene_id = new.scene_id) then
      raise exception 'That scene is already on this day';
    end if;
  elsif new.label is null and new.kind in ('move', 'note') then
    raise exception 'Say what the % is', case new.kind when 'move' then 'company move' else 'note' end;
  end if;
  if tg_op = 'INSERT' and new.sort_order = 0 then
    new.sort_order := coalesce((select max(sort_order) from shoot_day_items where shoot_day_id = new.shoot_day_id), 0) + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists shoot_day_items_tidy on public.shoot_day_items;
create trigger shoot_day_items_tidy before insert or update on public.shoot_day_items
  for each row execute function public.tidy_shoot_day_item();

-- A scene put on a day counts as scheduled.
create or replace function public.mark_scene_scheduled()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.scene_id is not null then
    update scenes set status = 'scheduled' where id = new.scene_id and status = 'not_scheduled';
  end if;
  return new;
end;
$$;
drop trigger if exists shoot_day_items_schedule_scene on public.shoot_day_items;
create trigger shoot_day_items_schedule_scene after insert on public.shoot_day_items
  for each row execute function public.mark_scene_scheduled();

alter table public.shoot_day_items enable row level security;
drop policy if exists shoot_day_items_all on public.shoot_day_items;
create policy shoot_day_items_all on public.shoot_day_items for all to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
grant select, insert, update, delete on public.shoot_day_items to authenticated;

-- Who is called on a day. A blank call time means the day's crew call. People with
-- a character are cast. Leaving the project takes them off its days.
create table if not exists public.shoot_day_calls (
  shoot_day_id      uuid not null references public.shoot_days (id) on delete cascade,
  user_id           uuid not null references public.profiles (id) on update cascade on delete cascade,
  project_id        uuid not null,
  call_time         time,
  character_name    text check (length(character_name) <= 120),
  pickup_time       time,
  makeup_time       time,
  note              text check (length(note) <= 500),
  viewed_version    integer not null default 0,
  viewed_at         timestamptz,
  confirmed_version integer not null default 0,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  primary key (shoot_day_id, user_id),
  foreign key (project_id, user_id) references public.project_members (project_id, user_id) on update cascade on delete cascade
);
create index if not exists shoot_day_calls_user_idx on public.shoot_day_calls (user_id);

create or replace function public.tidy_shoot_day_call()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.shoot_day_id := old.shoot_day_id;
    -- Only mark_call_sheet() records viewing and confirming.
    if current_setting('mp.confirming', true) is distinct from 'on' then
      new.viewed_version := old.viewed_version;
      new.viewed_at := old.viewed_at;
      new.confirmed_version := old.confirmed_version;
      new.confirmed_at := old.confirmed_at;
    end if;
  else
    new.viewed_version := 0; new.viewed_at := null; new.confirmed_version := 0; new.confirmed_at := null;
  end if;
  new.project_id := (select project_id from shoot_days where id = new.shoot_day_id);
  new.character_name := nullif(trim(new.character_name), '');
  new.note := nullif(trim(new.note), '');
  if not exists (select 1 from project_members where project_id = new.project_id and user_id = new.user_id) then
    raise exception 'Only people on the project can be called';
  end if;
  return new;
end;
$$;
drop trigger if exists shoot_day_calls_tidy on public.shoot_day_calls;
create trigger shoot_day_calls_tidy before insert or update on public.shoot_day_calls
  for each row execute function public.tidy_shoot_day_call();

alter table public.shoot_day_calls enable row level security;
drop policy if exists shoot_day_calls_all on public.shoot_day_calls;
create policy shoot_day_calls_all on public.shoot_day_calls for all to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
grant select, insert, update, delete on public.shoot_day_calls to authenticated;

-- Send a day's call sheet: the next version, stamped with who sent it and when.
create or replace function public.publish_call_sheet(day uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  if not exists (select 1 from shoot_days where id = day and can_access_project(project_id)) then
    raise exception 'Not found, or you do not have access to it' using errcode = '42501';
  end if;
  perform set_config('mp.publishing', 'on', true);
  update shoot_days set version = version + 1, sent_at = now(), sent_by = auth.uid() where id = day returning version into v;
  perform set_config('mp.publishing', 'off', true);
  return v;
end;
$$;

-- The signed-in person has opened (and, with confirm, confirmed) the sent version.
create or replace function public.mark_call_sheet(day uuid, confirm boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  select version into v from shoot_days where id = day and can_access_project(project_id);
  if v is null then raise exception 'Not found, or you do not have access to it' using errcode = '42501'; end if;
  if v = 0 then raise exception 'This call sheet has not been sent yet'; end if;
  perform set_config('mp.confirming', 'on', true);
  update shoot_day_calls set
    viewed_version = v, viewed_at = case when viewed_version = v then viewed_at else now() end,
    confirmed_version = case when confirm then v else confirmed_version end,
    confirmed_at = case when confirm then now() else confirmed_at end
  where shoot_day_id = day and user_id = auth.uid();
  if not found then raise exception 'You are not called on this day'; end if;
  perform set_config('mp.confirming', 'off', true);
end;
$$;

grant execute on function public.publish_call_sheet(uuid), public.mark_call_sheet(uuid, boolean) to authenticated;
