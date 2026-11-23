import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LatticeGrid, gridLink } from '../components/LatticeGrid';
import { RolePicker } from '../components/RolePicker';
import { useAuth } from '../lib/auth';
import { api, type Company, type CompanyMember, type Project } from '../lib/api';
import { displayName, errorText, roleNames, statusLabel } from '../lib/format';
import type { Role } from '../lib/database.types';

interface PersonRow {
  id: string; name: string; email: string; phone: string; title: string; roles: string; admin: boolean;
}
interface ProjectRow { id: string; name: string; status: string; start_date: string; end_date: string; logline: string }

export type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

export function CompanyPage() {
  const { companyId = '' } = useParams();
  const { session } = useAuth();
  const me = session?.user.id;
  const navigate = useNavigate();

  const [company, setCompany] = useState<Company | null>(null);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, m, r, p] = await Promise.all([
        api.company(companyId), api.members(companyId), api.roles(companyId), api.projects(companyId),
      ]);
      setCompany(c);
      setMembers(m);
      setRoles(r);
      setProjects(p);
    } catch (e) {
      setError(errorText(e));
    }
    setLoaded(true);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const isAdmin = Boolean(company?.is_admin);

  const run: Run = async (fn, ok) => {
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e)); return false; }
    if (ok) setNotice(ok);
    await load();
    return true;
  };

  // ---- Company details -----------------------------------------------------
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '' });
  function startEdit() {
    setDraft({ name: company?.name ?? '', description: company?.description ?? '' });
    setEditing(true);
  }
  async function saveCompany(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => api.updateCompany(companyId, { name: draft.name.trim(), description: draft.description.trim() || null }));
    if (ok) setEditing(false);
  }
  async function deleteCompany() {
    if (!company) return;
    const typed = window.prompt(`This deletes ${company.name} and all of its projects, tasks and journals. Type the company name to confirm.`);
    if (typed?.trim() !== company.name) return;
    try { await api.deleteCompany(companyId); navigate('/'); } catch (e) { setError(errorText(e)); }
  }

  // ---- Projects ------------------------------------------------------------
  const [projectName, setProjectName] = useState('');
  async function createProject(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const p = await api.createProject(companyId, { name: projectName.trim() });
      navigate(`/projects/${p.id}`);
    } catch (err) { setError(errorText(err)); }
  }
  const projectRows = useMemo<ProjectRow[]>(() => projects.map((p) => ({
    id: p.id, name: p.name, status: statusLabel(p.status), logline: p.logline ?? '',
    start_date: p.start_date ?? '', end_date: p.end_date ?? '',
  })), [projects]);
  const projectOptions = useMemo(() => ({
    rowId: (r: ProjectRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false, readOnly: true,
    emptyMessage: 'No projects yet',
    columns: [
      { field: 'name', header: 'Project', width: 240, render: ({ data }: { data: ProjectRow }) => gridLink(data.name, `/projects/${data.id}`) },
      { field: 'status', header: 'Status', width: 150 },
      { field: 'start_date', header: 'Start', type: 'date', width: 120 },
      { field: 'end_date', header: 'End', type: 'date', width: 120 },
      { field: 'logline', header: 'Logline', width: 380 },
    ],
  }), []);

  // ---- People --------------------------------------------------------------
  const [newPerson, setNewPerson] = useState({ email: '', title: '', admin: false });
  async function addPerson(e: FormEvent) {
    e.preventDefault();
    const email = newPerson.email.trim();
    let result = '';
    const ok = await run(async () => {
      result = (await api.addMember(companyId, { email, is_admin: newPerson.admin, title: newPerson.title.trim() || null })).result;
    });
    if (ok) {
      setNotice(result === 'already_member' ? `${email} is already in this company.` : `Added ${email}.`);
      setNewPerson({ email: '', title: '', admin: false });
    }
  }

  const peopleRows = useMemo<PersonRow[]>(() => members
    .map((m) => ({
      id: m.user_id, name: displayName(m.profile), email: m.profile.email ?? '', phone: m.profile.phone ?? '',
      title: m.title ?? '', roles: roleNames(m.role_ids, roles), admin: m.is_admin,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)), [members, roles]);

  const peopleOptions = useMemo(() => ({
    rowId: (r: PersonRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, readOnly: true,
    columns: [
      { field: 'name', header: 'Name', width: 200 },
      { field: 'title', header: 'Title', width: 170 },
      { field: 'roles', header: 'Company roles', width: 240 },
      { field: 'email', header: 'Email', width: 220 },
      { field: 'phone', header: 'Phone', width: 140 },
      { field: 'admin', header: 'Admin', type: 'boolean', width: 90 },
    ],
  }), []);

  const selected = members.find((m) => m.user_id === selectedId) ?? null;

  if (!loaded) return <p className="muted">Loading…</p>;
  if (!company) return <p>{error ?? "That company doesn't exist or you don't have access."} <Link to="/">Back to companies</Link></p>;

  return (
    <section className="stack">
      <p className="crumbs"><Link to="/">Companies</Link> / {company.name}</p>

      {editing ? (
        <form className="card wide" onSubmit={saveCompany}>
          <label>Company name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
          <label>Description<textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <div className="row">
            <button type="submit">Save</button>
            <button type="button" className="secondary" onClick={() => setEditing(false)}>Cancel</button>
            <span className="spacer" />
            <button type="button" className="danger" onClick={deleteCompany}>Delete company</button>
          </div>
        </form>
      ) : (
        <header className="row">
          <div>
            <h1>{company.name}</h1>
            {company.description && <p className="muted">{company.description}</p>}
          </div>
          <span className="spacer" />
          {isAdmin && <button className="secondary" onClick={startEdit}>Edit company</button>}
        </header>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="info">{notice}</p>}

      <div>
        <h2>Projects</h2>
        {isAdmin && (
          <form className="inline" onSubmit={createProject}>
            <input placeholder="New project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
            <button type="submit">Create project</button>
          </form>
        )}
        <LatticeGrid options={projectOptions} rows={projectRows} height={Math.min(80 + projectRows.length * 34, 320)} />
        {!isAdmin && <p className="muted small">You see the projects you're assigned to. Company admins see all of them.</p>}
      </div>

      <div>
        <h2>People</h2>
        {isAdmin && (
          <form className="inline" onSubmit={addPerson}>
            <input type="email" placeholder="Their account email" value={newPerson.email}
              onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })} required />
            <input placeholder="Title (optional)" value={newPerson.title}
              onChange={(e) => setNewPerson({ ...newPerson, title: e.target.value })} />
            <label className="check">
              <input type="checkbox" checked={newPerson.admin}
                onChange={(e) => setNewPerson({ ...newPerson, admin: e.target.checked })} />
              Admin
            </label>
            <button type="submit">Add person</button>
          </form>
        )}
        {isAdmin && <p className="muted small">People need to create their own account first. Then add them here with the email they signed up with.</p>}
        <div className="split">
          <LatticeGrid
            options={peopleOptions}
            rows={peopleRows}
            height={Math.min(80 + peopleRows.length * 34, 420)}
            on={{ selectionChanged: (rows: PersonRow[]) => setSelectedId(rows[0]?.id ?? null) }}
          />
          {selected && (
            <MemberPanel
              key={selected.user_id}
              companyId={companyId}
              member={selected}
              roles={roles}
              isAdmin={isAdmin}
              isMe={selected.user_id === me}
              run={run}
              onRemoved={() => { setSelectedId(null); if (selected.user_id === me) navigate('/'); }}
            />
          )}
        </div>
        {!selected && peopleRows.length > 0 && <p className="muted small">Select a person to see their details{isAdmin ? ' and change their roles' : ''}.</p>}
      </div>
    </section>
  );
}

function MemberPanel({ companyId, member, roles, isAdmin, isMe, run, onRemoved }: {
  companyId: string; member: CompanyMember; roles: Role[]; isAdmin: boolean; isMe: boolean; run: Run; onRemoved: () => void;
}) {
  const [title, setTitle] = useState(member.title ?? '');
  const name = displayName(member.profile);
  const roleIds = new Set(member.role_ids);

  const toggleRole = (roleId: string, on: boolean) => {
    const next = new Set(roleIds);
    if (on) next.add(roleId); else next.delete(roleId);
    return run(() => api.setMemberRoles(companyId, member.user_id, [...next]));
  };

  async function remove() {
    const msg = isMe ? 'Leave this company? You will lose access to its projects.'
      : `Remove ${name} from the company? They will also be removed from its projects.`;
    if (!window.confirm(msg)) return;
    if (await run(() => api.removeMember(companyId, member.user_id), isMe ? undefined : `Removed ${name}.`)) onRemoved();
  }

  return (
    <aside className="panel">
      <h3>{name}</h3>
      <p className="muted small">
        {member.profile.email}{member.profile.phone ? <><br />{member.profile.phone}</> : null}
      </p>
      {isAdmin ? (
        <>
          <form className="inline" onSubmit={(e) => { e.preventDefault(); run(() => api.updateMember(companyId, member.user_id, { title: title.trim() || null }), 'Title saved.'); }}>
            <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button type="submit" className="secondary">Save title</button>
          </form>
          <label className="check">
            <input type="checkbox" checked={member.is_admin}
              onChange={(e) => run(() => api.updateMember(companyId, member.user_id, { is_admin: e.target.checked }))} />
            Company admin
          </label>
          <h4>Company roles</h4>
          <RolePicker roles={roles} selected={roleIds} onToggle={toggleRole} />
          <button className="danger" onClick={remove}>{isMe ? 'Leave company' : 'Remove from company'}</button>
        </>
      ) : (
        <>
          {member.title && <p>{member.title}</p>}
          <p>{roleNames(roleIds, roles) || <span className="muted">No company roles</span>}</p>
          {isMe && <button className="danger" onClick={remove}>Leave company</button>}
        </>
      )}
    </aside>
  );
}
