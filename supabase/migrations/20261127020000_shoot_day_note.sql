-- A note under a shoot day's title, kept apart from the day's call sheet notes.
-- It is edited on the day's details, shown on the call sheet under the title, and
-- listed on Project notes. Who last wrote it is recorded; clearing it clears that.
-- Taking the note off a day leaves the call sheet notes as they are.

alter table public.shoot_days
  add column if not exists note text check (length(note) <= 2000),
  add column if not exists title_note_by uuid references public.profiles (id) on update cascade on delete set null,
  add column if not exists title_note_at timestamptz;

create or replace function public.tidy_shoot_day()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.title := nullif(trim(new.title), '');
  new.weather := nullif(trim(new.weather), '');
  new.notes := nullif(trim(new.notes), '');
  new.note := nullif(trim(new.note), '');
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

-- Stamps who wrote the note under the title. Runs after tidy (name order), so a
-- blank note is already null. title_note_by and title_note_at can't be set by hand.
-- The day's call sheet notes keep their own writer (note_by / note_at).
create or replace function public.stamp_title_note()
returns trigger language plpgsql as $$
begin
  if new.note is null then
    new.title_note_by := null;
    new.title_note_at := null;
  elsif tg_op = 'INSERT' or new.note is distinct from old.note then
    new.title_note_by := coalesce(auth.uid(), case when tg_op = 'UPDATE' then old.title_note_by end);
    new.title_note_at := now();
  else
    new.title_note_by := old.title_note_by;
    new.title_note_at := old.title_note_at;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_shoot_days_title_note on public.shoot_days;
create trigger zz_shoot_days_title_note before insert or update on public.shoot_days
  for each row execute function public.stamp_title_note();

-- The personal and shared call sheets include the note on the day.
do $$
declare src text; f text;
  old_title constant text := $r$'title', d.title,$r$;
  new_title constant text := $r$'title', d.title, 'note', d.note,$r$;
begin
  foreach f in array array['call_sheet_for_link(uuid)', 'call_sheet_for_share(uuid)'] loop
    src := pg_get_functiondef(('public.' || f)::regprocedure);
    if (length(src) - length(replace(src, old_title, ''))) / length(old_title) <> 1 then
      raise exception '% changed; update the shoot day note migration', f;
    end if;
    execute replace(src, old_title, new_title);
  end loop;
end;
$$;

-- A new column needs its grant; the shared link code stays hidden.
select public.hide_share_token();
