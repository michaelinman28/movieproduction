-- A location's status, so ones that won't be used can be filtered out:
-- considering (being scouted), confirmed (booked), or not_using (ruled out).
do $$ begin
  create type public.location_status as enum ('considering', 'confirmed', 'not_using');
exception when duplicate_object then null; end $$;

alter table public.project_locations
  add column if not exists status public.location_status not null default 'considering';
