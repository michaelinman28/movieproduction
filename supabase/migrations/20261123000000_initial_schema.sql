-- Movie production platform: initial schema
--
-- Companies own projects. People join a company (company_members) and are then
-- assigned to projects (project_members). Roles are either standard (shared by
-- every company, company_id is null) or custom to one company. A member can hold
-- several roles at company level and on each project.
--
-- Projects have tasks (with sub-tasks through parent_id) and a journal. Journal
-- entries are public (everyone on the project) or private (author only, plus the
-- people the author shares the entry with).
--
-- Access is enforced with row-level security. For now roles are labels; the
-- company admin flag is what grants management rights.


-- ---------------------------------------------------------------------------
-- Profiles (one per signed-up user)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Companies and roles
-- ---------------------------------------------------------------------------

create table public.companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) > 0),
  description text,
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now()
);

create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies (id) on delete cascade, -- null = standard role
  name        text not null check (length(trim(name)) > 0),
  department  text,
  description text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create unique index roles_unique_name
  on public.roles (coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create table public.company_members (
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  is_admin    boolean not null default false,
  title       text,
  joined_at   timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table public.company_member_roles (
  company_id  uuid not null,
  user_id     uuid not null,
  role_id     uuid not null references public.roles (id) on delete cascade,
  primary key (company_id, user_id, role_id),
  foreign key (company_id, user_id)
    references public.company_members (company_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

create type public.project_status as enum
  ('development', 'pre_production', 'production', 'post_production', 'released', 'on_hold', 'cancelled');

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  logline     text,
  description text,
  status      public.project_status not null default 'development',
  start_date  date,
  end_date    date,
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index projects_company_idx on public.projects (company_id);

create table public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.project_member_roles (
  project_id  uuid not null,
  user_id     uuid not null,
  role_id     uuid not null references public.roles (id) on delete cascade,
  primary key (project_id, user_id, role_id),
  foreign key (project_id, user_id)
    references public.project_members (project_id, user_id) on delete cascade
);

-- ---------------------------------------------------------------------------
-- Tasks and sub-tasks
-- ---------------------------------------------------------------------------

create type public.task_status as enum ('todo', 'in_progress', 'blocked', 'done');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');

create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  parent_id   uuid references public.tasks (id) on delete cascade,
  title       text not null check (length(trim(title)) > 0),
  description text,
  status      public.task_status not null default 'todo',
  priority    public.task_priority not null default 'medium',
  assignee_id uuid references public.profiles (id) on delete set null,
  due_date    date,
  sort_order  int not null default 0,
  created_by  uuid not null default auth.uid() references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create index tasks_project_idx on public.tasks (project_id);
create index tasks_parent_idx on public.tasks (parent_id);

-- ---------------------------------------------------------------------------
-- Journal
-- ---------------------------------------------------------------------------

create type public.journal_visibility as enum ('private', 'public');

create table public.journal_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  author_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title       text,
  body        text not null default '',
  visibility  public.journal_visibility not null default 'private',
  entry_date  date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index journal_project_idx on public.journal_entries (project_id, entry_date desc);

create table public.journal_entry_shares (
  entry_id    uuid not null references public.journal_entries (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  shared_at   timestamptz not null default now(),
  primary key (entry_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies don't recurse)
-- ---------------------------------------------------------------------------

create or replace function public.is_company_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members where company_id = cid and user_id = auth.uid());
$$;

create or replace function public.is_company_admin(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from company_members
                 where company_id = cid and user_id = auth.uid() and is_admin);
$$;

create or replace function public.project_company(pid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from projects where id = pid;
$$;

create or replace function public.is_project_member(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid());
$$;

-- Project members and admins of the owning company can work on a project.
create or replace function public.can_access_project(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_project_member(pid) or public.is_company_admin(public.project_company(pid));
$$;

create or replace function public.shares_company_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from company_members a
    join company_members b on b.company_id = a.company_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

create or replace function public.is_journal_author(eid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from journal_entries where id = eid and author_id = auth.uid());
$$;

create or replace function public.is_shared_with_me(eid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from journal_entry_shares where entry_id = eid and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- The person who creates a company becomes its first admin.
create or replace function public.add_company_creator()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into company_members (company_id, user_id, is_admin) values (new.id, new.created_by, true);
  return new;
end;
$$;

create trigger companies_add_creator
  after insert on public.companies
  for each row execute function public.add_company_creator();

-- A company must always keep at least one admin.
create or replace function public.keep_one_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_admin
     and (tg_op = 'DELETE' or not new.is_admin)
     and exists (select 1 from companies where id = old.company_id)
     and not exists (select 1 from company_members
                     where company_id = old.company_id and is_admin and user_id <> old.user_id) then
    raise exception 'A company must have at least one admin';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger company_members_keep_admin
  before update or delete on public.company_members
  for each row execute function public.keep_one_admin();

-- Project members must belong to the project's company.
create or replace function public.check_project_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from company_members
                 where company_id = (select company_id from projects where id = new.project_id)
                   and user_id = new.user_id) then
    raise exception 'Add this person to the company before assigning them to a project';
  end if;
  return new;
end;
$$;

create trigger project_members_check
  before insert or update on public.project_members
  for each row execute function public.check_project_member();

-- Removing someone from a company removes them from its projects.
create or replace function public.remove_from_company_projects()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from project_members pm using projects p
  where pm.project_id = p.id and p.company_id = old.company_id and pm.user_id = old.user_id;
  return old;
end;
$$;

create trigger company_members_cascade_projects
  after delete on public.company_members
  for each row execute function public.remove_from_company_projects();

-- Roles used by a member must be standard or belong to that company.
create or replace function public.check_role_company()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  role_cid uuid;
begin
  if tg_table_name = 'company_member_roles' then
    cid := new.company_id;
  else
    cid := (select company_id from projects where id = new.project_id);
  end if;
  select company_id into role_cid from roles where id = new.role_id;
  if role_cid is not null and role_cid <> cid then
    raise exception 'That role belongs to a different company';
  end if;
  return new;
end;
$$;

create trigger company_member_roles_check
  before insert or update on public.company_member_roles
  for each row execute function public.check_role_company();

create trigger project_member_roles_check
  before insert or update on public.project_member_roles
  for each row execute function public.check_role_company();

-- Sub-tasks stay in their parent's project and can't form loops.
create or replace function public.check_task_parent()
returns trigger language plpgsql as $$
begin
  if new.parent_id is not null then
    if (select project_id from tasks where id = new.parent_id) is distinct from new.project_id then
      raise exception 'A sub-task must be in the same project as its parent';
    end if;
    if exists (
      with recursive up as (
        select id, parent_id from tasks where id = new.parent_id
        union all
        select t.id, t.parent_id from tasks t join up on t.id = up.parent_id
      )
      select 1 from up where id = new.id) then
      raise exception 'A task cannot be a sub-task of itself';
    end if;
  end if;
  if new.assignee_id is not null and not exists (
       select 1 from project_members where project_id = new.project_id and user_id = new.assignee_id) then
    raise exception 'Tasks can only be assigned to people on the project';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger tasks_check
  before insert or update on public.tasks
  for each row execute function public.check_task_parent();

-- Journal entries can only be shared with people on the project.
create or replace function public.check_journal_share()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from project_members pm join journal_entries e on e.project_id = pm.project_id
                 where e.id = new.entry_id and pm.user_id = new.user_id) then
    raise exception 'Journal entries can only be shared with people on the project';
  end if;
  return new;
end;
$$;

create trigger journal_shares_check
  before insert or update on public.journal_entry_shares
  for each row execute function public.check_journal_share();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger journal_touch
  before update on public.journal_entries
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles             enable row level security;
alter table public.companies            enable row level security;
alter table public.roles                enable row level security;
alter table public.company_members      enable row level security;
alter table public.company_member_roles enable row level security;
alter table public.projects             enable row level security;
alter table public.project_members      enable row level security;
alter table public.project_member_roles enable row level security;
alter table public.tasks                enable row level security;
alter table public.journal_entries      enable row level security;
alter table public.journal_entry_shares enable row level security;

-- Profiles: yourself and anyone you share a company with.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_company_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Companies: members can see, any signed-in user can create, admins manage.
create policy companies_select on public.companies for select to authenticated
  using (public.is_company_member(id) or created_by = auth.uid());
create policy companies_insert on public.companies for insert to authenticated
  with check (created_by = auth.uid());
create policy companies_update on public.companies for update to authenticated
  using (public.is_company_admin(id)) with check (public.is_company_admin(id));
create policy companies_delete on public.companies for delete to authenticated
  using (public.is_company_admin(id));

-- Roles: standard roles are visible to everyone and read-only; custom roles
-- are visible to company members and managed by admins.
create policy roles_select on public.roles for select to authenticated
  using (company_id is null or public.is_company_member(company_id));
create policy roles_insert on public.roles for insert to authenticated
  with check (company_id is not null and public.is_company_admin(company_id));
create policy roles_update on public.roles for update to authenticated
  using (company_id is not null and public.is_company_admin(company_id))
  with check (company_id is not null and public.is_company_admin(company_id));
create policy roles_delete on public.roles for delete to authenticated
  using (company_id is not null and public.is_company_admin(company_id));

-- Company members: visible to the company, managed by admins. Members can leave.
create policy company_members_select on public.company_members for select to authenticated
  using (public.is_company_member(company_id));
create policy company_members_insert on public.company_members for insert to authenticated
  with check (public.is_company_admin(company_id));
create policy company_members_update on public.company_members for update to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
create policy company_members_delete on public.company_members for delete to authenticated
  using (public.is_company_admin(company_id) or user_id = auth.uid());

create policy company_member_roles_select on public.company_member_roles for select to authenticated
  using (public.is_company_member(company_id));
create policy company_member_roles_write on public.company_member_roles for all to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));

-- Projects: project members and company admins see them; admins manage them.
-- Uses company_id directly so a just-inserted project can be returned to its creator.
create policy projects_select on public.projects for select to authenticated
  using (public.is_company_admin(company_id) or public.is_project_member(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_company_admin(company_id) and created_by = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (public.is_company_admin(company_id)) with check (public.is_company_admin(company_id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_company_admin(company_id));

create policy project_members_select on public.project_members for select to authenticated
  using (public.can_access_project(project_id));
create policy project_members_write on public.project_members for all to authenticated
  using (public.is_company_admin(public.project_company(project_id)))
  with check (public.is_company_admin(public.project_company(project_id)));

create policy project_member_roles_select on public.project_member_roles for select to authenticated
  using (public.can_access_project(project_id));
create policy project_member_roles_write on public.project_member_roles for all to authenticated
  using (public.is_company_admin(public.project_company(project_id)))
  with check (public.is_company_admin(public.project_company(project_id)));

-- Tasks: anyone with access to the project.
create policy tasks_all on public.tasks for all to authenticated
  using (public.can_access_project(project_id))
  with check (public.can_access_project(project_id));

-- Journal: public entries are visible to the project; private entries only to
-- the author and the people it was shared with. Only the author edits.
create policy journal_select on public.journal_entries for select to authenticated
  using (
    author_id = auth.uid()
    or (visibility = 'public' and public.can_access_project(project_id))
    or (public.is_shared_with_me(id) and public.can_access_project(project_id))
  );
create policy journal_insert on public.journal_entries for insert to authenticated
  with check (author_id = auth.uid() and public.can_access_project(project_id));
create policy journal_update on public.journal_entries for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy journal_delete on public.journal_entries for delete to authenticated
  using (author_id = auth.uid());

create policy journal_shares_select on public.journal_entry_shares for select to authenticated
  using (user_id = auth.uid() or public.is_journal_author(entry_id));
create policy journal_shares_insert on public.journal_entry_shares for insert to authenticated
  with check (public.is_journal_author(entry_id));
create policy journal_shares_delete on public.journal_entry_shares for delete to authenticated
  using (public.is_journal_author(entry_id));

-- ---------------------------------------------------------------------------
-- Standard roles
-- ---------------------------------------------------------------------------

insert into public.roles (company_id, name, department, sort_order) values
  (null, 'Executive Producer',      'Producing',   10),
  (null, 'Producer',                'Producing',   20),
  (null, 'Line Producer',           'Producing',   30),
  (null, 'Production Manager',      'Producing',   40),
  (null, 'Production Coordinator',  'Producing',   50),
  (null, 'Director',                'Directing',   60),
  (null, '1st Assistant Director',  'Directing',   70),
  (null, '2nd Assistant Director',  'Directing',   80),
  (null, 'Script Supervisor',       'Directing',   90),
  (null, 'Screenwriter',            'Writing',    100),
  (null, 'Director of Photography', 'Camera',     110),
  (null, 'Camera Operator',         'Camera',     120),
  (null, '1st Assistant Camera',    'Camera',     130),
  (null, 'Gaffer',                  'Lighting',   140),
  (null, 'Key Grip',                'Grip',       150),
  (null, 'Production Designer',     'Art',        160),
  (null, 'Art Director',            'Art',        170),
  (null, 'Set Decorator',           'Art',        180),
  (null, 'Prop Master',             'Art',        190),
  (null, 'Costume Designer',        'Wardrobe',   200),
  (null, 'Hair and Makeup',         'Wardrobe',   210),
  (null, 'Sound Mixer',             'Sound',      220),
  (null, 'Boom Operator',           'Sound',      230),
  (null, 'Casting Director',        'Casting',    240),
  (null, 'Location Manager',        'Locations',  250),
  (null, 'Editor',                  'Post',       260),
  (null, 'Composer',                'Post',       270),
  (null, 'VFX Supervisor',          'Post',       280),
  (null, 'Colorist',                'Post',       290),
  (null, 'Actor',                   'Cast',       300),
  (null, 'Production Assistant',    'Producing',  310),
  (null, 'Accountant',              'Accounts',   320);
