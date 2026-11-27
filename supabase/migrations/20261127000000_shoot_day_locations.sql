-- A shoot day can be at more than one location (a diner in the morning, the park
-- after lunch; or a set plus base camp). The day's locations are an ordered list in
-- shoot_day_locations; the first is the main one, whose address the weather lookup
-- uses. Each location's address, parking, nearest hospital and on-site contact stay
-- on the location itself (edited on the Locations page) and show on the call sheet.
--
-- This replaces shoot_days.location_id: each day's location moves into the list as
-- its first, and the column goes, so the day's place is stored once.
--
-- Crew on the project change a day's locations, like the rest of the day; everyone
-- on the project sees them.

create table if not exists public.shoot_day_locations (
  shoot_day_id uuid not null references public.shoot_days (id) on delete cascade,
  location_id  uuid not null references public.project_locations (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  primary key (shoot_day_id, location_id)
);
create index if not exists shoot_day_locations_location_idx on public.shoot_day_locations (location_id);
create index if not exists shoot_day_locations_project_idx on public.shoot_day_locations (project_id);

-- A link takes its day's project, and the location must be on the same project.
-- A new link goes to the end of the day's list unless given a place.
create or replace function public.tidy_shoot_day_location()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.shoot_day_id := old.shoot_day_id;
    new.location_id := old.location_id;
    new.created_at := old.created_at;
  end if;
  new.project_id := (select project_id from shoot_days where id = new.shoot_day_id);
  if (select project_id from project_locations where id = new.location_id) is distinct from new.project_id then
    raise exception 'That location belongs to another project';
  end if;
  if tg_op = 'INSERT' and coalesce(new.sort_order, 0) = 0 then
    new.sort_order := coalesce((select max(sort_order) from shoot_day_locations where shoot_day_id = new.shoot_day_id), 0) + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists shoot_day_locations_tidy on public.shoot_day_locations;
create trigger shoot_day_locations_tidy before insert or update on public.shoot_day_locations
  for each row execute function public.tidy_shoot_day_location();

alter table public.shoot_day_locations enable row level security;
drop policy if exists shoot_day_locations_select on public.shoot_day_locations;
create policy shoot_day_locations_select on public.shoot_day_locations for select to authenticated
  using (public.can_access_project(project_id));
drop policy if exists shoot_day_locations_insert on public.shoot_day_locations;
create policy shoot_day_locations_insert on public.shoot_day_locations for insert to authenticated
  with check (public.is_project_crew((select project_id from public.shoot_days where id = shoot_day_id)));
drop policy if exists shoot_day_locations_update on public.shoot_day_locations;
create policy shoot_day_locations_update on public.shoot_day_locations for update to authenticated
  using (public.is_project_crew(project_id)) with check (public.is_project_crew(project_id));
drop policy if exists shoot_day_locations_delete on public.shoot_day_locations;
create policy shoot_day_locations_delete on public.shoot_day_locations for delete to authenticated
  using (public.is_project_crew(project_id));
grant select, insert, update, delete on public.shoot_day_locations to authenticated;

-- Each day's one location becomes the first in its list.
insert into public.shoot_day_locations (shoot_day_id, location_id, project_id, sort_order)
  select id, location_id, project_id, 1 from public.shoot_days where location_id is not null
  on conflict do nothing;

-- The day no longer checks a location of its own.
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
  return new;
end;
$$;

-- ---- Call sheet links show every location, in order ---------------------------------

do $$
declare src text; f text; n int;
begin
  foreach f in array array['call_sheet_for_link(uuid)', 'call_sheet_for_share(uuid)'] loop
    src := pg_get_functiondef(('public.' || f)::regprocedure);
    n := (length(src) - length(replace(src, 'where l.id = d.location_id', ''))) / length('where l.id = d.location_id');
    if n <> 1 or position($r$'location', (select jsonb_build_object($r$ in src) = 0 then
      raise exception '% changed; update the shoot day locations migration', f;
    end if;
    src := replace(src, $r$'location', (select jsonb_build_object($r$,
                        $r$'locations', coalesce((select jsonb_agg(jsonb_build_object($r$);
    src := regexp_replace(src, '\)\s*from project_locations l where l\.id = d\.location_id\),',
      ') order by dl.sort_order) from shoot_day_locations dl join project_locations l on l.id = dl.location_id where dl.shoot_day_id = d.id), ''[]''),');
    execute src;
  end loop;
end;
$$;

-- ---- Audit trail ------------------------------------------------------------------

do $$
declare src text;
begin
  src := pg_get_functiondef('public.audit_row()'::regprocedure);
  src := replace(src, $r$  else
    label := null;
  end case;$r$, $r$  when 'shoot_day_locations' then
    k := (r->>'shoot_day_id') || ':' || (r->>'location_id'); pid := (r->>'project_id')::uuid;
    ptable := 'shoot_days'; pkey := r->>'shoot_day_id';
    label := (select name from project_locations where id = (r->>'location_id')::uuid);
  else
    label := null;
  end case;$r$);
  if src not like '%shoot_day_locations%' then
    raise exception 'audit_row changed; update the shoot day locations migration';
  end if;
  execute src;
end;
$$;
drop trigger if exists "Audit change" on public.shoot_day_locations;
create trigger "Audit change" after insert or update or delete on public.shoot_day_locations
  for each row execute function public.audit_row();

-- ---- The old column goes ------------------------------------------------------------

alter table public.shoot_days drop column if exists location_id;
-- Column privileges are per column: grant the remaining ones again (share_token stays hidden).
select public.hide_share_token();
