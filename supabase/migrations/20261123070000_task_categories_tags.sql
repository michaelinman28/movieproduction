-- Task categories and tags, both per company.
--
-- Categories are a fixed list that company admins set up; each task has at most
-- one. Tags are free-form: anyone in the company can create one while tagging a
-- task, and a task can have any number. Admins can rename or delete tags.

create table if not exists public.task_categories (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index if not exists task_categories_name_idx on public.task_categories (company_id, lower(name));

create table if not exists public.task_tags (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 40),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists task_tags_name_idx on public.task_tags (company_id, lower(name));

alter table public.tasks
  add column if not exists category_id uuid references public.task_categories (id) on delete set null;
create index if not exists tasks_category_idx on public.tasks (category_id);

create table if not exists public.task_tag_links (
  task_id uuid not null references public.tasks (id) on delete cascade,
  tag_id  uuid not null references public.task_tags (id) on delete cascade,
  primary key (task_id, tag_id)
);
create index if not exists task_tag_links_tag_idx on public.task_tag_links (tag_id);

-- Names are stored trimmed.
create or replace function public.tidy_name()
returns trigger language plpgsql as $$
begin
  new.name := trim(new.name);
  return new;
end;
$$;
drop trigger if exists task_categories_tidy on public.task_categories;
create trigger task_categories_tidy before insert or update on public.task_categories
  for each row execute function public.tidy_name();
drop trigger if exists task_tags_tidy on public.task_tags;
create trigger task_tags_tidy before insert or update on public.task_tags
  for each row execute function public.tidy_name();

-- A task's category and tags must belong to the task's company.
create or replace function public.check_task_category()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null and (select company_id from task_categories where id = new.category_id)
       is distinct from public.project_company(new.project_id) then
    raise exception 'That category belongs to another company';
  end if;
  return new;
end;
$$;
drop trigger if exists tasks_check_category on public.tasks;
create trigger tasks_check_category before insert or update of category_id, project_id on public.tasks
  for each row execute function public.check_task_category();

create or replace function public.check_task_tag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select company_id from task_tags where id = new.tag_id)
       is distinct from public.project_company(public.task_project(new.task_id)) then
    raise exception 'That tag belongs to another company';
  end if;
  return new;
end;
$$;
drop trigger if exists task_tag_links_check on public.task_tag_links;
create trigger task_tag_links_check before insert or update on public.task_tag_links
  for each row execute function public.check_task_tag();

-- Every company starts with a few categories, which its admins can change.
create or replace function public.seed_task_categories(cid uuid)
returns void language sql security definer set search_path = public as $$
  insert into task_categories (company_id, name, sort_order)
  select cid, n, i from unnest(array[
    'Development', 'Casting', 'Locations', 'Scheduling', 'Camera', 'Art', 'Wardrobe',
    'Sound', 'Post-production', 'Logistics', 'Budget', 'Legal'
  ]) with ordinality as t(n, i)
  on conflict do nothing;
$$;
revoke execute on function public.seed_task_categories(uuid) from public, anon, authenticated;

create or replace function public.on_company_created_categories()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_task_categories(new.id);
  return new;
end;
$$;
drop trigger if exists companies_seed_categories on public.companies;
create trigger companies_seed_categories after insert on public.companies
  for each row execute function public.on_company_created_categories();

select public.seed_task_categories(id) from public.companies
 where not exists (select 1 from public.task_categories c where c.company_id = companies.id);

-- Security rules.
alter table public.task_categories enable row level security;
alter table public.task_tags enable row level security;
alter table public.task_tag_links enable row level security;

drop policy if exists task_categories_select on public.task_categories;
create policy task_categories_select on public.task_categories for select to authenticated
  using (public.is_company_member(company_id));
drop policy if exists task_categories_write on public.task_categories;
create policy task_categories_write on public.task_categories for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

drop policy if exists task_tags_select on public.task_tags;
create policy task_tags_select on public.task_tags for select to authenticated
  using (public.is_company_member(company_id));
drop policy if exists task_tags_insert on public.task_tags;
create policy task_tags_insert on public.task_tags for insert to authenticated
  with check (public.is_company_member(company_id));
drop policy if exists task_tags_update on public.task_tags;
create policy task_tags_update on public.task_tags for update to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
drop policy if exists task_tags_delete on public.task_tags;
create policy task_tags_delete on public.task_tags for delete to authenticated
  using (public.is_company_admin(company_id));

drop policy if exists task_tag_links_all on public.task_tag_links;
create policy task_tag_links_all on public.task_tag_links for all to authenticated
  using (public.can_access_project(public.task_project(task_id)))
  with check (public.can_access_project(public.task_project(task_id)));

grant select, insert, update, delete on public.task_categories, public.task_tags, public.task_tag_links to authenticated;

-- How many tasks use each category and tag, for the company settings page.
create or replace function public.task_label_usage(cid uuid)
returns table(kind text, id uuid, tasks bigint)
language sql stable security definer set search_path = public as $$
  select 'category', c.id, count(t.id) from task_categories c left join tasks t on t.category_id = c.id
   where c.company_id = cid and public.is_company_member(cid) group by c.id
  union all
  select 'tag', g.id, count(l.task_id) from task_tags g left join task_tag_links l on l.tag_id = g.id
   where g.company_id = cid and public.is_company_member(cid) group by g.id;
$$;
