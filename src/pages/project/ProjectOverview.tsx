import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Section } from '../../components/Section';
import { TaskTree } from '../../components/TaskTree';
import { ProjectLocations } from '../../components/ProjectLocations';
import { api, type Scene, type ShootDay, type Task } from '../../lib/api';
import { PROJECT_STATUSES, clockLabel, dueWhen, errorText, isOverdue, minutesLabel, pagesLabel } from '../../lib/format';
import type { ProjectStatus } from '../../lib/database.types';
import { useUnsaved } from '../../lib/unsaved';
import { itemPath } from '../../lib/links';
import { useProject } from './ProjectLayout';

/** 'YYYY-MM-DD' to e.g. 'Mon, Nov 23'. */
const shortDate = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };

/** The project's details (editable by admins) and a summary of each area. */
export function ProjectOverview() {
  const { project, projectId, isAdmin, team, locations, reload } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [days, setDays] = useState<ShootDay[] | null>(null);
  useEffect(() => {
    api.tasks(projectId).then(setTasks, () => setTasks([]));
    api.scenes(projectId).then(setScenes, () => setScenes([]));
    api.shootDays(projectId).then(setDays, () => setDays([]));
  }, [projectId]);

  // ---- Details form (held until Save) ---------------------------------------
  const initial = useMemo(() => ({
    name: project.name, logline: project.logline ?? '', description: project.description ?? '',
    status: project.status as ProjectStatus, start_date: project.start_date ?? '', end_date: project.end_date ?? '',
  }), [project]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const changed = editing && (Object.keys(initial) as (keyof typeof initial)[]).some((k) => draft[k] !== initial[k]);
  useUnsaved(changed);
  function startEdit() { setDraft(initial); setEditing(true); }
  // A project just created opens its details form, to fill in the rest.
  useEffect(() => {
    if ((location.state as { created?: boolean } | null)?.created) {
      startEdit();
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      await api.updateProject(projectId, {
        name: draft.name.trim(), logline: draft.logline.trim() || null, description: draft.description.trim() || null,
        status: draft.status, start_date: draft.start_date || null, end_date: draft.end_date || null,
      });
    } catch (err) { setError(errorText(err)); return; }
    setEditing(false);
    setNotice('Project saved.');
    await reload();
  }
  async function deleteProject() {
    if (!window.confirm(`Delete ${project.name}? Its tasks and journal are deleted too.`)) return;
    try { await api.deleteProject(projectId); navigate(`/companies/${project.company_id}`); } catch (err) { setError(errorText(err)); }
  }

  // ---- At a glance ------------------------------------------------------------
  const base = `/projects/${projectId}`;
  const open = tasks?.filter((t) => t.status !== 'done') ?? [];
  const late = open.filter(isOverdue);
  const upcoming = open.filter((t) => t.due_date && !isOverdue(t))
    .sort((a, b) => (a.due_date! + (a.due_time ?? '')).localeCompare(b.due_date! + (b.due_time ?? ''))).slice(0, 5);
  const inUse = locations.filter((l) => l.status !== 'not_using');
  const confirmed = locations.filter((l) => l.status === 'confirmed').length;
  const shotCount = scenes?.reduce((n, sc) => n + sc.shots, 0) ?? 0;
  const shotsDone = scenes?.reduce((n, sc) => n + sc.shots_done, 0) ?? 0;
  const scenesShot = scenes?.filter((sc) => sc.status === 'shot').length ?? 0;
  const today = localToday();
  const daysAhead = days?.filter((d) => d.shoot_date >= today).sort((a, b) => a.shoot_date.localeCompare(b.shoot_date)) ?? [];
  const nextDay = daysAhead[0];

  return (
    <>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <Section id="project.details" title="Details">
        {editing ? (
          <form className="card w-full max-w-2xl" onSubmit={saveDetails} data-form-for={projectId}>
            <label className="label">Project name<input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
            <label className="label">Logline<input className="field" value={draft.logline} onChange={(e) => setDraft({ ...draft, logline: e.target.value })} /></label>
            <label className="label">Description<textarea className="field" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="label">Status
                <select className="field" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}>
                  {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="label">Start date<input className="field" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></label>
              <label className="label">End date<input className="field" type="date" value={draft.end_date} min={draft.start_date || undefined} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /></label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button type="submit" className="btn" disabled={!changed} data-pin="2">Save</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              <button type="button" className="btn btn-danger sm:ml-auto" onClick={deleteProject}>Delete project</button>
            </div>
            {changed && <p className="hint">Unsaved changes.</p>}
          </form>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-2">
              {project.logline ? <p className="m-0 italic">{project.logline}</p> : <p className="hint m-0">No logline yet.</p>}
              {project.start_date && <p className="hint m-0">{project.start_date}{project.end_date ? ` to ${project.end_date}` : ''}</p>}
              {project.description && <p className="m-0">{project.description}</p>}
            </div>
            {isAdmin && <button className="btn btn-secondary sm:w-auto" onClick={startEdit}>Edit project</button>}
          </div>
        )}
      </Section>

      <Section id="project.glance" title="At a glance">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link to={`${base}/tasks`} className="card gap-1 text-fg no-underline hover:border-accent">
            <span className="text-sm font-semibold text-muted">Tasks</span>
            {tasks === null ? <span className="text-muted">Loading…</span> : (
              <>
                <span className="text-2xl font-bold">{open.length} open</span>
                <span className={late.length ? 'task-overdue' : 'hint'}>{late.length ? `${late.length} overdue` : 'Nothing overdue'}</span>
              </>
            )}
          </Link>
          <Link to={`${base}/scenes`} className="card gap-1 text-fg no-underline hover:border-accent">
            <span className="text-sm font-semibold text-muted">Scenes</span>
            {scenes === null ? <span className="text-muted">Loading…</span> : (
              <>
                <span className="text-2xl font-bold">{scenes.length} {scenes.length === 1 ? 'scene' : 'scenes'}</span>
                <span className="hint">{scenes.length ? `${scenesShot} shot, ${shotsDone} of ${shotCount} shots done` : 'No scenes yet'}</span>
              </>
            )}
          </Link>
          <Link to={nextDay ? `${base}/shoot-days/${nextDay.id}` : `${base}/shoot-days`} className="card gap-1 text-fg no-underline hover:border-accent">
            <span className="text-sm font-semibold text-muted">Shoot days</span>
            {days === null ? <span className="text-muted">Loading…</span> : (
              <>
                <span className="text-2xl font-bold">{days.length} {days.length === 1 ? 'day' : 'days'}</span>
                <span className="hint">{nextDay ? `Next: ${shortDate(nextDay.shoot_date)}${nextDay.shoot_date === today ? ' (today)' : ''}` : days.length ? 'No shoot days ahead' : 'None planned yet'}</span>
              </>
            )}
          </Link>
          <Link to={`${base}/locations`} className="card gap-1 text-fg no-underline hover:border-accent">
            <span className="text-sm font-semibold text-muted">Locations</span>
            <span className="text-2xl font-bold">{inUse.length} in use</span>
            <span className="hint">{confirmed} confirmed</span>
          </Link>
          <Link to={`${base}/team`} className="card gap-1 text-fg no-underline hover:border-accent">
            <span className="text-sm font-semibold text-muted">Team</span>
            <span className="text-2xl font-bold">{team.length} {team.length === 1 ? 'person' : 'people'}</span>
            <span className="hint">See who's on the project</span>
          </Link>
        </div>
      </Section>

      <Section id="project.scenes" title="Scenes and shots" summary={scenes?.length ? `${shotsDone} of ${shotCount} shots done` : undefined}>
        {scenes === null ? <p className="hint">Loading…</p> : scenes.length ? <ScenesSummary scenes={scenes} /> : <p className="hint">No scenes yet. Add them on the Scenes page to build shot lists.</p>}
        <Link to={`${base}/scenes`} className="btn-link self-start">All scenes</Link>
      </Section>

      <Section id="project.shootdays" title="Shoot days" summary={days?.length ? `${daysAhead.length} ahead of ${days.length}` : undefined}>
        {days === null ? <p className="hint">Loading…</p> : !days.length ? <p className="hint">No shoot days yet. Plan them on the Shoot days page.</p> : (
          <>
            {nextDay ? <NextShootDay day={nextDay} today={today} base={base} projectId={projectId} scenes={scenes ?? []} locationName={locations.find((l) => l.id === nextDay.location_id)?.name} />
              : <p className="hint">All {days.length} shoot days are behind you.</p>}
            {daysAhead.length > 1 && (
              <ul className="flex flex-col">
                {daysAhead.slice(1, 6).map((d) => (
                  <li key={d.id} className="border-b border-line last:border-b-0">
                    <Link to={`${base}/shoot-days/${d.id}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2 text-fg no-underline hover:text-accent">
                      <span className="flex min-w-0 basis-full items-baseline gap-3 sm:flex-1 sm:basis-auto">
                        <span className="w-24 shrink-0 text-sm text-muted sm:w-28">{shortDate(d.shoot_date)}</span>
                        <span className="min-w-0 flex-1 truncate">Day {d.day_number}{d.title ? `: ${d.title}` : ''}</span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2 pl-27 sm:pl-0">
                        <span className="text-sm text-muted">{d.scene_ids.length} {d.scene_ids.length === 1 ? 'scene' : 'scenes'}</span>
                        <SheetPill day={d} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <Link to={`${base}/shoot-days`} className="btn-link self-start">All shoot days</Link>
      </Section>

      <Section id="project.upcoming" title="Coming up" summary={upcoming.length ? `next ${upcoming.length}` : undefined}>
        {upcoming.length ? (
          <ul className="flex flex-col">
            {upcoming.map((t) => (
              <li key={t.id} className="border-b border-line last:border-b-0">
                <Link to={itemPath.task(projectId, t.id)} className="flex min-h-11 items-center gap-3 text-fg no-underline hover:text-accent">
                  <span className="w-32 shrink-0 text-sm text-muted">{shortDate(t.due_date!)}{dueWhen(t) ? `, ${dueWhen(t)}` : ''}</span>
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="hint">No tasks with a due date coming up.</p>}
        <Link to={`${base}/tasks`} className="btn-link self-start">All tasks</Link>
      </Section>
    </>
  );
}

/** Today as 'YYYY-MM-DD' in the person's own time zone. */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Bar({ label, done, total, detail }: { label: string; done: number; total: number; detail?: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-medium">{label}</span>
        <span className="text-sm text-muted">{detail ?? `${done} of ${total}`} ({pct}%)</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Progress through the scenes and their shot lists. */
function ScenesSummary({ scenes }: { scenes: Scene[] }) {
  const count = (s: Scene['status']) => scenes.filter((sc) => sc.status === s).length;
  const shots = scenes.reduce((n, sc) => n + sc.shots, 0);
  const shotsDone = scenes.reduce((n, sc) => n + sc.shots_done, 0);
  const pages = scenes.reduce((n, sc) => n + (sc.pages_eighths ?? 0), 0);
  const pagesShot = scenes.filter((sc) => sc.status === 'shot').reduce((n, sc) => n + (sc.pages_eighths ?? 0), 0);
  const minutes = scenes.reduce((n, sc) => n + sc.est_minutes, 0);
  const noShots = scenes.filter((sc) => !sc.shots).length;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {([['not_scheduled', 'Not scheduled'], ['scheduled', 'Scheduled'], ['shot', 'Shot']] as const).map(([s, label]) => (
          <div key={s} className="rounded-lg border border-line px-2 py-3">
            <div className="text-xl font-bold">{count(s)}</div>
            <div className="text-xs text-muted sm:text-sm">{label}</div>
          </div>
        ))}
      </div>
      <Bar label="Scenes shot" done={count('shot')} total={scenes.length} />
      {pages > 0 && <Bar label="Pages shot" done={pagesShot} total={pages} detail={`${pagesLabel(pagesShot) || '0'} of ${pagesLabel(pages)}`} />}
      <Bar label="Shots done" done={shotsDone} total={shots} />
      <p className="hint m-0">
        {minutes ? `About ${minutesLabel(minutes)} of shooting planned. ` : ''}
        {noShots ? `${noShots} ${noShots === 1 ? 'scene has' : 'scenes have'} no shot list yet.` : 'Every scene has a shot list.'}
      </p>
    </div>
  );
}

/** Call sheet state for a day: not sent, or which version and how many confirmed. */
function SheetPill({ day }: { day: ShootDay }) {
  if (!day.version) return <span className="task-pill">Call sheet not sent</span>;
  const all = day.called > 0 && day.confirmed === day.called;
  return <span className={`task-pill ${all ? 'task-pill-done' : ''}`}>Sent v{day.version}, {day.confirmed} of {day.called} confirmed</span>;
}

/** The next shoot day, in more detail. */
function NextShootDay({ day, today, base, projectId, scenes, locationName }: {
  day: ShootDay; today: string; base: string; projectId: string; scenes: Scene[]; locationName?: string;
}) {
  const byId = new Map(scenes.map((sc) => [sc.id, sc]));
  const dayScenes = day.scene_ids.map((id) => byId.get(id)).filter((sc): sc is Scene => !!sc);
  const times = ([['Crew call', day.crew_call], ['Shooting call', day.shooting_call], ['Lunch', day.lunch], ['Wrap', day.wrap]] as const).filter(([, t]) => t);
  return (
    // The day opens its call sheet; its location and scenes open on their own pages.
    <div className="card gap-2">
      <span className="text-sm font-semibold text-muted">{day.shoot_date === today ? 'Shooting today' : 'Next shoot day'}</span>
      <Link to={`${base}/shoot-days/${day.id}`} className="text-xl font-bold text-fg no-underline hover:text-accent">
        {shortDate(day.shoot_date)}: Day {day.day_number} of {day.total_days}
      </Link>
      {(day.title || locationName) && (
        <span>
          {day.title}{day.title && locationName ? ' at ' : ''}
          {locationName && day.location_id && <Link to={itemPath.location(projectId, day.location_id)} title={`Open ${locationName} on the Locations page`}>{locationName}</Link>}
        </span>
      )}
      {times.length > 0 && (
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {times.map(([label, t]) => <span key={label}><span className="text-muted">{label}</span> {clockLabel(t)}</span>)}
        </span>
      )}
      <span className="text-sm">
        {dayScenes.length ? (
          <>
            {dayScenes.length === 1 ? 'Scene' : 'Scenes'}{' '}
            {dayScenes.map((sc, i) => (
              <span key={sc.id}>{i > 0 && ', '}<Link to={itemPath.scene(projectId, sc.id)} title={`Open scene ${sc.number} on the Scenes page`}>{sc.number}</Link></span>
            ))}
          </>
        ) : 'No scenes scheduled yet'}
        {day.pages_eighths ? ` (${pagesLabel(day.pages_eighths)} ${day.pages_eighths <= 8 ? 'page' : 'pages'})` : ''}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <SheetPill day={day} />
        <span className="text-sm text-muted">{day.called} called</span>
        <Link to={`${base}/shoot-days/${day.id}`} className="btn-link text-sm">Open call sheet</Link>
      </span>
    </div>
  );
}

/** The project's tasks page. */
export function ProjectTasks() {
  const { project, projectId, isAdmin, team, locations, reloadLocations } = useProject();
  return <TaskTree projectId={projectId} projectName={project.name} companyId={project.company_id} team={team} locations={locations} canManage={isAdmin} onTasksChanged={reloadLocations} />;
}

/** The project's locations page. */
export function ProjectLocationsPage() {
  const { projectId, isAdmin, locations, reloadLocations } = useProject();
  return <ProjectLocations projectId={projectId} locations={locations} canManage={isAdmin} onChanged={reloadLocations} />;
}
