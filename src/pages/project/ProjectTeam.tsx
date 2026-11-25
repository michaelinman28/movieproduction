import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LatticeGrid, gridDropdown, gridEsc, gridLinkList } from '../../components/LatticeGrid';
import { OpenLink } from '../../components/OpenLink';
import { TeamNotes } from '../../components/TeamNotes';
import { RenameForm } from '../../components/RenameForm';
import { useAuth } from '../../lib/auth';
import { Section } from '../../components/Section';
import { RolePicker } from '../../components/RolePicker';
import { PersonContacts } from '../../components/PersonContacts';
import { api, type Character, type ProjectMember, type TeamNoteType } from '../../lib/api';
import { displayName, errorText, roleIdsFor, roleNames } from '../../lib/format';
import type { Role } from '../../lib/database.types';
import type { Run } from '../CompanyPage';
import { confirmDiscard, useUnsaved } from '../../lib/unsaved';
import { scrollToForm, useOpenFromLink } from '../../lib/reveal';
import { itemPath } from '../../lib/links';
import { emailProblem, formatPhone, phoneOrThrow } from '../../lib/contact';
import { InviteButtons } from '../../components/InviteButtons';
import { useProject } from './ProjectLayout';

interface TeamRow { id: string; name: string; nickname: string; roles: string; email: string; phone: string; joined: string; account: string; dietary: string; allergy: string; plays: string }

