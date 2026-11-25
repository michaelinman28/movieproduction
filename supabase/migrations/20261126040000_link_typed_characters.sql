-- Characters typed on people's calls (before the Characters page existed) become real
-- casting: where a call's typed character matches one of the project's characters
-- that has no actor yet, that person becomes its actor (and it's marked cast). Typed
-- names that now match a character the person plays are cleared, so the call sheet
-- reads them from the Characters page. Typed names that match nothing are kept.
with picks as (
  select distinct on (ch.id) ch.id as character_id, c.user_id
  from shoot_day_calls c
  join characters ch on ch.project_id = c.project_id and lower(ch.name) = lower(trim(c.character_name))
  where c.character_name is not null and ch.actor_id is null
  order by ch.id, c.created_at
)
update public.characters ch set actor_id = p.user_id
from picks p where ch.id = p.character_id;

update public.shoot_day_calls c set character_name = null
where c.character_name is not null
  and exists (select 1 from characters ch where ch.project_id = c.project_id and ch.actor_id = c.user_id
              and lower(ch.name) = lower(trim(c.character_name)));
