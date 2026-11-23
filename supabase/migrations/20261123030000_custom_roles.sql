-- Step 3: custom roles.
--
-- Company admins can already add, rename and delete their company's own roles
-- (row-level security from the initial schema). This adds the naming rules:
-- a custom role can't reuse a standard role's name, and names are trimmed.

create or replace function public.check_custom_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.name := trim(new.name);
  new.department := nullif(trim(new.department), '');
  new.description := nullif(trim(new.description), '');
  if new.company_id is not null and exists (
       select 1 from roles where company_id is null and lower(name) = lower(new.name)) then
    raise exception '"%" is already a standard role. Pick a different name.', new.name;
  end if;
  return new;
end;
$$;

create trigger roles_check_custom
  before insert or update on public.roles
  for each row execute function public.check_custom_role();

-- How many people hold each role in a company (company and project roles),
-- so the roles page can warn before a role in use is deleted.
create or replace function public.role_usage(cid uuid)
returns table (role_id uuid, people bigint)
language sql
stable
security definer set search_path = public
as $$
  select r.role_id, count(distinct r.user_id)
  from (
    select role_id, user_id from company_member_roles where company_id = cid
    union all
    select pmr.role_id, pmr.user_id from project_member_roles pmr
      join projects p on p.id = pmr.project_id where p.company_id = cid
  ) r
  where public.is_company_member(cid)
  group by r.role_id;
$$;

revoke execute on function public.role_usage(uuid) from public, anon;
grant execute on function public.role_usage(uuid) to authenticated;
