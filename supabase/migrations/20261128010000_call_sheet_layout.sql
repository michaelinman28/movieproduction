-- Which printed call sheet layout a project uses: the modern two-page design, a compact
-- one-page sheet, or both (then each prints on its own). Set on the project's details.
alter table public.projects
  add column call_sheet_layout text not null default 'modern'
  check (call_sheet_layout in ('modern', 'one_page', 'both'));

comment on column public.projects.call_sheet_layout is
  'Printed call sheet layout: modern, one_page, or both (each prints separately).';

-- The personal and shared call sheet links print with the project's layout too.
do $$
declare src text; f text;
  old_project constant text := $r$jsonb_build_object('name', p.name, 'company_name', c.name)$r$;
  new_project constant text := $r$jsonb_build_object('name', p.name, 'company_name', c.name, 'call_sheet_layout', p.call_sheet_layout)$r$;
begin
  foreach f in array array['call_sheet_for_link(uuid)', 'call_sheet_for_share(uuid)'] loop
    src := pg_get_functiondef(('public.' || f)::regprocedure);
    if (length(src) - length(replace(src, old_project, ''))) / length(old_project) <> 1 then
      raise exception '% changed; update the call sheet layout migration', f;
    end if;
    execute replace(src, old_project, new_project);
  end loop;
end;
$$;
