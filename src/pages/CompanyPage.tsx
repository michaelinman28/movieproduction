import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { LatticeGrid, gridDropdown, gridEsc, gridLink } from '../components/LatticeGrid';
import { Section } from '../components/Section';
import { RolePicker } from '../components/RolePicker';
import { useAuth } from '../lib/auth';
import { confirmDiscard, useUnsaved } from '../lib/unsaved';
import { api, type Company, type CompanyMember, type Project } from '../lib/api';
import { PROJECT_STATUSES, displayName, errorText, roleIdsFor, roleNames, statusLabel, statusValue } from '../lib/format';
import type { Role } from '../lib/database.types';

interface PersonRow {
  id: string; name: string; email: string; phone: string; title: string; roles: string; admin: boolean;
}
interface ProjectRow { id: string; name: string; status: string; start_date: string; end_date: string; logline: string; description: string }

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
    start_date: p.start_date ?? '', end_date: p.end_date ?? '', description: p.description ?? '',
  })), [projects]);
  const projectOptions = useMemo(() => ({
    rowId: (r: ProjectRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false, readOnly: !isAdmin,
    emptyMessage: 'No projects yet',
    // Admins edit every field in place, so the name can't double as the link; Open is the link.
    columns: [
      ...(isAdmin ? [
        { field: 'open', header: '', width: 80, sortable: false, filter: false, render: ({ data }: { data: ProjectRow }) => gridLink('Open', `/projects/${data.id}`) },
        { field: 'name', header: 'Project', width: 220, editable: true },
      ] : [
        { field: 'name', header: 'Project', width: 240, render: ({ data }: { data: ProjectRow }) => gridLink(data.name, `/projects/${data.id}`) },
      ]),
      {
        field: 'status', header: 'Status', width: 160, editable: true, editor: 'select',
        editorOptions: PROJECT_STATUSES.map((x) => x.label),
        render: ({ value }: { value: string }) => (isAdmin ? gridDropdown(gridEsc(value)) : gridEsc(value)),
      },
      { field: 'start_date', header: 'Start', type: 'date', width: 120, editable: true },
      { field: 'end_date', header: 'End', type: 'date', width: 120, editable: true },
      { field: 'logline', header: 'Logline', width: 320, editable: true, editor: 'textarea' },
      { field: 'description', header: 'Description', width: 320, editable: true, editor: 'textarea' },
    ],
  }), [isAdmin]);

  async function saveProjectCell(e: { data: ProjectRow; column: string; newValue: unknown }) {
    const v = e.newValue == null ? '' : String(e.newValue).trim();
    const b = e.column === 'name' ? (v ? { name: v } : null)
      : e.column === 'status' ? (statusValue(v) ? { status: statusValue(v) } : null)
      : e.column === 'start_date' || e.column === 'end_date' || e.column === 'logline' || e.column === 'description'
        ? { [e.column]: v || null }
      : null;
    if (!b) { await load(); return; }
    await run(() => api.updateProject(e.data.id, b));
  }

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
    selection: 'single', rowClickSelection: true, readOnly: !isAdmin,
    // Name, email and phone belong to each person's own profile, so only they change them.
    columns: [
      { field: 'name', header: 'Name', width: 200 },
      { field: 'title', header: 'Title', width: 170, editable: true },
      {
        field: 'roles', header: 'Company roles', width: 240, editable: true, filter: 'set', filterSplit: ',',
        tooltip: () => 'Role names separated by commas. Select the person to tick roles from the list.',
      },
      { field: 'email', header: 'Email', width: 220 },
      { field: 'phone', header: 'Phone', width: 140 },
      { field: 'admin', header: 'Admin', type: 'boolean', width: 90, editable: true },
    ],
  }), [isAdmin]);

  async function savePersonCell(e: { data: PersonRow; column: string; newValue: unknown }) {
    const userId = e.data.id;
    if (e.column === 'title') {
      const v = String(e.newValue ?? '').trim();
      await run(() => api.updateMember(companyId, userId, { title: v || null }));
    } else if (e.column === 'admin') {
      await run(() => api.updateMember(companyId, userId, { is_admin: Boolean(e.newValue) }));
    } else if (e.column === 'roles') {
      const { ids, unknown } = roleIdsFor(String(e.newValue ?? ''), roles);
      if (unknown.length) {
        setError(`There's no role called ${unknown.join(', ')}. Add it on the roles page first, or select the person to pick from the list.`);
        await load();
        return;
      }
      await run(() => api.setMemberRoles(companyId, userId, ids));
    } else await load();
  }

  const selected = members.find((m) => m.user_id === selectedId) ?? null;

  if (!loaded) return <p className="text-muted">Loading…</p>;
  if (!company) return <p>{error ?? "That company doesn't exist or you don't have access."} <Link to="/">Back to companies</Link></p>;

  return (
    <section className="flex flex-col gap-6">
      <p className="text-sm text-muted"><Link to="/">Companies</Link> / {company.name}</p>

      {editing ? (
        <form className="card w-full max-w-2xl" onSubmit={saveCompany}>
          <label className="label">Company name<input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></label>
          <label className="label">Description<textarea className="field" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="submit" className="btn">Save</button>
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn btn-danger sm:ml-auto" onClick={deleteCompany}>Delete company</button>
          </div>
        </form>
      ) : (
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1>{company.name}</h1>
            {company.description && <p className="mt-1 text-muted">{company.description}</p>}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to={`/companies/${companyId}/roles`} className="btn btn-secondary no-underline">{isAdmin ? 'Manage roles' : 'Roles'}</Link>
            <Link to={`/companies/${companyId}/task-settings`} className="btn btn-secondary no-underline">Task categories and tags</Link>
            {isAdmin && <button className="btn btn-secondary" onClick={startEdit}>Edit company</button>}
          </div>
        </header>
      )}

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <Section id="company.projects" title="Projects" summary={projectRows.length}>
        {isAdmin && (
          <form className="form-row mb-2" onSubmit={createProject}>
            <input className="field" placeholder="New project name" value={projectName} onChange={(e) => setProjectName(e.target.value)} required />
            <button type="submit" className="btn" data-pin>Create project</button>
          </form>
        )}
        {isAdmin && projectRows.length > 0 && <p className="hint mb-2">Double-click a cell to change it, or click a status to pick one.</p>}
        <LatticeGrid options={projectOptions} rows={projectRows} height={Math.min(80 + projectRows.length * 34, 320)}
          on={{ cellValueChanged: saveProjectCell }} />
        {!isAdmin && <p className="hint mt-2">You see the projects you're assigned to. Company admins see all of them.</p>}
      </Section>

      <Section id="company.people" title="People" summary={peopleRows.length}>
        {isAdmin && (
          <form className="form-row mb-2" onSubmit={addPerson}>
            <input className="field" type="email" placeholder="Their account email" value={newPerson.email}
              onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })} required />
            <input className="field" placeholder="Title (optional)" value={newPerson.title}
              onChange={(e) => setNewPerson({ ...newPerson, title: e.target.value })} />
            <label className="check-field">
              <input type="checkbox" checked={newPerson.admin}
                onChange={(e) => setNewPerson({ ...newPerson, admin: e.target.checked })} />
              Make admin
            </label>
            <button type="submit" className="btn" data-pin>Add person</button>
          </form>
        )}
        {isAdmin && <p className="hint mt-2">People need to create their own account first. Then add them here with the email they signed up with.</p>}
        {/* Admins edit cells in place, so the panel's space stays put: opening it mid double-click
            would resize the grid and stop the cell from opening. */}
        <div className={`grid grid-cols-1 gap-4 ${selected || isAdmin ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}>
          <LatticeGrid
            options={peopleOptions}
            rows={peopleRows}
            height={Math.min(80 + peopleRows.length * 34, 420)}
            on={{ selectionChanged: (rows: PersonRow[]) => { const id = rows[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); }, cellValueChanged: savePersonCell }}
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
          {!selected && isAdmin && <aside data-pin-scope className="card hidden lg:flex"><p className="hint">Select a person to see their details and pick their roles from the list.</p></aside>}
        </div>
        {!selected && peopleRows.length > 0 && <p className="hint mt-2">Select a person to see their details{isAdmin ? ' and change their roles, or double-click a title or roles cell to type a change' : ''}.</p>}
      </Section>
    </section>
  );
}

function MemberPanel({ companyId, member, roles, isAdmin, isMe, run, onRemoved }: {
  companyId: string; member: CompanyMember; roles: Role[]; isAdmin: boolean; isMe: boolean; run: Run; onRemoved: () => void;
}) {
  const name = displayName(member.profile);
  const roleIds = new Set(member.role_ids);
  // Title, admin and roles are held until Save.
  const initial = useMemo(() => ({ title: member.title ?? '', admin: member.is_admin, roles: [...member.role_ids].sort() }), [member]);
  const [draft, setDraft] = useState(initial);
  const titleChanged = draft.title.trim() !== initial.title || draft.admin !== initial.admin;
  const rolesChanged = draft.roles.join() !== initial.roles.join();
  const changed = titleChanged || rolesChanged;
  useUnsaved(changed);
  useEffect(() => { if (!changed) setDraft(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRole = (roleId: string, on: boolean) => setDraft((d) => ({
    ...d, roles: (on ? [...d.roles, roleId] : d.roles.filter((r) => r !== roleId)).sort(),
  }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const ok = await run(async () => {
      if (titleChanged) await api.updateMember(companyId, member.user_id, { title: draft.title.trim() || null, is_admin: draft.admin });
      if (rolesChanged) await api.setMemberRoles(companyId, member.user_id, draft.roles);
    }, `Saved ${name}.`);
    if (ok) setDraft((d) => ({ ...d, title: d.title.trim() }));
  }

  async function remove() {
    const msg = isMe ? 'Leave this company? You will lose access to its projects.'
      : `Remove ${name} from the company? They will also be removed from its projects.`;
    if (!window.confirm(msg)) return;
    if (await run(() => api.removeMember(companyId, member.user_id), isMe ? undefined : `Removed ${name}.`)) onRemoved();
  }

  return (
    <aside data-pin-scope className="card gap-2 lg:max-h-[560px] lg:overflow-auto">
      <h3>{name}</h3>
      <p className="hint mt-2">
        {member.profile.email}{member.profile.phone ? <><br />{member.profile.phone}</> : null}
      </p>
      {isAdmin ? (
        <>
          <form className="flex flex-col gap-2" onSubmit={save}>
            <label className="label">Title
              <input className="field" placeholder="e.g. Line producer" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={draft.admin} onChange={(e) => setDraft({ ...draft, admin: e.target.checked })} />
              Company admin
            </label>
            <h4>Company roles</h4>
            <RolePicker roles={roles} selected={new Set(draft.roles)} onToggle={toggleRole} />
            <div className="flex gap-2">
              <button type="submit" className="btn flex-1" disabled={!changed} data-pin="2">Save</button>
              <button type="button" className="btn btn-secondary" disabled={!changed} onClick={() => setDraft(initial)}>Undo changes</button>
            </div>
            {changed && <p className="hint">Unsaved changes.</p>}
          </form>
          <button className="btn btn-danger" onClick={remove}>{isMe ? 'Leave company' : 'Remove from company'}</button>
        </>
      ) : (
        <>
          {member.title && <p>{member.title}</p>}
          <p>{roleNames(roleIds, roles) || <span className="text-muted">No company roles</span>}</p>
          {isMe && <button className="btn btn-danger" onClick={remove}>Leave company</button>}
        </>
      )}
    </aside>
  );
}
