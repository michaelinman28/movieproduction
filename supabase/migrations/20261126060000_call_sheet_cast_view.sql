-- Call sheets by cast and crew.
--
-- On each project a person is:
-- * crew: a company admin, or someone with a role outside the Cast department;
-- * cast: someone who plays a character, or has a Cast role (like Actor);
-- * both: cast and crew (an actor who is also a producer).
-- Someone with no roles who plays no character counts as cast, the safer default.
--
-- Cast only (cast and not crew):
-- * sees only their own call on a shoot day (not other people's calls, notes,
--   phones on the sheet or dietary needs), in the app and on their personal link;
-- * cannot add, change or delete shoot days, their schedules or calls, send the
--   call sheet, or turn on its shared link;
-- * cannot read a day's shared link code (share_token), since that link shows the
--   whole sheet. The API gets it for crew from shoot_day_share_tokens().
-- Viewing and confirming their own call still work (mark_call_sheet, the link).

-- ---- Who is cast and who is crew ---------------------------------------------------

-- 'crew', 'cast' or 'both' for a person on a project. Internal: it takes any person.
create or replace function public.project_view_of(pid uuid, uid uuid)
returns text language sql stable security definer set search_path = public as $$
  with k as (
    select
      exists (select 1 from company_members m where m.company_id = project_company(pid) and m.user_id = uid and m.is_admin)
        or exists (select 1 from project_member_roles x join roles r on r.id = x.role_id
                   where x.project_id = pid and x.user_id = uid and lower(coalesce(r.department, '')) <> 'cast') as crew,
      exists (select 1 from project_member_roles x join roles r on r.id = x.role_id
              where x.project_id = pid and x.user_id = uid and lower(coalesce(r.department, '')) = 'cast')
        or exists (select 1 from characters c where c.project_id = pid and c.actor_id = uid) as cast_
  )
  select case when crew and cast_ then 'both' when crew then 'crew' else 'cast' end from k;
$$;
revoke all on function public.project_view_of(uuid, uuid) from public, anon, authenticated;

-- The signed-in person's view of a project: 'crew', 'cast' or 'both'.
create or replace function public.my_project_view(pid uuid)
returns text language sql stable security definer set search_path = public as $$
  select project_view_of(pid, auth.uid());
$$;
revoke all on function public.my_project_view(uuid) from public, anon;
grant execute on function public.my_project_view(uuid) to authenticated;

