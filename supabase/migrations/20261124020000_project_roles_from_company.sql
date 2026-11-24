-- When someone joins a project, their project roles start as their company roles.
-- They can be changed afterwards on the project's Team page.
create or replace function public.copy_company_roles_to_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into project_member_roles (project_id, user_id, role_id)
  select new.project_id, new.user_id, cmr.role_id
  from projects p
  join company_member_roles cmr on cmr.company_id = p.company_id and cmr.user_id = new.user_id
  where p.id = new.project_id
  on conflict do nothing;
  return new;
end;
$$;

revoke execute on function public.copy_company_roles_to_project() from public, anon, authenticated;

create trigger copy_company_roles_to_project
  after insert on public.project_members
  for each row execute function public.copy_company_roles_to_project();
