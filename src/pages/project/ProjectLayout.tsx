import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom';
import { api, type CompanyMember, type Location, type ProjectDetail, type ProjectMember } from '../../lib/api';
import { errorText, statusLabel } from '../../lib/format';
import type { Role } from '../../lib/database.types';
import { Section } from '../../components/Section';

/** What every project page gets from the layout: the project and what's shared between pages. */
export interface ProjectContext {
  project: ProjectDetail;
  projectId: string;
  isAdmin: boolean;
  team: ProjectMember[];
  companyMembers: CompanyMember[];
  roles: Role[];
  locations: Location[];
  /** Reloads the project, team and locations. */
  reload: () => Promise<void>;
  /** Reloads only the locations (their task counts change with tasks). */
  reloadLocations: () => Promise<void>;
}
export const useProject = () => useOutletContext<ProjectContext>();

// The project's areas, in the left nav. `end` keeps Overview from matching every page.
const AREAS: { to: string; label: string; end?: boolean; admin?: boolean }[] = [
  { to: '', label: 'Overview', end: true },
  { to: 'tasks', label: 'Tasks' },
  { to: 'scenes', label: 'Scenes' },
  { to: 'shoot-days', label: 'Shoot days' },
  { to: 'locations', label: 'Locations' },
  { to: 'team', label: 'Team' },
  { to: 'notes', label: 'Project notes' },
  { to: 'journal', label: 'Journal' },
  { to: 'activity', label: 'Activity', admin: true },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 no-underline ${isActive ? 'bg-accent-soft font-semibold text-accent-strong' : 'text-fg hover:bg-bg'}`;

/**
 * A project's pages share this frame: the project's name, and a nav to each area
 * (a left column on wider screens, a row of tabs that scrolls sideways on phones).
 * It loads what several pages need once, and hands it to them through the outlet.
 */
export function ProjectLayout() {
  const { projectId = '' } = useParams();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([]);
  const [team, setTeam] = useState<ProjectMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const p = await api.project(projectId);
      const [cm, t, r, l] = await Promise.all([api.members(p.company_id), api.team(projectId), api.roles(p.company_id), api.locations(projectId)]);
      setProject(p);
      setCompanyMembers(cm);
      setTeam(t);
      setRoles(r);
      setLocations(l);
    } catch (e) {
      setError(errorText(e));
    }
    setLoaded(true);
  }, [projectId]);
  useEffect(() => { reload(); }, [reload]);

  const reloadLocations = useCallback(async () => {
    try { setLocations(await api.locations(projectId)); } catch (e) { setError(errorText(e)); }
  }, [projectId]);

  // Phones: keep the open tab in view, and fade the edges that have more tabs past them.
  const tabs = useRef<HTMLUListElement>(null);
  const { pathname } = useLocation();
  const fade = useCallback(() => {
    const el = tabs.current;
    if (!el) return;
    el.dataset.left = String(el.scrollLeft > 4);
    el.dataset.right = String(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  useEffect(() => {
    const el = tabs.current;
    const open = el?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (el && open && el.scrollWidth > el.clientWidth) el.scrollLeft = open.offsetLeft - (el.clientWidth - open.offsetWidth) / 2;
    fade();
  }, [pathname, loaded, fade]);

  if (!loaded) return <p className="text-muted">Loading…</p>;
  if (!project) return <p>{error ?? "That project doesn't exist or you aren't assigned to it."} <Link to="/">Back to companies</Link></p>;

  const base = `/projects/${projectId}`;
  const ctx: ProjectContext = { project, projectId, isAdmin: Boolean(project.can_manage), team, companyMembers, roles, locations, reload, reloadLocations };
  const company = `/companies/${project.company_id}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="no-print flex flex-col gap-1">
        <p className="text-sm text-muted">
          <Link to="/">Companies</Link> / <Link to={company}>{project.company.name}</Link>
        </p>
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {project.name}
          <span className="rounded-full bg-line px-2 py-0.5 text-xs font-normal text-fg">{statusLabel(project.status)}</span>
        </h1>
      </div>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <nav aria-label="Project" className="-mx-4 md:sticky md:top-16 md:mx-0 md:w-44 md:shrink-0">
          {/* Phones: one row of tabs that scrolls sideways inside itself, never the page. */}
          {/* Each tab stays on one line; the open one scrolls into view, and the edges fade while there's more to scroll to. */}
          <ul ref={tabs} onScroll={fade} className="project-tabs relative flex gap-1 overflow-x-auto border-b border-line px-4 pb-2 md:flex-col md:overflow-visible md:border-b-0 md:px-0 md:pb-0">
            {AREAS.filter((a) => !a.admin || ctx.isAdmin).map((a) => (
              <li key={a.label} className="shrink-0"><NavLink to={a.to ? `${base}/${a.to}` : base} end={a.end} className={navClass}>{a.label}</NavLink></li>
            ))}
          </ul>
          <div className="hidden md:mt-4 md:block md:border-t md:border-line md:pt-3">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">{project.company.name}</p>
            <ul className="flex flex-col gap-1">
              <li><NavLink to={company} end className={navClass}>Projects and people</NavLink></li>
              <li><NavLink to={`${company}/roles`} className={navClass}>Roles</NavLink></li>
              <li><NavLink to={`${company}/task-settings`} className={navClass}>Task settings</NavLink></li>
              {ctx.isAdmin && <li><NavLink to={`${company}/activity`} className={navClass}>Company activity</NavLink></li>}
            </ul>
          </div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {error && <p className="error">{error}</p>}
          <Outlet context={ctx} />
        </div>
      </div>
    </div>
  );
}

/** The journal's place in the nav until it's built. */
export function ProjectJournal() {
  return (
    <Section id="project.journal" title="Journal">
      <p>The project journal is coming next: private entries only you can see (or share with chosen people), and public entries for everyone on the project.</p>
    </Section>
  );
}
