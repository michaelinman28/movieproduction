import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LatticeGrid } from '../components/LatticeGrid';
import { RolePicker } from '../components/RolePicker';
import { api, type CompanyMember, type ProjectDetail, type ProjectMember } from '../lib/api';
import { PROJECT_STATUSES, displayName, errorText, roleNames, statusLabel } from '../lib/format';
import type { ProjectStatus, Role } from '../lib/database.types';
import type { Run } from './CompanyPage';

interface TeamRow { id: string; name: string; roles: string; email: string; phone: string; joined: string }

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([]);
  const [team, setTeam] = useState<ProjectMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await api.project(projectId);
      const [cm, t, r] = await Promise.all([api.members(p.company_id), api.team(projectId), api.roles(p.company_id)]);
      setProject(p);
      setCompanyMembers(cm);
      setTeam(t);
      setRoles(r);
    } catch (e) {
      setError(errorText(e));
    }
    setLoaded(true);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const isAdmin = Boolean(project?.can_manage);

  const run: Run = async (fn, ok) => {
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e)); return false; }
    if (ok) setNotice(ok);
    await load();
    return true;
  };

  // ---- Details -------------------------------------------------------------
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', logline: '', description: '', status: 'development' as ProjectStatus, start_date: '', end_date: '' });
  function startEdit() {
    if (!project) return;
    setDraft({
      name: project.name, logline: project.logline ?? '', description: project.description ?? '',
      status: project.status, start_date: project.start_date ?? '', end_date: project.end_date ?? '',
    });
    setEditing(true);
  }
  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.updateProject(projectId, {
      name: draft.name.trim(), logline: draft.logline.trim() || null, description: draft.description.trim() || null,
      status: draft.status, start_date: draft.start_date || null, end_date: draft.end_date || null,
    }), 'Project saved.');
    if (ok) setEditing(false);
  }
  async function deleteProject() {
    if (!project || !window.confirm(`Delete ${project.name}? Its tasks and journal are deleted too.`)) return;
    try { await api.deleteProject(projectId); navigate(`/companies/${project.company_id}`); } catch (e) { setError(errorText(e)); }
  }

  // ---- Team ----------------------------------------------------------------
  const [addUser, setAddUser] = useState('');
  const onTeam = new Set(team.map((t) => t.user_id));
  const available = companyMembers
    .filter((m) => !onTeam.has(m.user_id))
    .map((m) => ({ id: m.user_id, name: displayName(m.profile) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (!addUser) return;
    const name = available.find((a) => a.id === addUser)?.name ?? 'them';
    if (await run(() => api.assign(projectId, addUser), `Added ${name} to the project. Select them below to pick their project roles.`)) {
      setAddUser('');
    }
  }

  const teamRows = useMemo<TeamRow[]>(() => team.map((t) => ({
    id: t.user_id, name: displayName(t.profile), email: t.profile.email ?? '', phone: t.profile.phone ?? '',
    roles: roleNames(t.role_ids, roles), joined: t.joined_at.slice(0, 10),
  })).sort((a, b) => a.name.localeCompare(b.name)), [team, roles]);

  const teamOptions = useMemo(() => ({
    rowId: (r: TeamRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, readOnly: true,
    emptyMessage: 'Nobody is assigned yet',
    columns: [
      { field: 'name', header: 'Name', width: 200 },
      { field: 'roles', header: 'Project roles', width: 280 },
      { field: 'email', header: 'Email', width: 220 },
      { field: 'phone', header: 'Phone', width: 140 },
      { field: 'joined', header: 'Assigned', type: 'date', width: 120 },
    ],
  }), []);

  const selected = team.find((t) => t.user_id === selectedId) ?? null;

  if (!loaded) return <p className="muted">Loading…</p>;
  if (!project) return <p>{error ?? "That project doesn't exist or you aren't assigned to it."} <Link to="/">Back to companies</Link></p>;

  return (
    <section className="stack">
      <p className="crumbs">
        <Link to="/">Companies</Link> / <Link to={`/companies/${project.company_id}`}>{project.company.name}</Link> / {project.name}
      </p>

      {editing ? (
        <form className="card wide" onSubmit={saveDetails}>
          <label>Project name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
          <label>Logline<input value={draft.logline} onChange={(e) => setDraft({ ...draft, logline: e.target.value })} /></label>
          <label>Description<textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <div className="row wrap">
            <label>Status
              <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as ProjectStatus })}>
                {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label>Start date<input type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></label>
            <label>End date<input type="date" value={draft.end_date} min={draft.start_date || undefined} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /></label>
          </div>
          <div className="row">
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>
            <span className="spacer" />
            <button type="button" className="danger" onClick={deleteProject}>Delete project</button>
          </div>
        </form>
      ) : (
        <header className="row">
          <div>
            <h1>{project.name}</h1>
            {project.logline && <p className="logline">{project.logline}</p>}
            <p className="muted small">
              <span className="badge">{statusLabel(project.status)}</span>
              {project.start_date && <> · {project.start_date}{project.end_date ? ` to ${project.end_date}` : ''}</>}
            </p>
            {project.description && <p>{project.description}</p>}
          </div>
          <span className="spacer" />
          {isAdmin && <button className="secondary" onClick={startEdit}>Edit project</button>}
        </header>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="info">{notice}</p>}

      <div>
        <h2>Team</h2>
        {isAdmin && (
          available.length ? (
            <form className="inline" onSubmit={assign}>
              <select value={addUser} onChange={(e) => setAddUser(e.target.value)} required>
                <option value="">Choose someone from the company…</option>
                {available.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button type="submit">Assign to project</button>
            </form>
          ) : (
            <p className="muted small">
              Everyone in the company is on this project. To assign someone new, first add them on the{' '}
              <Link to={`/companies/${project.company_id}`}>company page</Link>.
            </p>
          )
        )}
        <div className="split">
          <LatticeGrid
            options={teamOptions}
            rows={teamRows}
            height={Math.min(80 + teamRows.length * 34, 420)}
            on={{ selectionChanged: (rows: TeamRow[]) => setSelectedId(rows[0]?.id ?? null) }}
          />
          {selected && (
            <TeamPanel
              key={selected.user_id}
              projectId={projectId}
              member={selected}
              roles={roles}
              isAdmin={isAdmin}
              run={run}
              onRemoved={() => setSelectedId(null)}
            />
          )}
        </div>
        {!selected && teamRows.length > 0 && <p className="muted small">Select a person to see their details{isAdmin ? ' and set their project roles' : ''}.</p>}
      </div>

      <p className="muted small">Tasks and the project journal are coming in the next steps.</p>
    </section>
  );
}

function TeamPanel({ projectId, member, roles, isAdmin, run, onRemoved }: {
  projectId: string; member: ProjectMember; roles: Role[]; isAdmin: boolean; run: Run; onRemoved: () => void;
}) {
  const name = displayName(member.profile);
  const roleIds = new Set(member.role_ids);
  const toggleRole = (roleId: string, on: boolean) => {
    const next = new Set(roleIds);
    if (on) next.add(roleId); else next.delete(roleId);
    return run(() => api.setTeamRoles(projectId, member.user_id, [...next]));
  };

  async function remove() {
    if (!window.confirm(`Remove ${name} from this project? They stay in the company.`)) return;
    if (await run(() => api.unassign(projectId, member.user_id), `Removed ${name} from the project.`)) onRemoved();
  }

  return (
    <aside className="panel">
      <h3>{name}</h3>
      <p className="muted small">{member.profile.email}{member.profile.phone ? <><br />{member.profile.phone}</> : null}</p>
      {isAdmin ? (
        <>
          <h4>Project roles</h4>
          <RolePicker roles={roles} selected={roleIds} onToggle={toggleRole} />
          <button className="danger" onClick={remove}>Remove from project</button>
        </>
      ) : (
        <p>{roleNames(roleIds, roles) || <span className="muted">No project roles</span>}</p>
      )}
    </aside>
  );
}
