-- Step 2: adding people to a company.
--
-- People create their own account (sign up with name, email, phone and
-- password). A company admin then adds them to the company by email, and can
-- assign them to the company's projects.

-- Add someone with an existing account to a company by email.
-- Returns 'added' or 'already_member'.
create or replace function public.add_company_member(
  cid uuid, member_email text, make_admin boolean default false, member_title text default null)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  clean text := lower(trim(member_email));
  uid uuid;
begin
  if not public.is_company_admin(cid) then
    raise exception 'Only company admins can add people';
  end if;
  if clean is null or position('@' in clean) < 2 then
    raise exception 'Enter a valid email address';
  end if;

  select u.id into uid
  from auth.users u join profiles p on p.id = u.id
  where lower(u.email) = clean and u.email_confirmed_at is not null
  limit 1;

  if uid is null then
    raise exception 'No account uses %. Ask them to sign up first, then add them again.', clean;
  end if;

  if exists (select 1 from company_members where company_id = cid and user_id = uid) then
    return 'already_member';
  end if;

  insert into company_members (company_id, user_id, is_admin, title)
  values (cid, uid, make_admin, nullif(trim(member_title), ''));
  return 'added';
end;
$$;

revoke execute on function public.add_company_member(uuid, text, boolean, text) from public, anon;
grant execute on function public.add_company_member(uuid, text, boolean, text) to authenticated;

-- Keep profile emails in step with sign-in emails.
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_profile_email();
