import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LatticeGrid } from '../components/LatticeGrid';
import { RolePicker } from '../components/RolePicker';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { PROJECT_STATUSES, displayName, roleNames, sortRoles, statusLabel } from '../lib/format';
import type { Company, CompanyMember, Profile, Project, ProjectMember, ProjectStatus, Role } from '../lib/database.types';

interface TeamRow { id: string; name: string; roles: string; email: string; phone: string; joined: string }

type Run = (fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) => Promise<boolean>;

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const { session } = useAuth();
  const me = session?.user.id;
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([]);
  const [team, setTeam] = useState<ProjectMember[]>([]);
  const [teamRoles, setTeamRoles] = useState<Map<string, Set<string>>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const p = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle();
    if (p.error || !p.data) { setError(p.error?.message ?? null); setProject(null); setLoaded(true); return; }
    const proj = p.data as Project;
    const cid = proj.company_id;
    const [c, cm, pm, pmr, r] = await Promise.all([
      supabase.from('companies').select('*').eq('id', cid).maybeSingle(),
      supabase.from('company_members').select('*').eq('company_id', cid),
      supabase.from('project_members').select('*').eq('project_id', projectId),
      supabase.from('project_member_roles').select('*').eq('project_id', projectId),
      supabase.from('roles').select('*').or(`company_id.is.null,company_id.eq.${cid}`),
    ]);
    const err = c.error || cm.error || pm.error || pmr.error || r.error;
    if (err) setError(err.message);
    const cms = (cm.data ?? []) as CompanyMember[];
    const ids = [...new Set([...cms.map((x) => x.user_id), ...(pm.data ?? []).map((x) => x.user_id)])];
    const prof = ids.length ? await supabase.from('profiles').select('*').in('id', ids) : { data: [], error: null };
    const byUser = new Map<string, Set<string>>();
    for (const x of pmr.data ?? []) {
      if (!byUser.has(x.user_id)) byUser.set(x.user_id, new Set());
      byUser.get(x.user_id)!.add(x.role_id);
    }
    setProject(proj);
    setCompany(c.data as Company | null);
    setCompanyMembers(cms);
    setTeam((pm.data ?? []) as ProjectMember[]);
    setTeamRoles(byUser);
    setProfiles(new Map(((prof.data ?? []) as Profile[]).map((x) => [x.id, x])));
    setRoles(sortRoles((r.data ?? []) as Role[]));
    setLoaded(true);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const isAdmin = companyMembers.some((m) => m.user_id === me && m.is_admin);

  const run: Run = async (fn, ok) => {
    setError(null);
    setNotice(null);
    const { error } = await fn();
    if (error) { setError(error.message); return false; }
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
    const ok = await run(() => supabase.from('projects').update({
      name: draft.name.trim(), logline: draft.logline.trim() || null, description: draft.description.trim() || null,
      status: draft.status, start_date: draft.start_date || null, end_date: draft.end_date || null,
    }).eq('id', projectId), 'Project saved.');
    if (ok) setEditing(false);
  }
  async function deleteProject() {
    if (!project || !window.confirm(`Delete ${project.name}? Its tasks and journal are deleted too.`)) return;
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) setError(error.message); else navigate(`/companies/${project.company_id}`);
  }

  // ---- Team ----------------------------------------------------------------
  const [addUser, setAddUser] = useState('');
  const onTeam = new Set(team.map((t) => t.user_id));
  const available = companyMembers
    .filter((m) => !onTeam.has(m.user_id))
    .map((m) => ({ id: m.user_id, name: displayName(profiles.get(m.user_id)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (!addUser) return;
    const name = displayName(profiles.get(addUser));
    if (await run(() => supabase.from('project_members').insert({ project_id: projectId, user_id: addUser }), `Added ${name} to the project. Pick their project roles on the right.`)) {
      setSelectedId(addUser);
      setAddUser('');
    }
  }

  const teamRows = useMemo<TeamRow[]>(() => team.map((t) => {
    const p = profiles.get(t.user_id);
    return {
      id: t.user_id, name: displayName(p), email: p?.email ?? '', phone: p?.phone ?? '',
      roles: roleNames(teamRoles.get(t.user_id) ?? new Set(), roles), joined: t.joined_at.slice(0, 10),
    };
  }).sort((a, b) => a.name.localeCompare(b.name)), [team, profiles, teamRoles, roles]);

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
  if (!project) return <p>That project doesn't exist or you aren't assigned to it. <Link to="/">Back to companies</Link></p>;

  return (
    <section className="stack">
      <p className="crumbs">
        <Link to="/">Companies</Link> / <Link to={`/companies/${project.company_id}`}>{company?.name ?? 'Company'}</Link> / {project.name}
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
              userId={selected.user_id}
              profile={profiles.get(selected.user_id)}
              roles={roles}
              roleIds={teamRoles.get(selected.user_id) ?? new Set()}
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

function TeamPanel({ projectId, userId, profile, roles, roleIds, isAdmin, run, onRemoved }: {
  projectId: string; userId: string; profile?: Profile; roles: Role[]; roleIds: Set<string>;
  isAdmin: boolean; run: Run; onRemoved: () => void;
}) {
  const key = { project_id: projectId, user_id: userId };
  const name = displayName(profile);
  const toggleRole = (roleId: string, on: boolean) => run(() => on
    ? supabase.from('project_member_roles').insert({ ...key, role_id: roleId })
    : supabase.from('project_member_roles').delete().match({ ...key, role_id: roleId }));

  async function remove() {
    if (!window.confirm(`Remove ${name} from this project? They stay in the company.`)) return;
    if (await run(() => supabase.from('project_members').delete().match(key), `Removed ${name} from the project.`)) onRemoved();
  }

  return (
    <aside className="panel">
      <h3>{name}</h3>
      <p className="muted small">{profile?.email}{profile?.phone ? <><br />{profile.phone}</> : null}</p>
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
