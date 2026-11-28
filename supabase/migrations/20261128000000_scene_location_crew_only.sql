-- Only crew change a shoot day's locations. When a scene's location changes, that
-- location is added to the days the scene is on only if the person making the
-- change is crew on the project. Cast can still change the scene itself; the
-- day's list stays as it is until crew add the location.
-- (Putting a scene on a day is already crew only, so that path is unchanged.)

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

  if new.location_id is not null and new.location_id is distinct from old.location_id
     and public.is_project_crew(new.project_id) then
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
