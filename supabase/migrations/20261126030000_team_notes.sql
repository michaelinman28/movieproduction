-- Dietary needs and team member notes, per project.
--
-- * Each person on a project has their dietary needs (free text) and whether it's an
--   allergy, kept on their project membership. Company admins and the person change
--   it (set_dietary); everyone on the project can see it, since catering needs it for
--   the call sheet. The public shared call sheet link never shows it, and a personal
--   link shows only that person's own.
-- * Team member notes: dated notes about a person on a project, each with a note type
--   from the company's list (admins manage the list; a few starter types are added).
--   Only company admins and the person a note is about can see it. Admins add notes
--   about anyone on the project; a person can add notes about themselves. Only the
--   author edits a note; the author or an admin deletes it.

alter table public.project_members
  add column if not exists dietary text check (length(dietary) <= 500),
  add column if not exists dietary_allergy boolean not null default false;

-- Company admins, or the person themselves, set their dietary needs on a project.
create or replace function public.set_dietary(project uuid, person uuid, needs text, allergy boolean)
returns void language plpgsql security definer set search_path = public as $$
declare n text := nullif(trim(needs), '');
begin
  if not (is_company_admin(project_company(project)) or (person = auth.uid() and is_project_member(project))) then
    raise exception 'Only an admin or the person themselves can change this' using errcode = '42501';
  end if;
  update project_members set dietary = n, dietary_allergy = coalesce(allergy, false) and n is not null
  where project_id = project and user_id = person;
  if not found then raise exception 'They are not on this project'; end if;
