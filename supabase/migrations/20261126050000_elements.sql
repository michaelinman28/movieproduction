-- Elements: the things a shoot needs (props, wardrobe, vehicles, animals, effects…),
-- per project, from the script breakdown. Each element is stored once and linked to
-- every scene that uses it, through scene_elements, one link that the scene and the
-- element both show and edit (with an optional note for that scene).
--
-- * Each element has a name, a category (from the company's list, which admins
--   manage), a description, a status (needed, sourced, ready), an owner from the
--   project's team, a quantity and notes; and optionally the one character it belongs
--   to (Ellie's backpack) and the one location it stays at (set dressing).
-- * Everyone on the project (and company admins) sees, adds and edits elements and
--   links; whoever added an element, or a company admin, deletes it.
-- * Call sheets list the elements of the day's scenes: the project's sheet, personal
--   links and the shared link.
-- * Characters' Wardrobe, Hair and makeup and Props text become elements of that
--   character (in the character's scenes), and those three fields go: an element is
--   now the one place that holds them. Continuity and per-scene look notes stay.

do $$ begin
  create type public.element_status as enum ('needed', 'sourced', 'ready');
exception when duplicate_object then null; end $$;

-- ---- Categories, per company ------------------------------------------------------

create table if not exists public.element_categories (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists element_categories_name_idx on public.element_categories (company_id, lower(name));

drop trigger if exists element_categories_tidy on public.element_categories;
create trigger element_categories_tidy before insert or update on public.element_categories
  for each row execute function public.tidy_name();

-- Every company starts with the usual breakdown categories, which its admins can change.
create or replace function public.seed_element_categories(cid uuid)
returns void language sql security definer set search_path = public as $$
  insert into element_categories (company_id, name, sort_order)
  select cid, n, i from unnest(array[
    'Props', 'Wardrobe', 'Hair & makeup', 'Set dressing', 'Vehicles', 'Animals',
    'SFX', 'VFX', 'Stunts', 'Extras', 'Sound/music', 'Special equipment'
  ]) with ordinality as t(n, i)
  on conflict do nothing;
$$;
revoke execute on function public.seed_element_categories(uuid) from public, anon, authenticated;

create or replace function public.on_company_created_element_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_element_categories(new.id);
  return new;
end;
$$;
drop trigger if exists companies_seed_element_categories on public.companies;
create trigger companies_seed_element_categories after insert on public.companies
  for each row execute function public.on_company_created_element_categories();

select public.seed_element_categories(id) from public.companies
 where not exists (select 1 from public.element_categories c where c.company_id = companies.id);

alter table public.element_categories enable row level security;
drop policy if exists element_categories_select on public.element_categories;
create policy element_categories_select on public.element_categories for select to authenticated
  using (public.is_company_member(company_id));
drop policy if exists element_categories_write on public.element_categories;
create policy element_categories_write on public.element_categories for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
grant select, insert, update, delete on public.element_categories to authenticated;

-- ---- Elements -----------------------------------------------------------------------

create table if not exists public.elements (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text not null check (length(trim(name)) > 0 and length(name) <= 100),
  category_id  uuid references public.element_categories (id) on delete set null,
  description  text check (length(description) <= 4000),
  status       public.element_status not null default 'needed',
  -- Who looks after it: someone on the project's team. Taking them off the team clears it.
  owner_id     uuid,
  quantity     integer check (quantity between 1 and 100000),
  character_id uuid references public.characters (id) on delete set null,
  location_id  uuid references public.project_locations (id) on delete set null,
  notes        text check (length(notes) <= 4000),
  created_by   uuid default auth.uid() references public.profiles (id) on update cascade on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.project_members (project_id, user_id) on update cascade on delete set null (owner_id)
);
create index if not exists elements_project_idx on public.elements (project_id, lower(name));
create index if not exists elements_character_idx on public.elements (character_id);
create index if not exists elements_location_idx on public.elements (location_id);
create index if not exists elements_category_idx on public.elements (category_id);

-- Stored trimmed, with blanks as null. The project and creator don't change; the
-- category is the project's company's, and the character and location the project's.
create or replace function public.tidy_element()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.name := trim(new.name);
  new.description := nullif(trim(new.description), '');
  new.notes := nullif(trim(new.notes), '');
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if new.category_id is not null
     and (select company_id from element_categories where id = new.category_id) is distinct from project_company(new.project_id) then
    raise exception 'That category belongs to another company';
  end if;
  if new.character_id is not null
     and (select project_id from characters where id = new.character_id) is distinct from new.project_id then
    raise exception 'That character belongs to another project';
  end if;
  if new.location_id is not null
     and (select project_id from project_locations where id = new.location_id) is distinct from new.project_id then
    raise exception 'That location belongs to another project';
  end if;
  return new;
end;
$$;
drop trigger if exists elements_tidy on public.elements;
create trigger elements_tidy before insert or update on public.elements
  for each row execute function public.tidy_element();

alter table public.elements enable row level security;

drop policy if exists elements_select on public.elements;
create policy elements_select on public.elements for select to authenticated
  using (public.can_access_project(project_id));
drop policy if exists elements_insert on public.elements;
create policy elements_insert on public.elements for insert to authenticated
  with check (created_by = auth.uid() and public.can_access_project(project_id));
drop policy if exists elements_update on public.elements;
create policy elements_update on public.elements for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
drop policy if exists elements_delete on public.elements;
create policy elements_delete on public.elements for delete to authenticated
  using (created_by = auth.uid() or public.is_company_admin(public.project_company(project_id)));

grant select, insert, update, delete on public.elements to authenticated;

-- ---- Which elements are in which scenes ----------------------------------------------

create table if not exists public.scene_elements (
  scene_id   uuid not null references public.scenes (id) on delete cascade,
  element_id uuid not null references public.elements (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Anything about it in this scene ("broken by the end of the scene").
  note       text check (length(note) <= 500),
  created_at timestamptz not null default now(),
  primary key (scene_id, element_id)
);
create index if not exists scene_elements_element_idx on public.scene_elements (element_id);
create index if not exists scene_elements_project_idx on public.scene_elements (project_id);

-- A link takes its scene's project, and the element must be on the same project.
create or replace function public.tidy_scene_element()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.scene_id := old.scene_id;
    new.element_id := old.element_id;
    new.created_at := old.created_at;
  end if;
  new.project_id := (select project_id from scenes where id = new.scene_id);
  if (select project_id from elements where id = new.element_id) is distinct from new.project_id then
    raise exception 'That element belongs to another project';
  end if;
  new.note := nullif(trim(new.note), '');
  return new;
end;
$$;
drop trigger if exists scene_elements_tidy on public.scene_elements;
create trigger scene_elements_tidy before insert or update on public.scene_elements
  for each row execute function public.tidy_scene_element();

alter table public.scene_elements enable row level security;

drop policy if exists scene_elements_select on public.scene_elements;
create policy scene_elements_select on public.scene_elements for select to authenticated
  using (public.can_access_project(project_id));
drop policy if exists scene_elements_insert on public.scene_elements;
create policy scene_elements_insert on public.scene_elements for insert to authenticated
  with check (public.can_access_project(public.scene_project(scene_id)));
drop policy if exists scene_elements_update on public.scene_elements;
create policy scene_elements_update on public.scene_elements for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
drop policy if exists scene_elements_delete on public.scene_elements;
create policy scene_elements_delete on public.scene_elements for delete to authenticated
  using (public.can_access_project(project_id));

grant select, insert, update, delete on public.scene_elements to authenticated;

-- How many elements use each category, for the list of categories.
create or replace function public.element_category_usage(cid uuid)
returns table(id uuid, elements bigint) language sql stable security definer set search_path = public as $$
  select c.id, count(e.id) from element_categories c left join elements e on e.category_id = c.id
  where c.company_id = cid and is_company_member(cid) group by c.id;
$$;
revoke all on function public.element_category_usage(uuid) from public, anon;
grant execute on function public.element_category_usage(uuid) to authenticated;

-- ---- Call sheets --------------------------------------------------------------------

-- The elements of a day's scenes, by category (in the company's order) then name, each
-- with its character (and who plays them, so a personal link can put the reader's own
-- first) and the day's scenes it's in, with their notes.
create or replace function public.shoot_day_elements_json(day uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.cat_order nulls last, lower(x.cat), lower(x.name)), '[]')
  from (
    select e.name, c.sort_order as cat_order, c.name as cat,
      jsonb_build_object(
        'id', e.id, 'name', e.name, 'category', c.name, 'quantity', e.quantity, 'description', e.description, 'status', e.status,
        'character', case when ch.id is null then null else jsonb_build_object('id', ch.id, 'name', ch.name, 'cast_number', ch.cast_number, 'actor_id', ch.actor_id) end,
        'scenes', (select jsonb_agg(jsonb_build_object('scene_id', s.id, 'number', s.number, 'note', l.note) order by i.sort_order)
                   from scene_elements l join scenes s on s.id = l.scene_id
                   join shoot_day_items i on i.scene_id = s.id and i.shoot_day_id = day
                   where l.element_id = e.id)) as j
    from elements e
    left join element_categories c on c.id = e.category_id
    left join characters ch on ch.id = e.character_id
    where exists (select 1 from scene_elements l join shoot_day_items i on i.scene_id = l.scene_id and i.shoot_day_id = day where l.element_id = e.id)
  ) x;
$$;
revoke all on function public.shoot_day_elements_json(uuid) from public, anon, authenticated;

-- The same, for the project's own call sheet page (anyone on the project).
create or replace function public.call_sheet_elements(day uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not can_access_project((select project_id from shoot_days where id = day)) then return '[]'; end if;
  return shoot_day_elements_json(day);
end;
$$;
revoke all on function public.call_sheet_elements(uuid) from public, anon;
grant execute on function public.call_sheet_elements(uuid) to authenticated;

-- Personal and shared links list them too.
do $$
declare src text;
  calls_old constant text := $r$    'calls', coalesce((select jsonb_agg(jsonb_build_object($r$;
  calls_new constant text := $r$    'elements', shoot_day_elements_json(d.id),
    'calls', coalesce((select jsonb_agg(jsonb_build_object($r$;
  f text;
begin
  foreach f in array array['call_sheet_for_link(uuid)', 'call_sheet_for_share(uuid)'] loop
    src := pg_get_functiondef(('public.' || f)::regprocedure);
    if position(calls_old in src) = 0 then raise exception '% changed; update the elements migration', f; end if;
    src := replace(src, calls_old, calls_new);
    execute src;
  end loop;
end;
$$;

-- ---- Audit trail ----------------------------------------------------------------------

do $$
declare src text;
begin
  src := pg_get_functiondef('public.audit_row()'::regprocedure);
  src := replace(src, $r$  else
    label := null;
  end case;$r$, $r$  when 'element_categories' then cid := (r->>'company_id')::uuid; label := r->>'name';
  when 'elements' then pid := (r->>'project_id')::uuid; label := r->>'name';
  when 'scene_elements' then
    k := (r->>'scene_id') || ':' || (r->>'element_id'); pid := (r->>'project_id')::uuid;
    ptable := 'elements'; pkey := r->>'element_id';
    label := concat_ws(' in ', (select name from elements where id = (r->>'element_id')::uuid),
      (select 'scene ' || number from scenes where id = (r->>'scene_id')::uuid));
  else
    label := null;
  end case;$r$);
  src := replace(src, $r$ptable in ('tasks', 'scenes', 'journal_entries', 'characters')$r$, $r$ptable in ('tasks', 'scenes', 'journal_entries', 'characters', 'elements')$r$);
  if src not like '%scene_elements%' or src not like '%''characters'', ''elements'')%' then
    raise exception 'audit_row changed; update the elements migration';
  end if;
  execute src;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['element_categories', 'elements', 'scene_elements'] loop
    execute format('drop trigger if exists "Audit change" on public.%I', t);
    execute format('create trigger "Audit change" after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

-- ---- Characters' wardrobe, hair and makeup, and props become elements ------------------

do $$
declare
  ch record;
  f record;
  eid uuid;
begin
  for ch in select * from characters where coalesce(wardrobe, hair_makeup, props) is not null loop
    for f in select * from (values ('Wardrobe', ch.wardrobe, 'wardrobe'), ('Hair & makeup', ch.hair_makeup, 'hair and makeup'), ('Props', ch.props, 'props')) v(cat, body, word)
             where body is not null loop
      insert into elements (project_id, name, category_id, description, character_id, created_by)
      values (ch.project_id, left(ch.name || '''s ' || f.word, 100),
              (select id from element_categories where company_id = project_company(ch.project_id) and lower(name) = lower(f.cat)),
              f.body, ch.id, ch.created_by)
      returning id into eid;
      insert into scene_elements (scene_id, element_id, project_id)
        select scene_id, eid, project_id from scene_characters where character_id = ch.id;
    end loop;
  end loop;
end;
$$;

create or replace function public.tidy_character()
returns trigger language plpgsql as $$
begin
  new.name := trim(new.name);
  new.description := nullif(trim(new.description), '');
  new.age_range := nullif(trim(new.age_range), '');
  new.gender := nullif(trim(new.gender), '');
  new.traits := nullif(trim(new.traits), '');
  new.continuity := nullif(trim(new.continuity), '');
  if tg_op = 'INSERT' then
    if new.actor_id is not null and new.casting_status = 'open' then new.casting_status := 'cast'; end if;
  else
    new.project_id := old.project_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
    if new.actor_id is not null and old.actor_id is null
       and new.casting_status = old.casting_status and new.casting_status <> 'cast' then
      new.casting_status := 'cast';
    end if;
  end if;
  return new;
end;
$$;

alter table public.characters drop column if exists wardrobe, drop column if exists hair_makeup, drop column if exists props;
