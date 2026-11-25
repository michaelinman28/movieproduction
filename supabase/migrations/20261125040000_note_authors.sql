-- Who wrote a note kept in a field, and when: a shot's Notes, a shoot day's Notes, a
-- note in a day's schedule (its label) and the note on someone's call. Each records
-- the person who last set or changed the note (note_by) and when (note_at), so the
-- Project notes page can show them. Clearing the note clears both.

alter table public.shots           add column if not exists note_by uuid references public.profiles (id) on update cascade on delete set null,
                                   add column if not exists note_at timestamptz;
alter table public.shoot_days      add column if not exists note_by uuid references public.profiles (id) on update cascade on delete set null,
                                   add column if not exists note_at timestamptz;
alter table public.shoot_day_items add column if not exists note_by uuid references public.profiles (id) on update cascade on delete set null,
                                   add column if not exists note_at timestamptz;
alter table public.shoot_day_calls add column if not exists note_by uuid references public.profiles (id) on update cascade on delete set null,
                                   add column if not exists note_at timestamptz;

-- Stamps note_by/note_at when the column named in the trigger's argument changes. On
-- schedule items only notes count (a meal break's or move's label isn't a note). It
-- runs after each table's tidy trigger (triggers fire in name order), so a blank note
-- has already become null. note_by and note_at can't be set by hand.
create or replace function public.stamp_note_author()
returns trigger language plpgsql as $$
declare
  col text := tg_argv[0];
  now_note text := to_jsonb(new) ->> col;
  was_note text := case when tg_op = 'UPDATE' then to_jsonb(old) ->> col end;
  counts boolean := tg_table_name <> 'shoot_day_items' or (to_jsonb(new) ->> 'kind') = 'note';
begin
  if not counts or now_note is null then
    new.note_by := null;
    new.note_at := null;
  elsif tg_op = 'INSERT' or now_note is distinct from was_note then
    new.note_by := coalesce(auth.uid(), case when tg_op = 'UPDATE' then old.note_by end);
    new.note_at := now();
  else
    new.note_by := old.note_by;
    new.note_at := old.note_at;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_shots_note_author on public.shots;
create trigger zz_shots_note_author before insert or update on public.shots
  for each row execute function public.stamp_note_author('notes');
drop trigger if exists zz_shoot_days_note_author on public.shoot_days;
create trigger zz_shoot_days_note_author before insert or update on public.shoot_days
  for each row execute function public.stamp_note_author('notes');
drop trigger if exists zz_shoot_day_items_note_author on public.shoot_day_items;
create trigger zz_shoot_day_items_note_author before insert or update on public.shoot_day_items
  for each row execute function public.stamp_note_author('label');
drop trigger if exists zz_shoot_day_calls_note_author on public.shoot_day_calls;
create trigger zz_shoot_day_calls_note_author before insert or update on public.shoot_day_calls
  for each row execute function public.stamp_note_author('note');

-- Notes written before this change: shots and shoot days take whoever added them (the
-- best guess there is); schedule and call notes don't know who wrote them.
alter table public.shots disable trigger zz_shots_note_author;
update public.shots set note_by = created_by, note_at = updated_at where notes is not null and note_at is null;
alter table public.shots enable trigger zz_shots_note_author;
alter table public.shoot_days disable trigger zz_shoot_days_note_author;
update public.shoot_days set note_by = created_by, note_at = updated_at where notes is not null and note_at is null;
alter table public.shoot_days enable trigger zz_shoot_days_note_author;
alter table public.shoot_day_items disable trigger zz_shoot_day_items_note_author;
update public.shoot_day_items set note_at = created_at where kind = 'note' and note_at is null;
alter table public.shoot_day_items enable trigger zz_shoot_day_items_note_author;
alter table public.shoot_day_calls disable trigger zz_shoot_day_calls_note_author;
update public.shoot_day_calls set note_at = created_at where note is not null and note_at is null;
alter table public.shoot_day_calls enable trigger zz_shoot_day_calls_note_author;