-- Whether the signed-in person is crew on the project (crew or both).
create or replace function public.is_project_crew(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select can_access_project(pid) and project_view_of(pid, auth.uid()) in ('crew', 'both');
$$;
revoke all on function public.is_project_crew(uuid) from public, anon;
grant execute on function public.is_project_crew(uuid) to authenticated;

-- ---- Shoot days: crew plan them, everyone on the project reads them ----------------

drop policy if exists shoot_days_insert on public.shoot_days;
create policy shoot_days_insert on public.shoot_days for insert to authenticated
  with check (created_by = auth.uid() and public.is_project_crew(project_id));
drop policy if exists shoot_days_update on public.shoot_days;
create policy shoot_days_update on public.shoot_days for update to authenticated
  using (public.is_project_crew(project_id)) with check (public.is_project_crew(project_id));
drop policy if exists shoot_days_delete on public.shoot_days;
create policy shoot_days_delete on public.shoot_days for delete to authenticated
  using ((created_by = auth.uid() and public.is_project_crew(project_id)) or public.is_company_admin(public.project_company(project_id)));

-- The shared link code is for crew only: every other column stays readable.
-- A column added to shoot_days later: run "select public.hide_share_token();" again.
create or replace function public.hide_share_token()
returns void language plpgsql set search_path = public as $$
declare cols text;
begin
  revoke select on public.shoot_days from anon, authenticated;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'shoot_days' and column_name <> 'share_token';
  execute format('grant select (%s) on public.shoot_days to authenticated', cols);
end;
$$;
revoke all on function public.hide_share_token() from public, anon, authenticated;
select public.hide_share_token();

-- The shared link codes of a project's days, for its crew.
create or replace function public.shoot_day_share_tokens(pid uuid)
returns table (id uuid, share_token uuid) language sql stable security definer set search_path = public as $$
  select s.id, s.share_token from shoot_days s where s.project_id = pid and is_project_crew(pid);
$$;
revoke all on function public.shoot_day_share_tokens(uuid) from public, anon;
grant execute on function public.shoot_day_share_tokens(uuid) to authenticated;

drop policy if exists shoot_day_items_all on public.shoot_day_items;
drop policy if exists shoot_day_items_select on public.shoot_day_items;
create policy shoot_day_items_select on public.shoot_day_items for select to authenticated
  using (public.can_access_project(project_id));
drop policy if exists shoot_day_items_write on public.shoot_day_items;
create policy shoot_day_items_write on public.shoot_day_items for all to authenticated
  using (public.is_project_crew(project_id)) with check (public.is_project_crew(project_id));

-- Calls: crew see and change everyone's; cast only see their own.
drop policy if exists shoot_day_calls_all on public.shoot_day_calls;
drop policy if exists shoot_day_calls_select on public.shoot_day_calls;
create policy shoot_day_calls_select on public.shoot_day_calls for select to authenticated
  using (public.can_access_project(project_id) and (user_id = auth.uid() or public.is_project_crew(project_id)));
drop policy if exists shoot_day_calls_write on public.shoot_day_calls;
create policy shoot_day_calls_write on public.shoot_day_calls for all to authenticated
  using (public.is_project_crew(project_id)) with check (public.is_project_crew(project_id));

-- ---- Sending and sharing: crew only -------------------------------------------------

do $$
declare src text; f text;
  old_check constant text := 'where id = day and can_access_project(project_id)';
  new_check constant text := 'where id = day and is_project_crew(project_id)';
begin
  foreach f in array array['publish_call_sheet(uuid)', 'share_call_sheet(uuid, boolean, boolean, boolean)'] loop
    src := pg_get_functiondef(('public.' || f)::regprocedure);
    if position(old_check in src) = 0 then raise exception '% changed; update the cast view migration', f; end if;
    execute replace(src, old_check, new_check);
  end loop;
end;
$$;

-- ---- Personal links: cast only see their own call ----------------------------------

do $$
declare src text;
  calls_old constant text := $r$from shoot_day_calls c join profiles p on p.id = c.user_id where c.shoot_day_id = d.id), '[]'),$r$;
  calls_new constant text := $r$from shoot_day_calls c join profiles p on p.id = c.user_id where c.shoot_day_id = d.id
                         and (c.user_id = me.user_id or project_view_of(d.project_id, me.user_id) in ('crew', 'both'))), '[]'),$r$;
  roles_old constant text := $r$join shoot_day_calls c on c.shoot_day_id = d.id and c.user_id = m.user_id$r$;
  roles_new constant text := $r$join shoot_day_calls c on c.shoot_day_id = d.id and c.user_id = m.user_id
                         and (c.user_id = me.user_id or project_view_of(d.project_id, me.user_id) in ('crew', 'both'))$r$;
  view_old constant text := $r$    'me', me.user_id,$r$;
  view_new constant text := $r$    'me', me.user_id,
    'view', project_view_of(d.project_id, me.user_id),$r$;
begin
  src := pg_get_functiondef('public.call_sheet_for_link(uuid)'::regprocedure);
  if position(calls_old in src) = 0 or position(roles_old in src) = 0 or position(view_old in src) = 0 then
    raise exception 'call_sheet_for_link changed; update the cast view migration';
  end if;
  src := replace(replace(replace(src, calls_old, calls_new), roles_old, roles_new), view_old, view_new);
  execute src;
end;
$$;
