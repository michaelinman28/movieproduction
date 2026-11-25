-- Characters: the people in the story, per project. Each has the basics (name, cast
-- number, type, description, age range, gender, traits and arc), casting (status, and
-- the actor, stand-in and stunt double from the project's team), look and continuity
-- (wardrobe, hair and makeup, props, continuity), the scenes they're in, and notes.
--
-- * A character is linked to scenes through scene_characters, one link that both the
--   scene and the character show and edit. A link can carry a look note for that
--   scene ("jacket torn, mud on face").
-- * scenes.characters (text) stays, kept in step with the links, so call sheets and
--   everything that already reads it keep working. Writing names to it (e.g. from
--   the scenes table) links those characters, adding any the project doesn't have yet.
-- * Everyone on the project (and company admins) sees, adds and edits characters and
--   links; whoever added a character, or a company admin, deletes it. Character notes
--   follow the scene notes rules.
-- * No photos.

do $$ begin
  create type public.character_kind as enum ('lead', 'supporting', 'day_player', 'background');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.casting_status as enum ('open', 'auditioning', 'offered', 'cast');
exception when duplicate_object then null; end $$;

create table if not exists public.characters (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects (id) on delete cascade,
  name           text not null check (length(trim(name)) > 0 and length(name) <= 100 and position(',' in name) = 0),
  -- The cast number used on call sheets and in the breakdown: 1 is usually the lead.
  cast_number    integer check (cast_number between 1 and 9999),
  kind           public.character_kind,
  description    text check (length(description) <= 2000),
  age_range      text check (length(age_range) <= 40),
  gender         text check (length(gender) <= 40),
  traits         text check (length(traits) <= 4000),
  casting_status public.casting_status not null default 'open',
  -- The actor, stand-in and stunt double are people on the project's team. Taking
  -- someone off the team clears them here.
  actor_id       uuid,
  stand_in_id    uuid,
  double_id      uuid,
  wardrobe       text check (length(wardrobe) <= 4000),
  hair_makeup    text check (length(hair_makeup) <= 4000),
  props          text check (length(props) <= 4000),
  continuity     text check (length(continuity) <= 4000),
  created_by     uuid default auth.uid() references public.profiles (id) on update cascade on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (project_id, actor_id) references public.project_members (project_id, user_id) on update cascade on delete set null (actor_id),
  foreign key (project_id, stand_in_id) references public.project_members (project_id, user_id) on update cascade on delete set null (stand_in_id),
  foreign key (project_id, double_id) references public.project_members (project_id, user_id) on update cascade on delete set null (double_id)
);

create unique index if not exists characters_name_key on public.characters (project_id, lower(name));
create unique index if not exists characters_cast_number_key on public.characters (project_id, cast_number) where cast_number is not null;
create index if not exists characters_actor_idx on public.characters (project_id, actor_id);

-- Stored trimmed, with blanks as null. Picking an actor for a character that isn't
-- cast yet marks it cast (unless the status is being set in the same change).
create or replace function public.tidy_character()
returns trigger language plpgsql as $$
begin
  new.name := trim(new.name);
  new.description := nullif(trim(new.description), '');
  new.age_range := nullif(trim(new.age_range), '');
  new.gender := nullif(trim(new.gender), '');
  new.traits := nullif(trim(new.traits), '');
  new.wardrobe := nullif(trim(new.wardrobe), '');
  new.hair_makeup := nullif(trim(new.hair_makeup), '');
  new.props := nullif(trim(new.props), '');
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
drop trigger if exists characters_tidy on public.characters;
create trigger characters_tidy before insert or update on public.characters
  for each row execute function public.tidy_character();

alter table public.characters enable row level security;

drop policy if exists characters_select on public.characters;
create policy characters_select on public.characters for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists characters_insert on public.characters;
create policy characters_insert on public.characters for insert to authenticated
  with check (created_by = auth.uid() and public.can_access_project(project_id));

drop policy if exists characters_update on public.characters;
create policy characters_update on public.characters for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

drop policy if exists characters_delete on public.characters;
create policy characters_delete on public.characters for delete to authenticated
  using (created_by = auth.uid() or public.is_company_admin(public.project_company(project_id)));

grant select, insert, update, delete on public.characters to authenticated;

create or replace function public.character_project(cid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from characters where id = cid;
$$;

-- ---- Which characters are in which scenes ---------------------------------------

create table if not exists public.scene_characters (
  scene_id     uuid not null references public.scenes (id) on delete cascade,
  character_id uuid not null references public.characters (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  -- How they look in this scene, for wardrobe, hair and makeup and continuity.
  look_note    text check (length(look_note) <= 1000),
  created_at   timestamptz not null default now(),
  primary key (scene_id, character_id)
);
create index if not exists scene_characters_character_idx on public.scene_characters (character_id);
create index if not exists scene_characters_project_idx on public.scene_characters (project_id);

-- A link takes its scene's project, and the character must be on the same project.
create or replace function public.tidy_scene_character()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.scene_id := old.scene_id;
    new.character_id := old.character_id;
    new.created_at := old.created_at;
  end if;
  new.project_id := (select project_id from scenes where id = new.scene_id);
  if (select project_id from characters where id = new.character_id) is distinct from new.project_id then
    raise exception 'That character belongs to another project';
  end if;
  new.look_note := nullif(trim(new.look_note), '');
  return new;
end;
$$;
drop trigger if exists scene_characters_tidy on public.scene_characters;
create trigger scene_characters_tidy before insert or update on public.scene_characters
  for each row execute function public.tidy_scene_character();

alter table public.scene_characters enable row level security;

drop policy if exists scene_characters_select on public.scene_characters;
create policy scene_characters_select on public.scene_characters for select to authenticated
  using (public.can_access_project(project_id));

drop policy if exists scene_characters_insert on public.scene_characters;
create policy scene_characters_insert on public.scene_characters for insert to authenticated
  with check (public.can_access_project(public.scene_project(scene_id)));

drop policy if exists scene_characters_update on public.scene_characters;
create policy scene_characters_update on public.scene_characters for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

drop policy if exists scene_characters_delete on public.scene_characters;
create policy scene_characters_delete on public.scene_characters for delete to authenticated
  using (public.can_access_project(project_id));

grant select, insert, update, delete on public.scene_characters to authenticated;

-- ---- Keeping scenes.characters in step ------------------------------------------

-- Write the scene's character names (by cast number, then name) to scenes.characters.
create or replace function public.sync_scene_characters(sid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare names text;
begin
  select string_agg(c.name, ', ' order by c.cast_number nulls last, lower(c.name)) into names
  from scene_characters l join characters c on c.id = l.character_id where l.scene_id = sid;
  perform set_config('mp.scene_characters', 'on', true);
  update scenes set characters = names where id = sid and characters is distinct from names;
  perform set_config('mp.scene_characters', '', true);
end;
$$;
revoke all on function public.sync_scene_characters(uuid) from public, anon, authenticated;

-- Names written to scenes.characters (comma-separated) become the scene's links:
-- characters the project doesn't have yet are added (by whoever wrote the names),
-- links to names no longer listed are removed, and look notes on kept links stay.
-- Only someone allowed to change the scene gets this far, and it stays inside the
-- scene's project.
create or replace function public.link_scene_character_names(sid uuid, pid uuid, names text)
returns void language plpgsql security definer set search_path = public as $$
declare
  wanted text[];
  n text;
  ids uuid[] := '{}';
  cid uuid;
begin
  select coalesce(array_agg(distinct trim(x)), '{}') into wanted
  from unnest(string_to_array(coalesce(names, ''), ',')) x where trim(x) <> '';
  foreach n in array wanted loop
    select id into cid from characters where project_id = pid and lower(name) = lower(n);
    if cid is null then
      insert into characters (project_id, name) values (pid, left(n, 100)) returning id into cid;
    end if;
    ids := ids || cid;
  end loop;
  delete from scene_characters where scene_id = sid and not (character_id = any (ids));
  insert into scene_characters (scene_id, character_id, project_id)
    select sid, x, pid from unnest(ids) x
    on conflict (scene_id, character_id) do nothing;
  perform sync_scene_characters(sid);
end;
$$;
revoke all on function public.link_scene_character_names(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.scene_characters_from_text()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('mp.scene_characters', true), '') = 'on' then return null; end if;
  if tg_op = 'UPDATE' and new.characters is not distinct from old.characters then return null; end if;
  perform link_scene_character_names(new.id, new.project_id, new.characters);
  return null;
end;
$$;
drop trigger if exists scenes_characters_text on public.scenes;
create trigger scenes_characters_text after insert or update of characters on public.scenes
  for each row execute function public.scene_characters_from_text();

-- A link added or removed, or a character renamed or renumbered, updates the scenes' names.
create or replace function public.scene_character_changed()
returns trigger language plpgsql security definer set search_path = public as $$
declare s uuid;
begin
  if tg_table_name = 'scene_characters' then
    if tg_op = 'UPDATE' then return null; end if;  -- only the look note changes
    perform sync_scene_characters(case when tg_op = 'DELETE' then old.scene_id else new.scene_id end);
  elsif tg_op = 'UPDATE' and (new.name is distinct from old.name or new.cast_number is distinct from old.cast_number) then
    for s in select scene_id from scene_characters where character_id = new.id loop
      perform sync_scene_characters(s);
    end loop;
  end if;
  return null;
end;
$$;
drop trigger if exists scene_characters_sync on public.scene_characters;
create trigger scene_characters_sync after insert or update or delete on public.scene_characters
  for each row execute function public.scene_character_changed();
drop trigger if exists characters_sync on public.characters;
create trigger characters_sync after update on public.characters
  for each row execute function public.scene_character_changed();

-- ---- Character notes -----------------------------------------------------------

create table if not exists public.character_notes (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters (id) on delete cascade,
  author_id    uuid not null default auth.uid() references public.profiles (id) on update cascade on delete cascade,
  body         text not null check (length(trim(body)) > 0 and length(body) <= 5000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists character_notes_character_idx on public.character_notes (character_id, created_at);

create or replace function public.tidy_character_note()
returns trigger language plpgsql as $$
begin
  new.body := trim(new.body);
  if tg_op = 'UPDATE' then
    new.author_id := old.author_id;
    new.character_id := old.character_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists character_notes_tidy on public.character_notes;
create trigger character_notes_tidy before insert or update on public.character_notes
  for each row execute function public.tidy_character_note();

alter table public.character_notes enable row level security;

drop policy if exists character_notes_select on public.character_notes;
create policy character_notes_select on public.character_notes for select to authenticated
  using (public.can_access_project(public.character_project(character_id)));

drop policy if exists character_notes_insert on public.character_notes;
create policy character_notes_insert on public.character_notes for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_project(public.character_project(character_id)));

drop policy if exists character_notes_update on public.character_notes;
create policy character_notes_update on public.character_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists character_notes_delete on public.character_notes;
create policy character_notes_delete on public.character_notes for delete to authenticated
  using (author_id = auth.uid() or public.is_company_admin(public.project_company(public.character_project(character_id))));

grant select, insert, update, delete on public.character_notes to authenticated;

-- ---- Audit trail -----------------------------------------------------------------

do $$
declare src text;
begin
  src := pg_get_functiondef('public.audit_row()'::regprocedure);
  src := replace(src, $r$  else
    label := null;
  end case;$r$, $r$  when 'characters' then pid := (r->>'project_id')::uuid; label := r->>'name';
  when 'scene_characters' then
    k := (r->>'scene_id') || ':' || (r->>'character_id'); pid := (r->>'project_id')::uuid;
    ptable := 'characters'; pkey := r->>'character_id';
    label := concat_ws(' in ', (select name from characters where id = (r->>'character_id')::uuid),
      (select 'scene ' || number from scenes where id = (r->>'scene_id')::uuid));
  when 'character_notes' then
    ptable := 'characters'; pkey := r->>'character_id'; label := left(r->>'body', 80); pid := character_project(pkey::uuid);
  else
    label := null;
  end case;$r$);
  src := replace(src, $r$ptable in ('tasks', 'scenes', 'journal_entries')$r$, $r$ptable in ('tasks', 'scenes', 'journal_entries', 'characters')$r$);
  if src not like '%character_notes%' or src not like '%''journal_entries'', ''characters''%' then
    raise exception 'audit_row changed; update the characters migration';
  end if;
  execute src;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['characters', 'scene_characters', 'character_notes'] loop
    execute format('drop trigger if exists "Audit change" on public.%I', t);
    execute format('create trigger "Audit change" after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

-- ---- Existing scenes -------------------------------------------------------------

-- Turn the names already typed in each scene's Characters into characters and links.
select public.link_scene_character_names(id, project_id, characters) from public.scenes where characters is not null;
