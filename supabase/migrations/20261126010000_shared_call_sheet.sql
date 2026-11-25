-- A shared call sheet link for each shoot day: one private, unguessable link to a
-- view-only page of the whole day's call sheet (not one person's), to send to anyone.
-- No sign-in is needed: whoever has the link can read the sheet but change nothing.
--
-- * It is off until someone on the project turns it on, and only works once the
--   sheet has been sent. Turning it off, or making a new link, stops the old one.
-- * It never shows emails. Phone numbers (people's own and the location's on-site
--   contact) are left out unless the sharer ticks "Show phone numbers".
-- * Opening it is logged as a view ("shared link"); it doesn't count as anyone
--   viewing or confirming, since nobody is known.
-- * The code itself is kept out of the activity log, like personal link codes.

alter table public.shoot_days
  add column if not exists share_token uuid,
  add column if not exists share_phones boolean not null default false;
create unique index if not exists shoot_days_share_token_key on public.shoot_days (share_token) where share_token is not null;

-- Only share_call_sheet() changes the shared link and its phone setting.
create or replace function public.keep_shoot_day_share()
returns trigger language plpgsql as $$
begin
  if current_setting('mp.sharing', true) is distinct from 'on' then
    if tg_op = 'INSERT' then
      new.share_token := null;
      new.share_phones := false;
    else
      new.share_token := old.share_token;
      new.share_phones := old.share_phones;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists shoot_days_share on public.shoot_days;
create trigger shoot_days_share before insert or update on public.shoot_days
  for each row execute function public.keep_shoot_day_share();

-- Turn a day's shared link on or off, make a new one (the old one stops working),
-- or choose whether it shows phone numbers. Anyone on the project can, the same as
-- sending the sheet. Returns the link's code (null when off).
create or replace function public.share_call_sheet(day uuid, enabled boolean, new_link boolean default false, phones boolean default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare d record; tok uuid; ph boolean; b jsonb; a jsonb; ch text[];
begin
  select * into d from shoot_days where id = day and can_access_project(project_id);
  if not found then raise exception 'Not found, or you do not have access to it' using errcode = '42501'; end if;
  tok := case when not enabled then null when d.share_token is null or new_link then gen_random_uuid() else d.share_token end;
  ph := coalesce(phones, d.share_phones);
  if tok is not distinct from d.share_token and ph = d.share_phones then return tok; end if;

  perform set_config('mp.sharing', 'on', true);
  update shoot_days set share_token = tok, share_phones = ph where id = day;
  perform set_config('mp.sharing', 'off', true);

  b := jsonb_build_object('shared_link', case when d.share_token is null then 'Off' else 'On' end,
                          'shared_link_phones', case when d.share_phones then 'Shown' else 'Hidden' end);
  a := jsonb_build_object('shared_link', case when tok is null then 'Off' when tok = d.share_token or d.share_token is null then 'On' else 'New link' end,
                          'shared_link_phones', case when ph then 'Shown' else 'Hidden' end);
  if tok is distinct from d.share_token then ch := array['shared_link']; end if;
  if ph <> d.share_phones then ch := array_append(coalesce(ch, '{}'), 'shared_link_phones'); end if;
  perform audit_write('update', 'shoot_days', day::text,
    concat_ws(': ', to_char(d.shoot_date, 'Dy Mon FMDD, YYYY'), nullif(d.title, '')),
    null, null, null, d.project_id, null, b, a, ch, false, null);
  return tok;
end;
$$;
revoke all on function public.share_call_sheet(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.share_call_sheet(uuid, boolean, boolean, boolean) to authenticated;

-- Everything the shared link shows: the same as a personal link, without anyone
-- marked as "you", with no emails, and phones only when the sharer chose to show them.
-- Null when the link is unknown or off, or the sheet hasn't been sent.
create or replace function public.call_sheet_for_share(token uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d record;
  nd record;
  ph boolean;
  result jsonb;
begin
  if token is null then return null; end if;
  select s.*, n.day_number, n.total_days into d
  from shoot_days s
  join (select x.id, row_number() over (order by x.shoot_date, x.created_at) as day_number, count(*) over () as total_days
        from shoot_days x where x.project_id = (select project_id from shoot_days where share_token = token)) n on n.id = s.id
  where s.share_token = token;
  if not found or d.version = 0 then return null; end if;
  ph := d.share_phones;

  select s.id, s.shoot_date, s.crew_call, s.title into nd from shoot_days s
  where s.project_id = d.project_id and (s.shoot_date, s.created_at) > (d.shoot_date, d.created_at)
  order by s.shoot_date, s.created_at limit 1;

  select jsonb_build_object(
    'phones', ph,
    'project', (select jsonb_build_object('name', p.name, 'company_name', c.name)
                from projects p join companies c on c.id = p.company_id where p.id = d.project_id),
    'day', jsonb_build_object(
      'id', d.id, 'shoot_date', d.shoot_date, 'title', d.title,
      'crew_call', d.crew_call, 'shooting_call', d.shooting_call, 'lunch', d.lunch, 'wrap', d.wrap,
      'weather', d.weather, 'sunrise', d.sunrise, 'sunset', d.sunset, 'notes', d.notes,
      'version', d.version, 'sent_at', d.sent_at, 'day_number', d.day_number, 'total_days', d.total_days),
    'location', (select jsonb_build_object('name', l.name, 'description', l.description, 'address', l.address,
                   'parking', l.parking, 'nearest_hospital', l.nearest_hospital,
                   'contact_name', l.contact_name, 'contact_phone', case when ph then l.contact_phone end)
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
                         'profile', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'nickname', p.nickname,
                                                       'phone', case when ph then p.phone end),
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

  perform audit_write('view', 'shoot_days', d.id::text,
    concat_ws(': ', to_char(d.shoot_date, 'Dy Mon FMDD, YYYY'), nullif(d.title, '')),
    null, null, null, d.project_id, null, null, null, null, false, 'Call sheet v' || d.version || ', shared link');
  return result;
end;
$$;
revoke all on function public.call_sheet_for_share(uuid) from public;
grant execute on function public.call_sheet_for_share(uuid) to anon, authenticated;

-- Keep the shared link's code and setting out of the change log (share_call_sheet
-- writes its own entry).
do $$
declare src text;
begin
  src := pg_get_functiondef('public.audit_row()'::regprocedure);
  src := replace(src, $r$to_jsonb(old) - 'link_token' end;$r$, $r$to_jsonb(old) - 'link_token' - 'share_token' - 'share_phones' end;$r$);
  src := replace(src, $r$to_jsonb(new) - 'link_token' end;$r$, $r$to_jsonb(new) - 'link_token' - 'share_token' - 'share_phones' end;$r$);
  if src not like $r$%to_jsonb(old) - 'link_token' - 'share_token'%$r$ or src not like $r$%to_jsonb(new) - 'link_token' - 'share_token'%$r$ then
    raise exception 'audit_row changed; update the shared call sheet migration';
  end if;
  execute src;
end;
$$;
