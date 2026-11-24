import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Section } from '../../components/Section';
import { TaskTree } from '../../components/TaskTree';
import { ProjectLocations } from '../../components/ProjectLocations';
import { api, type Task } from '../../lib/api';
import { PROJECT_STATUSES, dueWhen, errorText, isOverdue } from '../../lib/format';
import type { ProjectStatus } from '../../lib/database.types';
import { useUnsaved } from '../../lib/unsaved';
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
  useEffect(() => { api.tasks(projectId).then(setTasks, () => setTasks([])); }, [projectId]);

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link to={`${base}/tasks`} className="card gap-1 text-fg no-underline hover:border-accent">
            <span className="text-sm font-semibold text-muted">Tasks</span>
            {tasks === null ? <span className="text-muted">Loading…</span> : (
              <>
                <span className="text-2xl font-bold">{open.length} open</span>
                <span className={late.length ? 'task-overdue' : 'hint'}>{late.length ? `${late.length} overdue` : 'Nothing overdue'}</span>
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

      <Section id="project.upcoming" title="Coming up" summary={upcoming.length ? `next ${upcoming.length}` : undefined}>
        {upcoming.length ? (
          <ul className="flex flex-col">
            {upcoming.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center gap-3 border-b border-line last:border-b-0">
                <span className="w-32 shrink-0 text-sm text-muted">{shortDate(t.due_date!)}{dueWhen(t) ? `, ${dueWhen(t)}` : ''}</span>
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
              </li>
            ))}
          </ul>
        ) : <p className="hint">No tasks with a due date coming up.</p>}
        <Link to={`${base}/tasks`} className="btn-link self-start">All tasks</Link>
      </Section>
    </>
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
