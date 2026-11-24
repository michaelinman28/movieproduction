-- A nickname on each person, e.g. "Tash". Seen and edited by the same people as
-- their name: themselves, and admins of a company they're in.

alter table public.profiles
  add column nickname text check (nickname is null or length(nickname) <= 60);

-- Same rules as before; also tidies the nickname.
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.email is distinct from old.email then
      raise exception 'Your email is your sign-in. Change it on your profile, and confirm it from the email we send.';
    end if;
    if new.id <> old.id or new.created_at <> old.created_at then
      raise exception 'That can''t be changed';
    end if;
    if new.avatar_url is distinct from old.avatar_url and old.id <> auth.uid() then
      raise exception 'Only the person can change their picture';
    end if;
  end if;
  new.full_name := nullif(trim(new.full_name), '');
  new.nickname := nullif(trim(new.nickname), '');
  new.phone := nullif(trim(new.phone), '');
  return new;
end;
$$;
