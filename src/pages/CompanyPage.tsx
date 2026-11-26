import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { LatticeGrid, gridDropdown, gridEsc, gridLink } from '../components/LatticeGrid';
import { Section } from '../components/Section';
import { ItemHistory } from '../components/ItemHistory';
import { PersonContacts } from '../components/PersonContacts';
import { RolePicker } from '../components/RolePicker';
import { useAuth } from '../lib/auth';
import { confirmDiscard, useUnsaved } from '../lib/unsaved';
import { scrollToForm, useOpenFromLink } from '../lib/reveal';
import { api, type Company, type CompanyMember, type Project } from '../lib/api';
import { emailOrThrow, emailProblem, formatPhone, phoneOrThrow } from '../lib/contact';
import { InviteButtons } from '../components/InviteButtons';
import { PROJECT_STATUSES, displayName, errorText, roleIdsFor, roleNames, statusLabel, statusValue } from '../lib/format';
import type { Role } from '../lib/database.types';

interface PersonRow {
  id: string; name: string; nickname: string; email: string; phone: string; title: string; roles: string; admin: boolean; account: string; pending: boolean;
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
  // A company just created opens its details form, to add a description.
  const location = useLocation();
  useEffect(() => {
    if (company && (location.state as { created?: boolean } | null)?.created) {
      startEdit();
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company]);
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
      // The new project opens with its details form, to fill in the rest.
      navigate(`/projects/${p.id}`, { state: { created: true } });
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
  const [newPerson, setNewPerson] = useState({ email: '', name: '', phone: '', title: '', admin: false });
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  // A link such as ?open=<id> (from a project's team) opens that person's form;
  // ?person=<id> is the older form of the same link.
  const openPerson = (id: string) => { setSelectedId(id); setReveal({ id, n: Date.now() }); scrollToForm(id); };
  const isMember = (id: string) => members.some((m) => m.user_id === id);
  useOpenFromLink(isMember, openPerson);
  useOpenFromLink(isMember, openPerson, 'person');
  async function addPerson(e: FormEvent) {
    e.preventDefault();
    const email = newPerson.email.trim();
    const problem = emailProblem(email);
    if (problem) { setError(problem); return; }
    if (!confirmDiscard()) return;
    let result = '';
    let userId = '';
    const who = newPerson.name.trim() || email;
    const ok = await run(async () => {
      const r = await api.addMember(companyId, {
        email, name: newPerson.name.trim() || null, phone: phoneOrThrow(newPerson.phone),
        is_admin: newPerson.admin, title: newPerson.title.trim() || null,
      });
      result = r.result;
      userId = r.user_id;
    });
    if (ok) {
      setNotice(result === 'already_member' ? `${email} is already in this company.`
        : result === 'invited' ? `Added ${who}. They don't have an account yet, so send them an invite from their form. Pick their roles there too.`
        : `Added ${who}. Pick their roles in the form.`);
      setNewPerson({ email: '', name: '', phone: '', title: '', admin: false });
      // Open the person's form, to pick their roles.
      if (userId) { setSelectedId(userId); setReveal({ id: userId, n: Date.now() }); scrollToForm(userId); }
    }
  }

  const peopleRows = useMemo<PersonRow[]>(() => members
    .map((m) => ({
      id: m.user_id, name: displayName(m.profile), nickname: m.profile.nickname ?? '', email: m.profile.email ?? '', phone: m.profile.phone ?? '',
      title: m.title ?? '', roles: roleNames(m.role_ids, roles), admin: m.is_admin,
      account: m.profile.has_account === false ? 'Not yet' : 'Yes', pending: m.profile.has_account === false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name)), [members, roles]);

  const peopleOptions = useMemo(() => ({
    rowId: (r: PersonRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, readOnly: !isAdmin,
    // Admins change a person's name and phone; the email is their sign-in, which only
    // they change (on their profile). Someone without an account yet has no sign-in,
    // so an admin can correct their email.
    columns: [
      { field: 'name', header: 'Name', width: 200, editable: true },
      { field: 'nickname', header: 'Nickname', width: 130, editable: true },
      { field: 'title', header: 'Title', width: 170, editable: true },
      {
        field: 'roles', header: 'Company roles', width: 240, editable: true, filter: 'set', filterSplit: ',',
        tooltip: () => 'Role names separated by commas. Select the person to tick roles from the list.',
      },
      { field: 'email', header: 'Email', width: 220, editable: (r: PersonRow) => r.pending,
        tooltip: (r: PersonRow) => r.pending ? 'No account yet: double-click to correct the email they\'ll sign up with.' : 'Their sign-in email. Only they can change it.' },
      { field: 'account', header: 'Account', width: 100, filter: 'set',
        tooltip: (r: PersonRow) => r.pending ? 'Added before signing up. They join when they sign up with this email.' : 'Signed up' },
      { field: 'phone', header: 'Phone', width: 140, editable: true },
      { field: 'admin', header: 'Admin', type: 'boolean', width: 90, editable: true },
    ],
  }), [isAdmin]);

  async function savePersonCell(e: { data: PersonRow; column: string; newValue: unknown }) {
    const userId = e.data.id;
    if (e.column === 'title') {
      const v = String(e.newValue ?? '').trim();
      await run(() => api.updateMember(companyId, userId, { title: v || null }));
    } else if (e.column === 'name') {
      const v = String(e.newValue ?? '').trim();
      if (v) await run(() => api.updatePerson(userId, { full_name: v }));
      else await load();
    } else if (e.column === 'nickname') {
      const v = String(e.newValue ?? '').trim();
      await run(() => api.updatePerson(userId, { nickname: v || null }));
    } else if (e.column === 'email') {
      const v = String(e.newValue ?? '');
      await run(() => { const email = emailOrThrow(v); if (!email) throw new Error('An email is needed, so they can be invited'); return api.updatePerson(userId, { email }); });
    } else if (e.column === 'phone') {
      const v = String(e.newValue ?? '');
      await run(() => api.updatePerson(userId, { phone: phoneOrThrow(v) }));
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
            {isAdmin && <Link to={`/companies/${companyId}/activity`} className="btn btn-secondary no-underline">Activity</Link>}
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
        <LatticeGrid stateId="company.projects" options={projectOptions} rows={projectRows} height={Math.min(80 + projectRows.length * 34, 320)}
          on={{ cellValueChanged: saveProjectCell }} />
        {!isAdmin && <p className="hint mt-2">You see the projects you're assigned to. Company admins see all of them.</p>}
      </Section>

      <Section id="company.people" title="People" summary={peopleRows.length}>
        {isAdmin && (
          <form className="form-row mb-2" onSubmit={addPerson}>
            <input className="field" type="email" placeholder="Email" aria-label="Email" value={newPerson.email}
              onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })} required />
            <input className="field" placeholder="Name (if they haven't signed up)" aria-label="Name" value={newPerson.name} maxLength={120}
              onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })} />
            <input className="field" type="tel" placeholder="Phone (optional)" aria-label="Phone" value={newPerson.phone} maxLength={40}
              onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })} onBlur={() => setNewPerson((n) => ({ ...n, phone: formatPhone(n.phone) }))} />
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
        {isAdmin && <p className="hint mt-2">Add someone by email. If they haven't signed up yet, add their name too: they're added now, you can give them tasks, and they join automatically when they sign up with that email. Their form has an invite you can send.</p>}
        {/* The form opens under the table, which keeps the full width. */}
        <div className="flex flex-col gap-4">
          <LatticeGrid
            stateId="company.people"
            options={peopleOptions}
            rows={peopleRows}
            reveal={reveal}
            height={Math.min(80 + peopleRows.length * 34, 420)}
            on={{ selectionChanged: (rows: PersonRow[]) => { const id = rows[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); }, cellValueChanged: savePersonCell }}
          />
          {selected && (
            <MemberPanel
              key={selected.user_id}
              companyId={companyId}
              companyName={company?.name ?? ''}
              member={selected}
              roles={roles}
              isAdmin={isAdmin}
              isMe={selected.user_id === me}
              run={run}
              onRemoved={() => { setSelectedId(null); if (selected.user_id === me) navigate('/'); }}
            />
          )}
        </div>
        {!selected && peopleRows.length > 0 && <p className="hint mt-2">Select a person to see their details{isAdmin ? ' and change their roles, or double-click a title or roles cell to type a change' : ''}.</p>}
      </Section>
    </section>
  );
}

