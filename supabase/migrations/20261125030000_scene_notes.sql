-- Scene notes: like task notes, a scene can have any number of notes, kept apart
-- from its details and shot list. Everyone on the project reads and adds them; only
-- a note's author edits it, and the author or a company admin deletes it.
create table if not exists public.scene_notes (
  id         uuid primary key default gen_random_uuid(),
  scene_id   uuid not null references public.scenes (id) on delete cascade,
  author_id  uuid not null default auth.uid() references public.profiles (id) on update cascade on delete cascade,
  body       text not null check (length(trim(body)) > 0 and length(body) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scene_notes_scene_idx on public.scene_notes (scene_id, created_at);

create or replace function public.scene_project(sid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select project_id from scenes where id = sid;
$$;

-- Stored trimmed; the author and scene can't be changed afterwards.
create or replace function public.tidy_scene_note()
returns trigger language plpgsql as $$
begin
  new.body := trim(new.body);
  if tg_op = 'UPDATE' then
    new.author_id := old.author_id;
    new.scene_id := old.scene_id;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists scene_notes_tidy on public.scene_notes;
create trigger scene_notes_tidy
  before insert or update on public.scene_notes
  for each row execute function public.tidy_scene_note();

alter table public.scene_notes enable row level security;

drop policy if exists scene_notes_select on public.scene_notes;
create policy scene_notes_select on public.scene_notes for select to authenticated
  using (public.can_access_project(public.scene_project(scene_id)));

drop policy if exists scene_notes_insert on public.scene_notes;
create policy scene_notes_insert on public.scene_notes for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_project(public.scene_project(scene_id)));

drop policy if exists scene_notes_update on public.scene_notes;
create policy scene_notes_update on public.scene_notes for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists scene_notes_delete on public.scene_notes;
create policy scene_notes_delete on public.scene_notes for delete to authenticated
  using (author_id = auth.uid() or public.is_company_admin(public.project_company(public.scene_project(scene_id))));

grant select, insert, update, delete on public.scene_notes to authenticated;
