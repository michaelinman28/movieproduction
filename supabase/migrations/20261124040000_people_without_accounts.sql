-- People without an account yet.
--
-- An admin can add someone by name and email (and phone) before they have signed up.
-- They get a profile straight away (has_account = false), so they can be put on
-- projects and given tasks. When someone signs up with that email and confirms it,
-- the waiting profile becomes theirs: everything it was given (companies, projects,
-- roles, tasks) moves to their account.

alter table public.profiles add column has_account boolean not null default true;

-- A profile no longer has to match a sign-in account. Deleting an account still
-- deletes its profile.
alter table public.profiles drop constraint if exists profiles_id_fkey;

create or replace function public.delete_profile_for_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from profiles where id = old.id;
  return old;
end;
$$;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.delete_profile_for_user();

-- One waiting profile per email.
create unique index profiles_pending_email on public.profiles (lower(email)) where not has_account;

-- When a waiting profile is claimed its id changes to the account's id, so every
-- link to a person (or to their company / project membership) follows it.
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid in ('public.profiles'::regclass, 'public.company_members'::regclass, 'public.project_members'::regclass)
      and c.confupdtype <> 'c'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s on update cascade', r.tbl, r.conname, r.def);
  end loop;
end;
$$;

-- Profile rules: as before, plus an admin can correct a waiting person's email
-- (it must be a valid address), and nobody changes has_account directly.
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.email is distinct from old.email then
      if old.has_account then
        raise exception 'Your email is your sign-in. Change it on your profile, and confirm it from the email we send.';
      end if;
      new.email := public.check_email(new.email);
      if new.email is null then raise exception 'An email is needed, so they can be invited'; end if;
    end if;
    if new.id <> old.id or new.created_at <> old.created_at or new.has_account <> old.has_account then
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

-- Give a waiting profile to the account with the same (confirmed) email.
create or replace function public.claim_pending_profile(uid uuid, address text)
returns void language plpgsql security definer set search_path = public as $$
declare
  waiting profiles%rowtype;
  fresh profiles%rowtype;
begin
  if address is null then return; end if;
  select * into waiting from profiles where not has_account and lower(email) = lower(address) limit 1;
  if not found then return; end if;
  select * into fresh from profiles where id = uid;
  -- An account that is already in a company keeps its own profile.
  if exists (select 1 from company_members where user_id = uid) then return; end if;
  delete from profiles where id = uid;
  update profiles set
    id = uid,
    has_account = true,
    email = address,
    full_name = coalesce(nullif(trim(fresh.full_name), ''), waiting.full_name),
    phone = coalesce(fresh.phone, waiting.phone)
  where id = waiting.id;
end;
$$;
revoke execute on function public.claim_pending_profile(uuid, text) from public, anon, authenticated;

-- New accounts: as before (name and phone from sign-up), then claim a waiting
-- profile if the email is already confirmed.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  );
  if new.email_confirmed_at is not null then
    perform public.claim_pending_profile(new.id, new.email);
  end if;
  return new;
end;
$$;

-- Confirming an email (on sign-up, or a changed sign-in email) claims a waiting profile.
create or replace function public.claim_on_confirm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.claim_pending_profile(new.id, new.email);
  return new;
end;
$$;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at, email on auth.users
  for each row when (new.email_confirmed_at is not null
    and (old.email_confirmed_at is null or old.email is distinct from new.email))
  execute function public.claim_on_confirm();

-- Add someone to a company by email. If nobody has an account with that email,
-- a waiting profile is made from the name (and phone) given. Returns the person's
-- id and 'added', 'already_member' or 'invited'.
create or replace function public.add_company_person(
  cid uuid, member_email text, member_name text default null, member_phone text default null,
  make_admin boolean default false, member_title text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  clean text;
  uid uuid;
  result text := 'added';
begin
  if not public.is_company_admin(cid) then
    raise exception 'Only company admins can add people';
  end if;
  clean := public.check_email(member_email);
  if clean is null then raise exception 'Enter their email address'; end if;

  select u.id into uid
  from auth.users u join profiles p on p.id = u.id
  where lower(u.email) = clean and u.email_confirmed_at is not null
  limit 1;

  if uid is null then
    select id into uid from profiles where not has_account and lower(email) = clean;
    if uid is null then
      if nullif(trim(member_name), '') is null then
        raise exception 'No account uses % yet. Add their name too, and they''ll join when they sign up with that email.', clean;
      end if;
      insert into profiles (id, full_name, email, phone, has_account)
      values (gen_random_uuid(), trim(member_name), clean, public.format_phone(member_phone), false)
      returning id into uid;
    end if;
    result := 'invited';
  end if;

  if exists (select 1 from company_members where company_id = cid and user_id = uid) then
    return jsonb_build_object('user_id', uid, 'result', 'already_member');
  end if;

  insert into company_members (company_id, user_id, is_admin, title)
  values (cid, uid, make_admin, nullif(trim(member_title), ''));
  return jsonb_build_object('user_id', uid, 'result', result);
end;
$$;
revoke execute on function public.add_company_person(uuid, text, text, text, boolean, text) from public, anon;
grant execute on function public.add_company_person(uuid, text, text, text, boolean, text) to authenticated;

-- The old entry point keeps working (accounts only need an email).
create or replace function public.add_company_member(
  cid uuid, member_email text, make_admin boolean default false, member_title text default null)
returns text language plpgsql security definer set search_path = public as $$
begin
  return public.add_company_person(cid, member_email, null, null, make_admin, member_title) ->> 'result';
end;
$$;

-- Add someone to a project (and its company if needed) in one step.
create or replace function public.add_project_person(
  pid uuid, member_email text, member_name text default null, member_phone text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cid uuid := public.project_company(pid);
  added jsonb;
  uid uuid;
begin
  if cid is null or not public.is_company_admin(cid) then
    raise exception 'Only company admins can add people to a project';
  end if;
  added := public.add_company_person(cid, member_email, member_name, member_phone);
  uid := (added ->> 'user_id')::uuid;
  if exists (select 1 from project_members where project_id = pid and user_id = uid) then
    return jsonb_build_object('user_id', uid, 'result', 'already_member');
  end if;
  insert into project_members (project_id, user_id) values (pid, uid);
  return jsonb_build_object('user_id', uid,
    'result', case when added ->> 'result' = 'invited' then 'invited' else 'added' end);
end;
$$;
revoke execute on function public.add_project_person(uuid, text, text, text) from public, anon;
grant execute on function public.add_project_person(uuid, text, text, text) to authenticated;

-- Someone without an account who is removed from their last company is deleted.
create or replace function public.drop_orphan_pending_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from profiles p
  where p.id = old.user_id and not p.has_account
    and not exists (select 1 from company_members m where m.user_id = old.user_id);
  return old;
end;
$$;
create trigger company_members_drop_orphan
  after delete on public.company_members
  for each row execute function public.drop_orphan_pending_profile();