function MemberPanel({ companyId, companyName, member, roles, isAdmin, isMe, run, onRemoved }: {
  companyId: string; companyName: string; member: CompanyMember; roles: Role[]; isAdmin: boolean; isMe: boolean; run: Run; onRemoved: () => void;
}) {
  const name = displayName(member.profile);
  const pending = member.profile.has_account === false;
  const roleIds = new Set(member.role_ids);
  // Name, phone, title, admin and roles are held until Save.
  const initial = useMemo(() => ({
    name: member.profile.full_name ?? '', nickname: member.profile.nickname ?? '', phone: member.profile.phone ?? '',
    email: member.profile.email ?? '', title: member.title ?? '', admin: member.is_admin, roles: [...member.role_ids].sort(),
  }), [member]);
  const [draft, setDraft] = useState(initial);
  const profileChanged = draft.name.trim() !== initial.name || draft.nickname.trim() !== initial.nickname || draft.phone.trim() !== initial.phone
    || (pending && draft.email.trim().toLowerCase() !== initial.email);
  const titleChanged = draft.title.trim() !== initial.title || draft.admin !== initial.admin;
  const rolesChanged = draft.roles.join() !== initial.roles.join();
  const changed = profileChanged || titleChanged || rolesChanged;
  useUnsaved(changed);
  useEffect(() => { if (!changed) setDraft(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRole = (roleId: string, on: boolean) => setDraft((d) => ({
    ...d, roles: (on ? [...d.roles, roleId] : d.roles.filter((r) => r !== roleId)).sort(),
  }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const ok = await run(async () => {
      if (profileChanged) {
        await api.updatePerson(member.user_id, {
          ...(draft.name.trim() ? { full_name: draft.name.trim() } : {}), nickname: draft.nickname.trim() || null, phone: phoneOrThrow(draft.phone),
          ...(pending && draft.email.trim().toLowerCase() !== initial.email ? { email: emailOrThrow(draft.email) ?? '' } : {}),
        });
      }
      if (titleChanged) await api.updateMember(companyId, member.user_id, { title: draft.title.trim() || null, is_admin: draft.admin });
      if (rolesChanged) await api.setMemberRoles(companyId, member.user_id, draft.roles);
    }, `Saved ${name}.`);
    if (ok) setDraft((d) => ({ ...d, name: d.name.trim(), nickname: d.nickname.trim(), phone: formatPhone(d.phone), email: d.email.trim().toLowerCase(), title: d.title.trim() }));
  }

  async function remove() {
    const msg = isMe ? 'Leave this company? You will lose access to its projects.'
      : `Remove ${name} from the company? They will also be removed from its projects.`;
    if (!window.confirm(msg)) return;
    if (await run(() => api.removeMember(companyId, member.user_id), isMe ? undefined : `Removed ${name}.`)) onRemoved();
  }

  return (
    <aside data-pin-scope data-form-for={member.user_id} data-form-label={name} className="card gap-2">
      <h3>{name}{member.profile.nickname ? <span className="font-normal text-muted"> ({member.profile.nickname})</span> : null}</h3>
      <p className="hint mt-2">
        {member.profile.email && <a href={`mailto:${member.profile.email}`}>{member.profile.email}</a>}
        {member.profile.phone ? <><br /><a href={`tel:${member.profile.phone.replace(/[^\d+]/g, '')}`}>{member.profile.phone}</a></> : null}
      </p>
      {pending ? (
        <InviteButtons info={{ name, email: member.profile.email ?? '', company: companyName }} />
      ) : (
        <p className="hint">
          {isMe
            ? <>Your sign-in email is changed on <Link to="/profile">your profile</Link>.</>
            : <>The email is {name}'s sign-in, so only they can change it, on their profile.</>}
        </p>
      )}
      {isAdmin ? (
        <>
          <form className="flex flex-col gap-2" onSubmit={save}>
            <label className="label">Name
              <input className="field" value={draft.name} required={!!initial.name} maxLength={120} autoComplete="off" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            {pending && (
              <label className="label">Email <span className="text-muted">(they'll sign up with this)</span>
                <input className="field" type="email" value={draft.email} required maxLength={254} autoComplete="off" onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
            )}
            <label className="label">Nickname
              <input className="field" value={draft.nickname} maxLength={60} autoComplete="off" placeholder="Optional, e.g. Avi" onChange={(e) => setDraft({ ...draft, nickname: e.target.value })} />
            </label>
            <label className="label">Phone
              <input className="field" type="tel" value={draft.phone} maxLength={40} autoComplete="off" placeholder="Optional, e.g. 404-555-0123" onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                onBlur={() => setDraft((d) => ({ ...d, phone: formatPhone(d.phone) }))} />
            </label>
            <label className="label">Title
              <input className="field" placeholder="e.g. Line producer" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="check">
              <input type="checkbox" checked={draft.admin} onChange={(e) => setDraft({ ...draft, admin: e.target.checked })} />
              Company admin
            </label>
            <Section id="company.person.roles" title="Company roles" level="h4" summary={draft.roles.length ? `${draft.roles.length} picked` : 'None'}>
              <RolePicker id="company.person.roles" roles={roles} selected={new Set(draft.roles)} onToggle={toggleRole} />
            </Section>
            <div className="flex gap-2">
              <button type="submit" className="btn flex-1" disabled={!changed} data-pin="2">Save</button>
              <button type="button" className="btn btn-secondary" disabled={!changed} onClick={() => setDraft(initial)}>Undo changes</button>
            </div>
            {changed && <p className="hint">Unsaved changes.</p>}
          </form>
          <PersonContacts userId={member.user_id} name={name} canEdit />
          <ItemHistory companyId={companyId} kind="person" id={member.user_id} refresh={`${member.title}${member.is_admin}${member.role_ids.join()}${member.profile.full_name}${member.profile.phone}${member.profile.nickname}`} />
          <button className="btn btn-danger" onClick={remove}>{isMe ? 'Leave company' : 'Remove from company'}</button>
        </>
      ) : (
        <>
          {member.title && <p>{member.title}</p>}
          <p>{roleNames(roleIds, roles) || <span className="text-muted">No company roles</span>}</p>
          <PersonContacts userId={member.user_id} name={name} canEdit={isMe} />
          {isMe && <button className="btn btn-danger" onClick={remove}>Leave company</button>}
        </>
      )}
    </aside>
  );
}
