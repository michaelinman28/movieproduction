-- Audit trail: every add, change and delete on every table, plus sign-ins and
-- call sheet views. Entries are written by the database itself (triggers and
-- functions), so nothing is missed, whichever way the change was made.
--
-- * Only company admins can read the log (row-level security). Entries about a
--   person that aren't tied to one company (profile changes, contacts, sign-ins)
--   show to admins of any company that person is in.
-- * Nobody can add, change or delete entries directly. The only way to remove any
--   is audit_cleanup(), a temporary clean-up tool for admins that leaves its own
--   entry each time it's used; switch it off for good by making
--   audit_cleanup_enabled() return false in a later migration.
-- * Private journal entries are logged in full, but their content goes to
--   audit_private, which no one can read through the API. The log shows only that
--   a private journal entry was added, changed or deleted.
-- * Entries have no foreign keys, so they stay after the item, project or company
--   is deleted.

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  actor_id uuid,                 -- who did it (null: the system, e.g. a setup change)
  actor_name text,               -- their name at the time
  source text not null default 'app' check (source in ('app', 'link', 'system')),
  action text not null check (action in ('insert', 'update', 'delete', 'view', 'sign_in', 'cleanup')),
  table_name text not null,      -- what kind of item
  row_key text not null,         -- its id (or "a:b" for link tables)
  item_label text,               -- readable name at the time, e.g. the task title
  parent_table text,             -- the item it belongs to, e.g. a note's task
  parent_key text,
  company_id uuid,
  project_id uuid,
  subject_user_id uuid,          -- the person the entry is about, if any
  before jsonb,
  after jsonb,
  changed text[],                -- fields that changed (updates)
  private boolean not null default false,
  detail text,
  tx bigint not null default txid_current()  -- groups everything done in one save
);
create index if not exists audit_log_company_at on public.audit_log (company_id, at desc);
create index if not exists audit_log_project_at on public.audit_log (project_id, at desc);
create index if not exists audit_log_item on public.audit_log (table_name, row_key, at desc);
create index if not exists audit_log_parent on public.audit_log (parent_table, parent_key, at desc);
create index if not exists audit_log_subject on public.audit_log (subject_user_id, at desc);
create index if not exists audit_log_tx on public.audit_log (tx);

-- The content of private journal entries and their shares. Never readable through the API.
create table if not exists public.audit_private (
  audit_id bigint primary key references public.audit_log (id) on delete cascade,
  item_label text,
  before jsonb,
  after jsonb
);

alter table public.audit_log enable row level security;
alter table public.audit_private enable row level security;
drop policy if exists audit_log_admins on public.audit_log;
create policy audit_log_admins on public.audit_log for select to authenticated using (
  (company_id is not null and public.is_company_admin(company_id))
  or (company_id is null and subject_user_id is not null and public.is_admin_of_person(subject_user_id))
);
revoke all on public.audit_log, public.audit_private from anon, authenticated;
grant select on public.audit_log to authenticated;

-- ---- Helpers -------------------------------------------------------------------

create or replace function public.audit_person_name(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(nickname, ''), nullif(full_name, ''), email) from profiles where id = uid;
$$;

-- Who is acting: the signed-in person, or the person whose personal call sheet link
-- is being used (set by the link functions), or the system.
create or replace function public.audit_actor(out actor uuid, out src text)
language plpgsql stable security definer set search_path = public as $$
begin
  actor := auth.uid();
  src := 'app';
  if actor is null then
    actor := nullif(current_setting('audit.link_user', true), '')::uuid;
    src := case when actor is null then 'system' else 'link' end;
  end if;
end;
$$;

-- The project and company of an item that may already be gone (deleted in the same
-- save), from its own latest log entry.
create or replace function public.audit_scope_of(t text, k text, out pid uuid, out cid uuid)
language sql stable security definer set search_path = public as $$
  select project_id, company_id from audit_log where table_name = t and row_key = k order by id desc limit 1;
$$;

