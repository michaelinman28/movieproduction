-- A scene's location belongs on the shoot day it is scheduled for. When a scene
-- is put on a day, or a scene already on a day is given a location, that location
-- is added to the day if it isn't there yet (at the end, so the main location
-- stays first). The call sheet then has its address, parking and hospital.
-- Taking a location off a day is left as it is.
--
-- The personal and shared call sheets name that location on each scene, and on
-- the following day's advance schedule.

create or replace function public.add_scene_location_to_day()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'shoot_day_items' then
    if new.kind = 'scene' and new.scene_id is not null then
      insert into shoot_day_locations (shoot_day_id, location_id, project_id)
      select new.shoot_day_id, s.location_id, s.project_id
      from scenes s
      where s.id = new.scene_id and s.location_id is not null
      on conflict (shoot_day_id, location_id) do nothing;
    end if;
    return new;
  end if;

  if new.location_id is not null and new.location_id is distinct from old.location_id then
    insert into shoot_day_locations (shoot_day_id, location_id, project_id)
    select i.shoot_day_id, new.location_id, new.project_id
    from shoot_day_items i
    where i.scene_id = new.id and i.kind = 'scene'
    on conflict (shoot_day_id, location_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.add_scene_location_to_day() from public;
grant execute on function public.add_scene_location_to_day() to authenticated;

drop trigger if exists shoot_day_items_add_location on public.shoot_day_items;
create trigger shoot_day_items_add_location after insert on public.shoot_day_items
  for each row execute function public.add_scene_location_to_day();

drop trigger if exists scenes_add_location_to_days on public.scenes;
create trigger scenes_add_location_to_days after update of location_id on public.scenes
  for each row execute function public.add_scene_location_to_day();

-- Days already planned pick up the locations of the scenes on them.
insert into public.shoot_day_locations (shoot_day_id, location_id, project_id)
select distinct i.shoot_day_id, s.location_id, s.project_id
from public.shoot_day_items i
join public.scenes s on s.id = i.scene_id
where i.kind = 'scene' and s.location_id is not null
on conflict (shoot_day_id, location_id) do nothing;

-- Scene rows on both link functions name their location. The advance schedule
-- (the following shoot day) lists that day's locations and each scene's location.
do $$
declare src text; f text;
  old_set constant text := $r$'set_name', s.set_name,$r$;
  new_set constant text := $r$'set_name', s.set_name, 'location_id', s.location_id, 'location_name', (select name from project_locations where id = s.location_id),$r$;
  old_next constant text := $r$'day_number', d.day_number + 1),$r$;
  new_next constant text := $r$'day_number', d.day_number + 1),
      'locations', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name) order by dl.sort_order)
                             from shoot_day_locations dl join project_locations l on l.id = dl.location_id
                             where dl.shoot_day_id = nd.id), '[]'),$r$;
begin
  foreach f in array array['call_sheet_for_link(uuid)', 'call_sheet_for_share(uuid)'] loop
    src := pg_get_functiondef(('public.' || f)::regprocedure);
    if (length(src) - length(replace(src, old_set, ''))) / length(old_set) <> 2
       or position(old_next in src) = 0 then
      raise exception '% changed; update the scene location migration', f;
    end if;
    src := replace(replace(src, old_set, new_set), old_next, new_next);
    execute src;
  end loop;
end;
$$;