end;
$$;
revoke all on function public.set_dietary(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.set_dietary(uuid, uuid, text, boolean) to authenticated;

-- ---- Note types ------------------------------------------------------------------

create table if not exists public.team_note_types (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 40),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists team_note_types_name_idx on public.team_note_types (company_id, lower(name));

drop trigger if exists team_note_types_tidy on public.team_note_types;
create trigger team_note_types_tidy before insert or update on public.team_note_types
  for each row execute function public.tidy_name();

create or replace function public.seed_team_note_types(cid uuid)
returns void language sql security definer set search_path = public as $$
  insert into team_note_types (company_id, name, sort_order)
  select cid, n, i from unnest(array['General', 'Availability', 'Travel', 'Accommodation', 'Wardrobe sizes', 'Medical', 'Contract'])
    with ordinality as t(n, i)
  on conflict do nothing;
$$;
revoke execute on function public.seed_team_note_types(uuid) from public, anon, authenticated;

create or replace function public.on_company_created_note_types()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_team_note_types(new.id);
  return new;
end;
$$;
drop trigger if exists companies_seed_note_types on public.companies;
create trigger companies_seed_note_types after insert on public.companies
  for each row execute function public.on_company_created_note_types();

select public.seed_team_note_types(id) from public.companies
 where not exists (select 1 from public.team_note_types t where t.company_id = companies.id);

alter table public.team_note_types enable row level security;
drop policy if exists team_note_types_select on public.team_note_types;
create policy team_note_types_select on public.team_note_types for select to authenticated
  using (public.is_company_member(company_id));
drop policy if exists team_note_types_write on public.team_note_types;
create policy team_note_types_write on public.team_note_types for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
grant select, insert, update, delete on public.team_note_types to authenticated;

-- ---- Team member notes ----------------------------------------------------------

create table if not exists public.team_notes (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  user_id    uuid not null,  -- who the note is about
  type_id    uuid references public.team_note_types (id) on delete set null,
  author_id  uuid not null default auth.uid() references public.profiles (id) on update cascade on delete cascade,
  body       text not null check (length(trim(body)) > 0 and length(body) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Taking someone off the project removes the notes about them there.
  foreign key (project_id, user_id) references public.project_members (project_id, user_id) on update cascade on delete cascade
);
create index if not exists team_notes_member_idx on public.team_notes (project_id, user_id, created_at);

-- Stored trimmed; who and what it's about can't change. The type must be the company's.
create or replace function public.tidy_team_note()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.body := trim(new.body);
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id;
    new.user_id := old.user_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  if new.type_id is not null and (select company_id from team_note_types where id = new.type_id) is distinct from project_company(new.project_id) then
    raise exception 'That note type belongs to another company';
  end if;
  return new;
end;
$$;
drop trigger if exists team_notes_tidy on public.team_notes;
create trigger team_notes_tidy before insert or update on public.team_notes
  for each row execute function public.tidy_team_note();

alter table public.team_notes enable row level security;

drop policy if exists team_notes_select on public.team_notes;
create policy team_notes_select on public.team_notes for select to authenticated
  using (public.is_company_admin(public.project_company(project_id)) or user_id = auth.uid());

drop policy if exists team_notes_insert on public.team_notes;
create policy team_notes_insert on public.team_notes for insert to authenticated
  with check (author_id = auth.uid()
    and (public.is_company_admin(public.project_company(project_id)) or user_id = auth.uid()));

drop policy if exists team_notes_update on public.team_notes;
create policy team_notes_update on public.team_notes for update to authenticated
  using (author_id = auth.uid() and (public.is_company_admin(public.project_company(project_id)) or user_id = auth.uid()))
  with check (author_id = auth.uid());

drop policy if exists team_notes_delete on public.team_notes;
create policy team_notes_delete on public.team_notes for delete to authenticated
  using (author_id = auth.uid() or public.is_company_admin(public.project_company(project_id)));

grant select, insert, update, delete on public.team_notes to authenticated;

-- How many notes use each type, for the list of types.
create or replace function public.team_note_type_usage(cid uuid)
returns table(id uuid, notes bigint) language sql stable security definer set search_path = public as $$
  select t.id, count(n.id) from team_note_types t left join team_notes n on n.type_id = t.id
  where t.company_id = cid and is_company_admin(cid) group by t.id;
$$;
revoke all on function public.team_note_type_usage(uuid) from public, anon;
grant execute on function public.team_note_type_usage(uuid) to authenticated;

-- ---- Call sheets: characters and dietary needs -----------------------------------

-- Each call on the personal and shared links lists the characters that person plays.
-- The personal link also has the reader's own dietary needs; the shared link never does.
do $$
declare src text;
  calls_old constant text := $r$'pickup_time', c.pickup_time, 'makeup_time', c.makeup_time, 'note', c.note,$r$;
  chars constant text := $r$'pickup_time', c.pickup_time, 'makeup_time', c.makeup_time, 'note', c.note,
                         'characters', coalesce((select jsonb_agg(jsonb_build_object('name', ch.name, 'cast_number', ch.cast_number)
                                                   order by ch.cast_number nulls last, lower(ch.name))
                                                 from characters ch where ch.project_id = c.project_id and ch.actor_id = c.user_id), '[]'),$r$;
begin
  src := pg_get_functiondef('public.call_sheet_for_link(uuid)'::regprocedure);
  if position(calls_old in src) = 0 then raise exception 'call_sheet_for_link changed; update the team notes migration'; end if;
  src := replace(src, calls_old, chars || $r$
                         'dietary', case when c.user_id = me.user_id then
                           (select jsonb_build_object('needs', m.dietary, 'allergy', m.dietary_allergy) from project_members m
                            where m.project_id = c.project_id and m.user_id = c.user_id and m.dietary is not null) end,$r$);
  execute src;

  src := pg_get_functiondef('public.call_sheet_for_share(uuid)'::regprocedure);
  if position(calls_old in src) = 0 then raise exception 'call_sheet_for_share changed; update the team notes migration'; end if;
  src := replace(src, calls_old, chars);
  execute src;
end;
$$;

-- ---- Audit trail -----------------------------------------------------------------

do $$
declare src text;
begin
  src := pg_get_functiondef('public.audit_row()'::regprocedure);
  src := replace(src, $r$  else
    label := null;
  end case;$r$, $r$  when 'team_note_types' then cid := (r->>'company_id')::uuid; label := r->>'name';
  when 'team_notes' then
    pid := (r->>'project_id')::uuid; subj := (r->>'user_id')::uuid; ptable := 'project_members'; pkey := r->>'user_id';
    label := concat_ws(': ', audit_person_name(subj), left(r->>'body', 80));
  else
    label := null;
  end case;$r$);
  if src not like '%team_note_types%' then raise exception 'audit_row changed; update the team notes migration'; end if;
  execute src;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['team_note_types', 'team_notes'] loop
    execute format('drop trigger if exists "Audit change" on public.%I', t);
    execute format('create trigger "Audit change" after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end;
$$;