create or replace function public.audit_write(
  act text, t text, k text, label text, ptable text, pkey text,
  cid uuid, pid uuid, subj uuid, b jsonb, a jsonb, ch text[], priv boolean, det text
) returns bigint language plpgsql security definer set search_path = public as $$
declare who record; new_id bigint;
begin
  select * into who from audit_actor();
  if cid is null and pid is not null then
    cid := coalesce(project_company(pid), (select s.cid from audit_scope_of('projects', pid::text) s));
  end if;
  insert into audit_log (actor_id, actor_name, source, action, table_name, row_key, item_label, parent_table, parent_key,
                         company_id, project_id, subject_user_id, before, after, changed, private, detail)
  values (who.actor, audit_person_name(who.actor), who.src, act, t, k,
          case when priv then case t when 'journal_entry_shares' then 'Private journal entry share' else 'Private journal entry' end else label end,
          ptable, pkey, cid, pid, subj,
          case when priv then null else b end, case when priv then null else a end,
          ch, priv, det)
  returning id into new_id;
  if priv then insert into audit_private (audit_id, item_label, before, after) values (new_id, label, b, a); end if;
  return new_id;
end;
$$;

-- ---- The change trigger, on every table -----------------------------------------

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  t text := tg_table_name;
  r jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  b jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'link_token' end;
  a jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'link_token' end;
  ch text[];
  k text := r->>'id';
  label text;
  ptable text; pkey text;
  cid uuid; pid uuid; subj uuid;
  priv boolean := false;
  sc record;
begin
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into ch
    from (select key from jsonb_object_keys(a) key union select key from jsonb_object_keys(b) key) s
    where a->key is distinct from b->key and key <> 'updated_at';
    if ch is null then return null; end if;  -- nothing but "last updated" changed
    -- Opening a call sheet is logged as a view by the call sheet functions.
    if t = 'shoot_day_calls' and ch <@ array['viewed_at', 'viewed_version'] then return null; end if;
  end if;

  case t
  when 'companies' then cid := (r->>'id')::uuid; label := r->>'name';
  when 'projects' then cid := (r->>'company_id')::uuid; pid := (r->>'id')::uuid; label := r->>'name';
  when 'roles', 'task_categories', 'task_tags' then cid := (r->>'company_id')::uuid; label := r->>'name';
  when 'company_members' then
    k := r->>'user_id'; cid := (r->>'company_id')::uuid; subj := k::uuid; label := audit_person_name(subj);
  when 'company_member_roles' then
    k := (r->>'user_id') || ':' || (r->>'role_id'); cid := (r->>'company_id')::uuid; subj := (r->>'user_id')::uuid;
    ptable := 'company_members'; pkey := r->>'user_id';
    label := concat_ws(': ', audit_person_name(subj), (select name from roles where id = (r->>'role_id')::uuid));
  when 'project_members' then
    k := r->>'user_id'; pid := (r->>'project_id')::uuid; subj := k::uuid; label := audit_person_name(subj);
  when 'project_member_roles' then
    k := (r->>'user_id') || ':' || (r->>'role_id'); pid := (r->>'project_id')::uuid; subj := (r->>'user_id')::uuid;
    ptable := 'project_members'; pkey := r->>'user_id';
    label := concat_ws(': ', audit_person_name(subj), (select name from roles where id = (r->>'role_id')::uuid));
  when 'profiles' then subj := k::uuid; label := coalesce(nullif(r->>'nickname', ''), nullif(r->>'full_name', ''), r->>'email');
  when 'person_contacts' then
    subj := (r->>'user_id')::uuid; ptable := 'profiles'; pkey := r->>'user_id';
    label := concat_ws(': ', audit_person_name(subj), r->>'value');
  when 'tasks' then pid := (r->>'project_id')::uuid; label := r->>'title';
  when 'task_notes' then
    ptable := 'tasks'; pkey := r->>'task_id'; label := left(r->>'body', 80);
    pid := task_project(pkey::uuid);
  when 'task_tag_links' then
    k := (r->>'task_id') || ':' || (r->>'tag_id'); ptable := 'tasks'; pkey := r->>'task_id';
    pid := task_project(pkey::uuid); label := (select name from task_tags where id = (r->>'tag_id')::uuid);
  when 'project_locations' then pid := (r->>'project_id')::uuid; label := r->>'name';
  when 'scenes' then
    pid := (r->>'project_id')::uuid; label := 'Scene ' || (r->>'number') || coalesce(': ' || nullif(r->>'set_name', ''), '');
  when 'scene_notes' then
    ptable := 'scenes'; pkey := r->>'scene_id'; label := left(r->>'body', 80); pid := scene_project(pkey::uuid);
  when 'shots' then
    pid := (r->>'project_id')::uuid; ptable := 'scenes'; pkey := r->>'scene_id'; label := coalesce(nullif(r->>'description', ''), 'Shot');
  when 'shoot_days' then
    pid := (r->>'project_id')::uuid; label := concat_ws(': ', to_char((r->>'shoot_date')::date, 'Dy Mon FMDD, YYYY'), nullif(r->>'title', ''));
  when 'shoot_day_items' then
    pid := (r->>'project_id')::uuid; ptable := 'shoot_days'; pkey := r->>'shoot_day_id';
    label := coalesce(nullif(r->>'label', ''),
      (select 'Scene ' || number || coalesce(': ' || nullif(set_name, ''), '') from scenes where id = (r->>'scene_id')::uuid), r->>'kind');
  when 'shoot_day_calls' then
    k := (r->>'shoot_day_id') || ':' || (r->>'user_id'); pid := (r->>'project_id')::uuid; subj := (r->>'user_id')::uuid;
    ptable := 'shoot_days'; pkey := r->>'shoot_day_id'; label := audit_person_name(subj);
  when 'journal_entries' then
    pid := (r->>'project_id')::uuid; label := coalesce(nullif(r->>'title', ''), 'Journal entry');
    priv := coalesce(b->>'visibility', '') = 'private' or coalesce(a->>'visibility', '') = 'private';
  when 'journal_entry_shares' then
    k := (r->>'entry_id') || ':' || (r->>'user_id'); ptable := 'journal_entries'; pkey := r->>'entry_id';
    pid := (select project_id from journal_entries where id = pkey::uuid); priv := true;
    label := 'Shared with ' || coalesce(audit_person_name((r->>'user_id')::uuid), 'someone');
  else
    label := null;
  end case;

  -- The item this belongs to was deleted in the same save: take its project from its log.
  if pid is null and ptable in ('tasks', 'scenes', 'journal_entries') then
    select * into sc from audit_scope_of(ptable, pkey);
    pid := sc.pid; cid := coalesce(cid, sc.cid);
  end if;

  perform audit_write(lower(tg_op), t, k, label, ptable, pkey, cid, pid, subj, b, a, ch, priv, null);
  return null;