/** The project's team: who's assigned, and their project roles. */
export function ProjectTeam() {
  const { project, projectId, isAdmin, team, companyMembers, roles, reload } = useProject();
  const { session } = useAuth();
  const me = session?.user.id;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [types, setTypes] = useState<TeamNoteType[]>([]);
  const loadTypes = useCallback(async () => {
    try { setTypes(await api.teamNoteTypes(project.company_id)); } catch (e) { setError(errorText(e)); }
  }, [project.company_id]);
  useEffect(() => { loadTypes(); }, [loadTypes]);
  // The characters each person plays (set on the Characters page).
  const [characters, setCharacters] = useState<Character[]>([]);
  useEffect(() => { api.characters(projectId).then(setCharacters).catch((e) => setError(errorText(e))); }, [projectId, team]);
  const playsOf = useCallback((userId: string) => characters.filter((c) => c.actor_id === userId), [characters]);
  const charLabel = (c: Character) => (c.cast_number != null ? `${c.name} (#${c.cast_number})` : c.name);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = reload;

  const run: Run = async (fn, ok) => {
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e)); return false; }
    if (ok) setNotice(ok);
    await load();
    return true;
  };

  // ---- Team ----------------------------------------------------------------
  const [addUser, setAddUser] = useState('');
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const onTeam = new Set(team.map((t) => t.user_id));
  const available = companyMembers
    .filter((m) => !onTeam.has(m.user_id))
    .map((m) => ({ id: m.user_id, name: displayName(m.profile) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function assign(e: FormEvent) {
    e.preventDefault();
    if (!addUser) return;
    const name = available.find((a) => a.id === addUser)?.name ?? 'them';
    const hasCompanyRoles = (companyMembers.find((m) => m.user_id === addUser)?.role_ids.length ?? 0) > 0;
    if (!confirmDiscard()) return;
    const id = addUser;
    if (await run(() => api.assign(projectId, id), hasCompanyRoles
      ? `Added ${name} to the project with their company roles. Change their project roles in the form if needed.`
      : `Added ${name} to the project. Pick their project roles in the form.`)) {
      setAddUser('');
      // Their project roles start as their company roles (copied by the database).
      // Open their form, to check or change them.
      setSelectedId(id);
      setReveal({ id, n: Date.now() });
      scrollToForm(id);
    }
  }

  // Someone not in the company yet: added to the company and the project at once,
  // even without an account (they join when they sign up with that email).
  const [newPerson, setNewPerson] = useState({ email: '', name: '', phone: '' });
  async function addNew(e: FormEvent) {
    e.preventDefault();
    const problem = emailProblem(newPerson.email);
    if (problem) { setError(problem); return; }
    if (!confirmDiscard()) return;
    const who = newPerson.name.trim() || newPerson.email.trim();
    let r: { user_id: string; result: string } | null = null;
    const ok = await run(async () => {
      r = await api.addProjectPerson(projectId, { email: newPerson.email.trim(), name: newPerson.name.trim() || null, phone: phoneOrThrow(newPerson.phone) });
    });
    if (!ok || !r) return;
    const { user_id: id, result } = r;
    setNotice(result === 'already_member' ? `${who} is already on this project.`
      : result === 'invited' ? `Added ${who} to the company and this project. They don't have an account yet, so send them an invite from their form.`
      : `Added ${who} to this project.`);
    setNewPerson({ email: '', name: '', phone: '' });
    setSelectedId(id);
    setReveal({ id, n: Date.now() });
    scrollToForm(id);
  }

  const teamRows = useMemo<TeamRow[]>(() => team.map((t) => ({
    id: t.user_id, name: displayName(t.profile), nickname: t.profile.nickname ?? '', email: t.profile.email ?? '', phone: t.profile.phone ?? '',
    roles: roleNames(t.role_ids, roles), joined: t.joined_at.slice(0, 10), account: t.profile.has_account === false ? 'Not yet' : 'Yes',
    dietary: t.dietary ?? '', allergy: t.dietary_allergy ? 'Yes' : 'No',
    plays: playsOf(t.user_id).map(charLabel).join(', '),
  })).sort((a, b) => a.name.localeCompare(b.name)), [team, roles, playsOf]); // eslint-disable-line react-hooks/exhaustive-deps

  const teamOptions = useMemo(() => ({
    rowId: (r: TeamRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true,
    emptyMessage: 'Nobody is assigned yet',
    // Name, email and phone belong to each person's own profile. Admins set roles;
    // admins and each person set their own dietary needs.
    columns: [
      { field: 'name', header: 'Name', width: 200 },
      { field: 'nickname', header: 'Nickname', width: 130 },
      {
        field: 'roles', header: 'Project roles', width: 280, editable: isAdmin, filter: 'set', filterSplit: ',',
        tooltip: () => 'Role names separated by commas. Select the person to tick roles from the list.',
      },
      {
        // Set on the Characters page (or by picking a character on a shoot day call).
        field: 'plays', header: 'Plays', width: 170, filter: 'set', filterSplit: ',',
        tooltip: () => 'The characters they play. Change casting on the Characters page.',
        render: ({ data }: { data: TeamRow }) => gridLinkList(playsOf(data.id).map((c) => ({
          text: charLabel(c), to: itemPath.character(projectId, c.id), title: `Open ${c.name} on the Characters page`,
        }))),
      },
      {
        field: 'dietary', header: 'Dietary needs', width: 200, editable: (r: TeamRow) => isAdmin || r.id === me,
        tooltip: () => 'Shown on the call sheet for catering',
        render: ({ value, data }: { value: string; data: TeamRow }) => (data.allergy === 'Yes' && value ? `<span class="task-overdue">${gridEsc(value)}</span>` : gridEsc(value)),
      },
      {
        field: 'allergy', header: 'Allergy', width: 100, editable: (r: TeamRow) => isAdmin || r.id === me, editor: 'select', editorOptions: ['No', 'Yes'],
        render: ({ value }: { value: string }) => gridDropdown(gridEsc(value)),
      },
      { field: 'email', header: 'Email', width: 220 },
      { field: 'phone', header: 'Phone', width: 140 },
      { field: 'account', header: 'Account', width: 100, filter: 'set',
        tooltip: (r: TeamRow) => r.account === 'Yes' ? 'Signed up' : 'Added before signing up. They join when they sign up with this email.' },
      { field: 'joined', header: 'Assigned', type: 'date', width: 120 },
    ],
  }), [isAdmin, me, playsOf, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveTeamCell(e: { data: TeamRow; column: string; newValue: unknown }) {
    if (e.column === 'dietary' || e.column === 'allergy') {
      const m = team.find((t) => t.user_id === e.data.id);
      const needs = e.column === 'dietary' ? String(e.newValue ?? '').trim() : m?.dietary ?? '';
      const allergy = e.column === 'allergy' ? e.newValue === 'Yes' : Boolean(m?.dietary_allergy);
      if (e.column === 'allergy' && allergy && !needs) { setError('Type their dietary needs first, then mark it as an allergy.'); await load(); return; }
      await run(() => api.setDietary(projectId, e.data.id, needs || null, allergy));
      return;
    }
    if (e.column !== 'roles') { await load(); return; }
    const { ids, unknown } = roleIdsFor(String(e.newValue ?? ''), roles);
    if (unknown.length) {
      setError(`There's no role called ${unknown.join(', ')}. Select the person to pick roles from the list.`);
      await load();
      return;
    }
    await run(() => api.setTeamRoles(projectId, e.data.id, ids));
  }

  const selected = team.find((t) => t.user_id === selectedId) ?? null;
  // A link from elsewhere (?open=<person>, e.g. from a call sheet or a task) opens their form.
  useOpenFromLink((id) => team.some((t) => t.user_id === id), (id) => {
    setSelectedId(id);
    setReveal({ id, n: Date.now() });
    scrollToForm(id);
  });

  return (
    <>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <Section id="project.team" title="Team" summary={`${team.length} ${team.length === 1 ? 'person' : 'people'}`}>
        {isAdmin && (
          available.length ? (
            <form className="form-row mb-2" onSubmit={assign}>
              <select className="field" value={addUser} onChange={(e) => setAddUser(e.target.value)} required>
                <option value="">Choose someone from the company…</option>
                {available.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <button type="submit" className="btn" data-pin>Assign to project</button>
            </form>
          ) : (
            <p className="hint mt-2">Everyone in the company is on this project.</p>
          )
        )}
        {isAdmin && (
          <details className="mb-2" open={!available.length}>
            <summary className="flex min-h-11 cursor-pointer items-center text-accent">Add someone who isn't in the company yet</summary>
            <form className="form-row mt-1" onSubmit={addNew}>
              <input className="field" type="email" placeholder="Email" aria-label="Email" value={newPerson.email} maxLength={254} required
                onChange={(e) => setNewPerson({ ...newPerson, email: e.target.value })} />
              <input className="field" placeholder="Name" aria-label="Name" value={newPerson.name} maxLength={120}
                onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value })} />
              <input className="field" type="tel" placeholder="Phone (optional)" aria-label="Phone" value={newPerson.phone} maxLength={40}
                onChange={(e) => setNewPerson({ ...newPerson, phone: e.target.value })} onBlur={() => setNewPerson((n) => ({ ...n, phone: formatPhone(n.phone) }))} />
              <button type="submit" className="btn btn-secondary">Add to project</button>
            </form>
            <p className="hint mt-1">They're added to {project.company?.name ?? 'the company'} and this project. They don't need an account yet: you can give them tasks now, and they join when they sign up with this email.</p>
          </details>
        )}
        {/* The form opens under the table, which keeps the full width. */}
        <div className="flex flex-col gap-4">
          <LatticeGrid
            stateId="project.team"
            options={teamOptions}
            rows={teamRows}
            reveal={reveal}
            height={Math.min(80 + teamRows.length * 34, 420)}
            on={{ selectionChanged: (rows: TeamRow[]) => { const id = rows[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); }, cellValueChanged: saveTeamCell }}
          />
          {selected && (
            <TeamPanel
              key={selected.user_id}
              projectId={projectId}
              companyId={project.company_id}
              companyName={project.company?.name ?? ''}
              projectName={project.name}
              member={selected}
              roles={roles}
              types={types}
              plays={playsOf(selected.user_id)}
              isMe={selected.user_id === me}
              isAdmin={isAdmin}
              run={run}
              onRemoved={() => setSelectedId(null)}
            />
          )}
        </div>
        {!selected && teamRows.length > 0 && (
          <p className="hint mt-2">
            Select a person to see their details{isAdmin ? ', set their project roles and dietary needs, and keep notes about them' : ''}.
            {!isAdmin && ' Select yourself to set your dietary needs and keep notes about yourself.'}
          </p>
        )}
      </Section>

      {isAdmin && <NoteTypes companyId={project.company_id} types={types} reload={loadTypes} />}

    </>
  );
}

function TeamPanel({ projectId, companyId, companyName, projectName, member, roles, types, plays, isMe, isAdmin, run, onRemoved }: {
  projectId: string; companyId: string; companyName: string; projectName: string; member: ProjectMember; roles: Role[];
  types: TeamNoteType[]; plays: Character[]; isMe: boolean; isAdmin: boolean; run: Run; onRemoved: () => void;
}) {
  const name = displayName(member.profile);
  const roleIds = new Set(member.role_ids);
  // Project roles and dietary needs are held until Save.
  const initial = useMemo(() => ({ roles: [...member.role_ids].sort(), dietary: member.dietary ?? '', allergy: member.dietary_allergy }), [member]);
  const [draft, setDraft] = useState(initial);
  const rolesChanged = draft.roles.join() !== initial.roles.join();
  const foodChanged = draft.dietary.trim() !== initial.dietary || draft.allergy !== initial.allergy;
  const changed = rolesChanged || foodChanged;
  useUnsaved(changed);
  useEffect(() => { if (!changed) setDraft(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleRole = (roleId: string, on: boolean) =>
    setDraft((d) => ({ ...d, roles: (on ? [...d.roles, roleId] : d.roles.filter((r) => r !== roleId)).sort() }));
  const canFood = isAdmin || isMe;

  async function save(e: FormEvent) {
    e.preventDefault();
    const needs = draft.dietary.trim();
    await run(async () => {
      if (rolesChanged) await api.setTeamRoles(projectId, member.user_id, draft.roles);
      if (foodChanged) await api.setDietary(projectId, member.user_id, needs || null, draft.allergy && Boolean(needs));
    }, `Saved ${isMe ? 'your' : `${name}'s`} details.`);
  }

  async function remove() {
    if (!window.confirm(`Remove ${name} from this project? They stay in the company.`)) return;
    if (await run(() => api.unassign(projectId, member.user_id), `Removed ${name} from the project.`)) onRemoved();
  }

  const foodSummary = member.dietary ? `${member.dietary_allergy ? 'Allergy: ' : ''}${member.dietary}` : 'None';
  return (
    <aside data-pin-scope data-form-for={member.user_id} className="card gap-2">
      {/* The person's name opens them on the company's People list, with all their details. */}
      <h3><Link to={itemPath.person(companyId, member.user_id)} title={`Open ${name} in the company's people`}>{name}</Link></h3>
      <p className="hint mt-2">{member.profile.email}{member.profile.phone ? <><br />{member.profile.phone}</> : null}</p>
      {member.profile.has_account === false && isAdmin && (
        <InviteButtons info={{ name, email: member.profile.email ?? '', company: companyName, project: projectName }} />
      )}
      <PersonContacts userId={member.user_id} name={name} canEdit={false} />
      {plays.length > 0 && (
        <Section id="project.person.characters" title="Characters" level="h4" summary={plays.map((c) => c.name).join(', ')}>
          <ul className="flex flex-col">
            {plays.map((c) => (
              <li key={c.id}>
                <OpenLink to={itemPath.character(projectId, c.id)} title={`Open ${c.name} on the Characters page`}>
                  {c.cast_number != null ? `#${c.cast_number} ` : ''}{c.name}
                </OpenLink>
              </li>
            ))}
          </ul>
          <p className="hint">Change casting on the Characters page.</p>
        </Section>
      )}
      <form className="flex flex-col gap-2" onSubmit={save}>
        <Section id="project.person.roles" title="Project roles" level="h4" summary={isAdmin ? (draft.roles.length ? `${draft.roles.length} picked` : 'None') : undefined}>
          {isAdmin
            ? <RolePicker id="project.person.roles" roles={roles} selected={new Set(draft.roles)} onToggle={toggleRole} />
            : <p>{roleNames(roleIds, roles) || <span className="text-muted">No project roles</span>}</p>}
        </Section>
        <Section id="project.person.dietary" title="Dietary needs" level="h4" summary={foodSummary}>
          {canFood ? (
            <div className="flex flex-col gap-2">
              <label className="label">{isMe ? 'Your dietary needs on this project' : `${name}'s dietary needs on this project`}
                <textarea className="field" rows={2} value={draft.dietary} maxLength={500} placeholder="e.g. Vegetarian, no nuts"
                  onChange={(e) => setDraft({ ...draft, dietary: e.target.value })} />
              </label>
              <label className="check">
                <input type="checkbox" checked={draft.allergy} disabled={!draft.dietary.trim()} onChange={(e) => setDraft({ ...draft, allergy: e.target.checked })} />
                This is an allergy (shown in red)
              </label>
              <p className="hint">Shown on the call sheet for catering, and on {isMe ? 'your' : 'their'} own call sheet link. Never on the shared link.</p>
            </div>
          ) : (
            <p className={member.dietary_allergy ? 'font-semibold text-danger' : ''}>{member.dietary ? foodSummary : <span className="text-muted">None given</span>}</p>
          )}
        </Section>
        {(isAdmin || canFood) && (
          <>
            <div className="flex gap-2">
              <button type="submit" className="btn flex-1 md:flex-none" disabled={!changed} data-pin="2">Save</button>
              <button type="button" className="btn btn-secondary" disabled={!changed} onClick={() => setDraft(initial)}>Undo changes</button>
            </div>
            {changed && <p className="hint">Unsaved changes.</p>}
          </>
        )}
      </form>
      {(isAdmin || isMe) && <TeamNotes projectId={projectId} userId={member.user_id} name={name} types={types} isAdmin={isAdmin} />}
      {isAdmin && <button className="btn btn-danger" onClick={remove}>Remove from project</button>}
    </aside>
  );
}

/** The company's team note types (admins): add, rename, delete. */
function NoteTypes({ companyId, types, reload }: { companyId: string; types: TeamNoteType[]; reload: () => Promise<void> }) {
  const [newName, setNewName] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); } catch (e) { setError(errorText(e)); await reload(); return false; }
    await reload();
    return true;
  };
  const rows = useMemo(() => types.map((t) => ({ id: t.id, name: t.name, notes: t.notes })), [types]);
  const options = useMemo(() => ({
    rowId: (r: { id: string }) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true,
    emptyMessage: 'No note types',
    columns: [
      { field: 'name', header: 'Note type', width: 220, editable: true },
      { field: 'notes', header: 'Notes', type: 'number', width: 100, filter: false },
    ],
  }), []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createTeamNoteType(companyId, name)).id; })) {
      setNewName('');
      setSelectedId(id);
      setReveal({ id, n: Date.now() });
      scrollToForm(id);
    }
  }

  const selected = types.find((t) => t.id === selectedId) ?? null;
  async function remove(t: TeamNoteType) {
    const msg = t.notes ? `Delete the ${t.name} note type? Its ${t.notes === 1 ? 'note stays' : `${t.notes} notes stay`}, with no type.` : `Delete the ${t.name} note type?`;
    if (window.confirm(msg) && await run(() => api.deleteTeamNoteType(t.id))) setSelectedId(null);
  }

  return (
    <Section id="project.team.noteTypes" title="Team note types" summary={types.length} bodyClassName="flex flex-col gap-2">
      <p className="hint">The kinds of notes you can keep about people, shared by every project in the company. Double-click a type to rename it, or select it to rename or delete it below.</p>
      <form className="form-row" onSubmit={add}>
        <input className="field" placeholder="New note type, e.g. Pets" aria-label="New note type" value={newName} maxLength={40} required onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="btn btn-secondary">Add note type</button>
      </form>
      {error && <p className="error">{error}</p>}
      <LatticeGrid stateId="project.team.noteTypes" options={options} rows={rows} reveal={reveal} height={Math.min(80 + rows.length * 34, 320)}
        on={{
          selectionChanged: (r: { id: string }[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); },
          cellValueChanged: (e: { data: { id: string }; newValue: unknown }) => {
            const v = String(e.newValue ?? '').trim();
            if (v) run(() => api.renameTeamNoteType(e.data.id, v)); else reload();
          },
        }} />
      {selected && (
        <div className="card gap-2" data-form-for={selected.id}>
          <span className="hint">{selected.name}: used by {selected.notes} {selected.notes === 1 ? 'note' : 'notes'}.</span>
          <RenameForm key={selected.id} label="Note type name" value={selected.name} maxLength={40}
            onSave={(name) => run(() => api.renameTeamNoteType(selected.id, name))} />
          <button className="btn btn-danger sm:self-start" onClick={() => remove(selected)}>Delete note type</button>
        </div>
      )}
    </Section>
  );
}
