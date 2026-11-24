-- Company admins look after the people in their company:
--  * an admin can change a member's name and phone (on their profile);
--  * an admin (or the person) can add more email addresses and phone numbers;
--  * only the person changes their own sign-in email (through sign-in, which keeps
--    profiles.email in step); nobody edits profiles.email directly.

-- Whether the signed-in user is an admin of a company that `other` belongs to.
create or replace function public.is_admin_of_person(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from company_members a
    join company_members b on b.company_id = a.company_id
    where a.user_id = auth.uid() and a.is_admin and b.user_id = other);
$$;

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin_of_person(id))
  with check (id = auth.uid() or public.is_admin_of_person(id));

-- Signed-in people (you, or an admin) change only the name and phone. The sign-in
-- email is copied over by sync_profile_email (which runs as the table owner).
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
  new.phone := nullif(trim(new.phone), '');
  return new;
end;
$$;

drop trigger if exists guard_profile_update on public.profiles;
create trigger guard_profile_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- More ways to reach someone: extra email addresses and phone numbers, each with an
-- optional label such as Work or Home. Seen by the same people who see the profile.
create type public.contact_kind as enum ('email', 'phone');

create table public.person_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.contact_kind not null,
  value      text not null,
  label      text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint person_contacts_value check (length(value) between 3 and 254),
  constraint person_contacts_label check (label is null or length(label) <= 40),
  constraint person_contacts_email check (kind <> 'email' or value ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
create unique index person_contacts_unique on public.person_contacts (user_id, kind, lower(value));
create index person_contacts_user on public.person_contacts (user_id);

create or replace function public.tidy_person_contact()
returns trigger language plpgsql set search_path = public as $$
begin
  new.value := trim(new.value);
  if new.kind = 'email' then new.value := lower(new.value); end if;
  new.label := nullif(trim(new.label), '');
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

create trigger tidy_person_contact
  before insert or update on public.person_contacts
  for each row execute function public.tidy_person_contact();

alter table public.person_contacts enable row level security;

create policy person_contacts_select on public.person_contacts for select to authenticated
  using (user_id = auth.uid() or public.shares_company_with(user_id));
create policy person_contacts_insert on public.person_contacts for insert to authenticated
  with check (user_id = auth.uid() or public.is_admin_of_person(user_id));
create policy person_contacts_update on public.person_contacts for update to authenticated
  using (user_id = auth.uid() or public.is_admin_of_person(user_id))
  with check (user_id = auth.uid() or public.is_admin_of_person(user_id));
create policy person_contacts_delete on public.person_contacts for delete to authenticated
  using (user_id = auth.uid() or public.is_admin_of_person(user_id));

revoke execute on function public.is_admin_of_person(uuid) from public, anon;
grant execute on function public.is_admin_of_person(uuid) to authenticated;
grant select, insert, update, delete on public.person_contacts to authenticated;