end;
$$;

-- The trigger is named "Audit change" so it sorts before Postgres's own foreign-key
-- triggers (named "RI_..."): a deleted item is logged before the things deleted with it,
-- which then find their project from its entry.
do $$
declare t text;
begin
  foreach t in array array[
    'companies', 'company_members', 'company_member_roles', 'projects', 'project_members', 'project_member_roles',
    'roles', 'profiles', 'person_contacts', 'tasks', 'task_notes', 'task_categories', 'task_tags', 'task_tag_links',
    'project_locations', 'scenes', 'scene_notes', 'shots', 'shoot_days', 'shoot_day_items', 'shoot_day_calls',
    'journal_entries', 'journal_entry_shares'
  ] loop
    execute format('drop trigger if exists "Audit change" on public.%I', t);
    execute format('create trigger "Audit change" after insert or update or delete on public.%I for each row execute function public.audit_row()', t);
  end loop;
end;
$$;

-- ---- Call sheet views ------------------------------------------------------------

create or replace function public.audit_call_sheet_view(day uuid, viewer uuid, via text)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from shoot_days where id = day;
  if not found then return; end if;
  perform audit_write('view', 'shoot_days', day::text,
    concat_ws(': ', to_char(d.shoot_date, 'Dy Mon FMDD, YYYY'), nullif(d.title, '')),
    null, null, null, d.project_id, viewer, null, null, null, false,
    case when via = 'link' then 'Call sheet v' || d.version || ', personal link' else 'Call sheet v' || d.version end);
end;
$$;
revoke all on function public.audit_call_sheet_view(uuid, uuid, text) from public, anon, authenticated;

-- Someone on the project (or an admin) opened the call sheet page in the app.
create or replace function public.log_call_sheet_view(day uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from shoot_days where id = day and can_access_project(project_id)) then
    raise exception 'Not found, or you do not have access to it' using errcode = '42501';
  end if;
  perform audit_call_sheet_view(day, auth.uid(), 'app');
end;
$$;
revoke all on function public.log_call_sheet_view(uuid) from public, anon;
grant execute on function public.log_call_sheet_view(uuid) to authenticated;

