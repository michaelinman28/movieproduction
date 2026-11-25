-- Personal call sheet links. Everyone called on a shoot day gets their own private,
-- unguessable link to a view-only page of that day's call sheet, with their own call
-- at the top. The link needs no sign-in: whoever has it can read the sheet (but
-- change nothing). It works once the sheet has been sent, and stops working when
-- the person is taken off the day. Opening it counts as viewing the sent version, and
-- the page's Confirm button confirms that version for the link's person.

alter table public.shoot_day_calls
  add column if not exists link_token uuid not null default gen_random_uuid();
create unique index if not exists shoot_day_calls_link_token_key on public.shoot_day_calls (link_token);

-- The token is always made by the database and never changes.
create or replace function public.keep_call_link_token()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.link_token := gen_random_uuid();
  else
    new.link_token := old.link_token;
  end if;
  return new;
end;
$$;
drop trigger if exists shoot_day_calls_link_token on public.shoot_day_calls;
create trigger shoot_day_calls_link_token before insert or update on public.shoot_day_calls
  for each row execute function public.keep_call_link_token();

-- Everything a personal link shows, as one document: the project, the day, its
-- location, schedule and scenes, everyone called (names, roles, calls and phones;
-- no emails), and a look at the next day. Null when the link is unknown or the
-- sheet hasn't been sent.
create or replace function public.call_sheet_for_link(token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me record;
  d record;
  nd record;
  result jsonb;
begin
  select * into me from shoot_day_calls where link_token = token;
  if not found then return null; end if;

  select s.*, n.day_number, n.total_days into d
  from shoot_days s
  join (select id, row_number() over (order by shoot_date, created_at) as day_number, count(*) over () as total_days
        from shoot_days where project_id = me.project_id) n on n.id = s.id
  where s.id = me.shoot_day_id;
  if d.version = 0 then return null; end if;

  select s.id, s.shoot_date, s.crew_call, s.title into nd from shoot_days s
  where s.project_id = d.project_id and (s.shoot_date, s.created_at) > (d.shoot_date, d.created_at)
  order by s.shoot_date, s.created_at limit 1;

  select jsonb_build_object(
    'me', me.user_id,
    'confirmed', me.confirmed_version = d.version,
    'project', (select jsonb_build_object('name', p.name, 'company_name', c.name)
                from projects p join companies c on c.id = p.company_id where p.id = d.project_id),
    'day', jsonb_build_object(
      'id', d.id, 'shoot_date', d.shoot_date, 'title', d.title,
      'crew_call', d.crew_call, 'shooting_call', d.shooting_call, 'lunch', d.lunch, 'wrap', d.wrap,
      'weather', d.weather, 'sunrise', d.sunrise, 'sunset', d.sunset, 'notes', d.notes,
      'version', d.version, 'sent_at', d.sent_at, 'day_number', d.day_number, 'total_days', d.total_days),
    'location', (select jsonb_build_object('name', l.name, 'description', l.description, 'address', l.address,
                   'parking', l.parking, 'nearest_hospital', l.nearest_hospital,
                   'contact_name', l.contact_name, 'contact_phone', l.contact_phone)
                 from project_locations l where l.id = d.location_id),
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'kind', i.kind, 'scene_id', i.scene_id,
                         'label', i.label, 'at_time', i.at_time) order by i.sort_order)
                       from shoot_day_items i where i.shoot_day_id = d.id), '[]'),
    'scenes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'number', s.number, 'set_name', s.set_name,
                          'int_ext', s.int_ext, 'time_of_day', s.time_of_day, 'pages_eighths', s.pages_eighths,
                          'synopsis', s.synopsis, 'characters', s.characters, 'needs', s.needs) order by i.sort_order)
                        from shoot_day_items i join scenes s on s.id = i.scene_id where i.shoot_day_id = d.id), '[]'),
    'calls', coalesce((select jsonb_agg(jsonb_build_object(
                         'user_id', c.user_id, 'call_time', c.call_time, 'character_name', c.character_name,
                         'pickup_time', c.pickup_time, 'makeup_time', c.makeup_time, 'note', c.note,
                         'profile', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'nickname', p.nickname, 'phone', p.phone),
                         'role_ids', coalesce((select jsonb_agg(r.role_id) from project_member_roles r
                                               where r.project_id = c.project_id and r.user_id = c.user_id), '[]')))
                       from shoot_day_calls c join profiles p on p.id = c.user_id where c.shoot_day_id = d.id), '[]'),
    'roles', coalesce((select jsonb_agg(distinct jsonb_build_object('id', r.id, 'name', r.name, 'department', r.department, 'sort_order', r.sort_order))
                       from project_member_roles m join roles r on r.id = m.role_id
                       join shoot_day_calls c on c.shoot_day_id = d.id and c.user_id = m.user_id
                       where m.project_id = d.project_id), '[]'),
    'next_day', case when nd.id is null then null else jsonb_build_object(
      'day', jsonb_build_object('shoot_date', nd.shoot_date, 'crew_call', nd.crew_call, 'title', nd.title, 'day_number', d.day_number + 1),
      'scenes', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'number', s.number, 'set_name', s.set_name,
                            'int_ext', s.int_ext, 'time_of_day', s.time_of_day, 'pages_eighths', s.pages_eighths) order by i.sort_order)
                          from shoot_day_items i join scenes s on s.id = i.scene_id where i.shoot_day_id = nd.id), '[]')) end
  ) into result;

  -- Opening the link counts as viewing this version.
  if me.viewed_version is distinct from d.version then
    perform set_config('mp.confirming', 'on', true);
    update shoot_day_calls set viewed_version = d.version, viewed_at = now()
    where shoot_day_id = me.shoot_day_id and user_id = me.user_id;
    perform set_config('mp.confirming', 'off', true);
  end if;

  return result;
end;
$$;

-- The link's person confirms they got the sent version. Returns the version confirmed.
create or replace function public.confirm_call_sheet_link(token uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v integer; day uuid; who uuid;
begin
  select c.shoot_day_id, c.user_id, d.version into day, who, v
  from shoot_day_calls c join shoot_days d on d.id = c.shoot_day_id where c.link_token = token;
  if day is null or v = 0 then raise exception 'This call sheet link isn''t working' using errcode = 'P0002'; end if;
  perform set_config('mp.confirming', 'on', true);
  update shoot_day_calls set
    viewed_version = v, viewed_at = case when viewed_version = v then viewed_at else now() end,
    confirmed_version = v, confirmed_at = now()
  where shoot_day_id = day and user_id = who;
  perform set_config('mp.confirming', 'off', true);
  return v;
end;
$$;

revoke all on function public.call_sheet_for_link(uuid), public.confirm_call_sheet_link(uuid) from public;
grant execute on function public.call_sheet_for_link(uuid), public.confirm_call_sheet_link(uuid) to anon, authenticated;
