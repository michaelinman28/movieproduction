import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LatticeGrid } from '../../components/LatticeGrid';
import { Section } from '../../components/Section';
import { RolePicker } from '../../components/RolePicker';
import { PersonContacts } from '../../components/PersonContacts';
import { api, type ProjectMember } from '../../lib/api';
import { displayName, errorText, roleIdsFor, roleNames } from '../../lib/format';
import type { Role } from '../../lib/database.types';
import type { Run } from '../CompanyPage';
import { confirmDiscard, useUnsaved } from '../../lib/unsaved';
import { scrollToForm } from '../../lib/reveal';
import { useProject } from './ProjectLayout';

interface TeamRow { id: string; name: string; nickname: string; roles: string; email: string; phone: string; joined: string }

/** The project's team: who's assigned, and their project roles. */
export function ProjectTeam() {
  const { project, projectId, isAdmin, team, companyMembers, roles, reload } = useProject();
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    if (!confirmDiscard()) return;
    const id = addUser;
    if (await run(() => api.assign(projectId, id), `Added ${name} to the project. Pick their project roles in the form.`)) {
      setAddUser('');
      // Open their form, to pick their project roles.
      setSelectedId(id);
      setReveal({ id, n: Date.now() });
      scrollToForm(id);
    }
  }

  const teamRows = useMemo<TeamRow[]>(() => team.map((t) => ({
    id: t.user_id, name: displayName(t.profile), nickname: t.profile.nickname ?? '', email: t.profile.email ?? '', phone: t.profile.phone ?? '',
    roles: roleNames(t.role_ids, roles), joined: t.joined_at.slice(0, 10),
  })).sort((a, b) => a.name.localeCompare(b.name)), [team, roles]);

  const teamOptions = useMemo(() => ({
    rowId: (r: TeamRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, readOnly: !isAdmin,
    emptyMessage: 'Nobody is assigned yet',
    // Name, email and phone belong to each person's own profile.
    columns: [
      { field: 'name', header: 'Name', width: 200 },
      { field: 'nickname', header: 'Nickname', width: 130 },
      {
        field: 'roles', header: 'Project roles', width: 280, editable: true, filter: 'set', filterSplit: ',',
        tooltip: () => 'Role names separated by commas. Select the person to tick roles from the list.',
      },
      { field: 'email', header: 'Email', width: 220 },
      { field: 'phone', header: 'Phone', width: 140 },
      { field: 'joined', header: 'Assigned', type: 'date', width: 120 },
    ],
  }), [isAdmin]);

  async function saveTeamCell(e: { data: TeamRow; column: string; newValue: unknown }) {
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
            <p className="hint mt-2">
              Everyone in the company is on this project. To assign someone new, first add them on the{' '}
              <Link to={`/companies/${project.company_id}`}>company page</Link>.
            </p>
          )
        )}
        {/* The form opens under the table, which keeps the full width. */}
        <div className="flex flex-col gap-4">
          <LatticeGrid
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
              member={selected}
              roles={roles}
              isAdmin={isAdmin}
              run={run}
              onRemoved={() => setSelectedId(null)}
            />
          )}
        </div>
        {!selected && teamRows.length > 0 && <p className="hint mt-2">Select a person to see their details{isAdmin ? ' and set their project roles' : ''}.</p>}
      </Section>

    </>
  );
}

function TeamPanel({ projectId, companyId, member, roles, isAdmin, run, onRemoved }: {
  projectId: string; companyId: string; member: ProjectMember; roles: Role[]; isAdmin: boolean; run: Run; onRemoved: () => void;
}) {
  const name = displayName(member.profile);
  const roleIds = new Set(member.role_ids);
  // Project roles are held until Save.
  const initial = useMemo(() => [...member.role_ids].sort(), [member]);
  const [draft, setDraft] = useState(initial);
  const changed = draft.join() !== initial.join();
  useUnsaved(changed);
  useEffect(() => { if (!changed) setDraft(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleRole = (roleId: string, on: boolean) =>
    setDraft((d) => (on ? [...d, roleId] : d.filter((r) => r !== roleId)).sort());
  async function save(e: FormEvent) {
    e.preventDefault();
    await run(() => api.setTeamRoles(projectId, member.user_id, draft), `Saved ${name}'s project roles.`);
  }

  async function remove() {
    if (!window.confirm(`Remove ${name} from this project? They stay in the company.`)) return;
    if (await run(() => api.unassign(projectId, member.user_id), `Removed ${name} from the project.`)) onRemoved();
  }

  return (
    <aside data-pin-scope data-form-for={member.user_id} className="card gap-2">
      {/* The person's name opens them on the company's People list, with all their details. */}
      <h3><Link to={`/companies/${companyId}?person=${member.user_id}`} title={`Open ${name} in the company's people`}>{name}</Link></h3>
      <p className="hint mt-2">{member.profile.email}{member.profile.phone ? <><br />{member.profile.phone}</> : null}</p>
      <PersonContacts userId={member.user_id} name={name} canEdit={false} />
      {isAdmin ? (
        <>
          <form className="flex flex-col gap-2" onSubmit={save}>
            <Section id="project.person.roles" title="Project roles" level="h4" summary={draft.length ? `${draft.length} picked` : 'None'}>
              <RolePicker id="project.person.roles" roles={roles} selected={new Set(draft)} onToggle={toggleRole} />
            </Section>
            <div className="flex gap-2">
              <button type="submit" className="btn flex-1" disabled={!changed} data-pin="2">Save</button>
              <button type="button" className="btn btn-secondary" disabled={!changed} onClick={() => setDraft(initial)}>Undo changes</button>
            </div>
            {changed && <p className="hint">Unsaved changes.</p>}
          </form>
          <button className="btn btn-danger" onClick={remove}>Remove from project</button>
        </>
      ) : (
        <p>{roleNames(roleIds, roles) || <span className="text-muted">No project roles</span>}</p>
      )}
    </aside>
  );
}