-- The personal link functions: same as before, now logging who they act for and each opening.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.call_sheet_for_link(uuid)'::regprocedure);
  src := replace(src, E'  if not found then return null; end if;\n',
    E'  if not found then return null; end if;\n  perform set_config(''audit.link_user'', me.user_id::text, true);\n');
  src := replace(src, E'  -- Opening the link counts as viewing this version.\n',
    E'  perform audit_call_sheet_view(d.id, me.user_id, ''link'');\n\n  -- Opening the link counts as viewing this version.\n');
  if src not like '%audit_call_sheet_view%' or src not like '%audit.link_user%' then
    raise exception 'call_sheet_for_link changed; update the audit migration';
  end if;
  execute src;

  src := pg_get_functiondef('public.confirm_call_sheet_link(uuid)'::regprocedure);
  src := replace(src, E'  perform set_config(''mp.confirming'', ''on'', true);\n',
    E'  perform set_config(''audit.link_user'', who::text, true);\n  perform set_config(''mp.confirming'', ''on'', true);\n');
  if src not like '%audit.link_user%' then raise exception 'confirm_call_sheet_link changed; update the audit migration'; end if;
  execute src;
end;
$$;

-- ---- Sign-ins --------------------------------------------------------------------

-- Supabase adds a row to auth.sessions each time someone signs in.
create or replace function public.audit_sign_in()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor_id, actor_name, source, action, table_name, row_key, item_label, subject_user_id, detail)
  values (new.user_id, audit_person_name(new.user_id), 'app', 'sign_in', 'profiles', new.user_id::text,
          audit_person_name(new.user_id), new.user_id, left(new.user_agent, 300));
  return null;
end;
$$;
drop trigger if exists audit_sign_in on auth.sessions;
create trigger audit_sign_in after insert on auth.sessions
  for each row execute function public.audit_sign_in();

-- ---- Clean-up (temporary) --------------------------------------------------------

create or replace function public.audit_cleanup_enabled()
returns boolean language sql immutable as $$ select true $$;

-- Remove log entries in a company, optionally narrowed to a project, a kind of item,
-- one item, and a time range. Entries about the company's people that aren't tied
-- to a company (profile changes, sign-ins) are included unless a project is named.
-- Clean-up entries themselves are never removed. Returns how many were removed.
create or replace function public.audit_cleanup(
  company uuid, project uuid default null, kind text default null, item text default null,
  from_at timestamptz default null, to_at timestamptz default null
) returns integer language plpgsql security definer set search_path = public as $$
declare n integer; what text;
begin
  if not audit_cleanup_enabled() then raise exception 'Removing audit entries is switched off'; end if;
  if not is_company_admin(company) then
    raise exception 'Only company admins can remove audit entries' using errcode = '42501';
  end if;
  delete from audit_log l
  where l.action <> 'cleanup'
    and (l.company_id = company
         or (project is null and l.company_id is null and l.subject_user_id is not null
             and exists (select 1 from company_members m where m.company_id = company and m.user_id = l.subject_user_id)))
    and (project is null or l.project_id = project)
    and (kind is null or l.table_name = kind)
    and (item is null or l.row_key = item or l.parent_key = item)
    and (from_at is null or l.at >= from_at)
    and (to_at is null or l.at < to_at);
  get diagnostics n = row_count;
  what := concat_ws(', ',
    case when project is not null then 'project ' || coalesce((select name from projects where id = project), project::text) end,
    case when kind is not null then 'kind ' || kind end,
    case when item is not null then 'one item' end,
    case when from_at is not null then 'from ' || from_at::date end,
    case when to_at is not null then 'before ' || to_at::date end);
  perform audit_write('cleanup', 'audit_log', company::text,
    'Removed ' || n || case when n = 1 then ' entry' else ' entries' end,
    null, null, company, project, null, null,
    jsonb_strip_nulls(jsonb_build_object('project_id', project, 'kind', kind, 'item', item, 'from', from_at, 'to', to_at, 'removed', n)),
    null, false, coalesce(nullif(what, ''), 'everything'));
  return n;
end;
$$;
revoke all on function public.audit_cleanup(uuid, uuid, text, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.audit_cleanup(uuid, uuid, text, text, timestamptz, timestamptz) to authenticated;
revoke all on function public.audit_write(text, text, text, text, text, text, uuid, uuid, uuid, jsonb, jsonb, text[], boolean, text),
  public.audit_scope_of(text, text), public.audit_actor(), public.audit_person_name(uuid) from public, anon, authenticated;
