import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LatticeGrid } from '../components/LatticeGrid';
import { Section } from '../components/Section';
import { api, type Company, type RoleWithUsage } from '../lib/api';
import { errorText } from '../lib/format';

const NEW_DEPT = '__new__';

interface RoleRow { id: string; name: string; department: string; description: string; people: number }

const toRow = (r: RoleWithUsage): RoleRow => ({
  id: r.id, name: r.name, department: r.department ?? '', description: r.description ?? '', people: r.people,
});

export function RolesPage() {
  const { companyId = '' } = useParams();
  const [company, setCompany] = useState<Company | null>(null);
  const [roles, setRoles] = useState<RoleWithUsage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState({ name: '', department: '', description: '' });
  // The department is picked from a list of the ones already in use, or typed in
  // when "New department…" is chosen.
  const [newDept, setNewDept] = useState(false);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([api.company(companyId), api.roles(companyId)]);
      setCompany(c);
      setRoles(r);
    } catch (e) { setError(errorText(e)); }
    setLoaded(true);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const isAdmin = Boolean(company?.is_admin);
  const custom = useMemo(() => roles.filter((r) => r.is_custom).map(toRow).sort((a, b) => a.name.localeCompare(b.name)), [roles]);
  const standard = useMemo(() => roles.filter((r) => !r.is_custom).map(toRow), [roles]);
  const departments = useMemo(() => [...new Set(roles.map((r) => r.department).filter(Boolean) as string[])].sort(), [roles]);

  async function addRole(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const r = await api.createRole(companyId, {
        name: draft.name.trim(), department: draft.department.trim() || null, description: draft.description.trim() || null,
      });
      setNotice(`Added ${r.name}. Assign it to people from the company or project pages.`);
      setDraft({ name: '', department: '', description: '' });
      setNewDept(false);
      await load();
    } catch (err) { setError(errorText(err)); }
  }

  async function saveEdit(e: { data: RoleRow; column: string; newValue: unknown }) {
    if (!['name', 'department', 'description'].includes(e.column)) return;
    const value = typeof e.newValue === 'string' ? e.newValue.trim() : '';
    if (e.column === 'name' && !value) { setError('A role needs a name.'); return load(); }
    setError(null);
    setNotice(null);
    try {
      await api.updateRole(e.data.id, { [e.column]: value || null });
      setNotice('Saved.');
    } catch (err) { setError(errorText(err)); }
    await load(); // shows the saved value, or puts back the old one if saving failed
  }

  const selected = custom.find((r) => r.id === selectedId) ?? null;
  const [form, setForm] = useState({ name: '', department: '', description: '' });
  useEffect(() => {
    if (selected) setForm({ name: selected.name, department: selected.department, description: selected.description });
    // Reset the form only when a different role is selected, or after a save reloads it.
  }, [selected?.id, selected?.name, selected?.department, selected?.description]); // eslint-disable-line react-hooks/exhaustive-deps
  async function saveForm(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setNotice(null);
    try {
      await api.updateRole(selected.id, {
        name: form.name.trim(), department: form.department.trim() || null, description: form.description.trim() || null,
      });
      setNotice(`Saved ${form.name.trim()}.`);
    } catch (err) { setError(errorText(err)); }
    await load();
  }
  async function deleteRole() {
    if (!selected) return;
    const who = selected.people === 1 ? '1 person' : `${selected.people} people`;
    const msg = selected.people
      ? `Delete ${selected.name}? ${who} will lose this role in the company and on its projects.`
      : `Delete ${selected.name}?`;
    if (!window.confirm(msg)) return;
    setError(null);
    try {
      await api.deleteRole(selected.id);
      setNotice(`Deleted ${selected.name}.`);
      setSelectedId(null);
      await load();
    } catch (err) { setError(errorText(err)); }
  }

  const customOptions = useMemo(() => ({
    rowId: (r: RoleRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, readOnly: !isAdmin,
    emptyMessage: isAdmin ? 'No custom roles yet. Add one above.' : 'This company has no custom roles',
    columns: [
      { field: 'name', header: 'Role', width: 220, editable: true },
      { field: 'department', header: 'Department', width: 160, editable: true },
      { field: 'description', header: 'Description', width: 320, editable: true, editor: 'textarea' },
      { field: 'people', header: 'People', type: 'number', width: 90 },
    ],
  }), [isAdmin]);

  const standardOptions = useMemo(() => ({
    rowId: (r: RoleRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false, readOnly: true,
    columns: [
      { field: 'name', header: 'Role', width: 220 },
      { field: 'department', header: 'Department', width: 160 },
      { field: 'description', header: 'Description', width: 320 },
      { field: 'people', header: 'People', type: 'number', width: 90 },
    ],
  }), []);

  if (!loaded) return <p className="text-muted">Loading…</p>;
  if (!company) return <p>{error ?? "That company doesn't exist or you don't have access."} <Link to="/">Back to companies</Link></p>;

  return (
    <section className="flex flex-col gap-6">
      <p className="text-sm text-muted">
        <Link to="/">Companies</Link> / <Link to={`/companies/${companyId}`}>{company.name}</Link> / Roles
      </p>
      <header>
        <h1>Roles</h1>
        <p className="mt-1 text-muted">
          Every company gets the {standard.length} standard film roles. {isAdmin ? 'Add your own roles for anything else your productions need.' : 'Admins can add custom roles for this company.'}
        </p>
      </header>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <Section id="roles.custom" title="Custom roles" summary={custom.length}>
        {isAdmin && (
          <form className="form-row mb-2" onSubmit={addRole}>
            <input className="field" placeholder="Role name, e.g. Drone Pilot" value={draft.name} maxLength={80}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
            <input className="field" placeholder="Description (optional)" aria-label="Description" value={draft.description} maxLength={500}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            {newDept ? (
              <div className="flex gap-2">
                <input className="field" placeholder="New department name" value={draft.department} maxLength={60} autoFocus
                  aria-label="New department" onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
                <button type="button" className="btn btn-secondary" onClick={() => { setNewDept(false); setDraft({ ...draft, department: '' }); }}>
                  Back to list
                </button>
              </div>
            ) : (
              <select className="field" aria-label="Department" value={draft.department}
                onChange={(e) => {
                  if (e.target.value === NEW_DEPT) { setNewDept(true); setDraft({ ...draft, department: '' }); }
                  else setDraft({ ...draft, department: e.target.value });
                }}>
                <option value="">No department</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                <option value={NEW_DEPT}>New department…</option>
              </select>
            )}
            <button type="submit" className="btn">Add role</button>
          </form>
        )}
        {/* The side panel is always there for admins, so selecting a row doesn't resize the
            grid mid double-click (which would stop the cell from opening for editing). */}
        <div className={`grid grid-cols-1 gap-4 ${isAdmin ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}>
          <LatticeGrid options={customOptions} rows={custom} height={Math.min(100 + custom.length * 34, 400)}
            on={{
              cellValueChanged: saveEdit,
              selectionChanged: (rows: RoleRow[]) => setSelectedId(rows[0]?.id ?? null),
            }} />
          {isAdmin && (selected ? (
            <aside className="card gap-2">
              <h3>{selected.name}</h3>
              <p className="hint">
                {selected.people ? `${selected.people === 1 ? '1 person holds' : `${selected.people} people hold`} this role.` : 'Nobody holds this role yet.'}
              </p>
              <form className="flex flex-col gap-2" onSubmit={saveForm}>
                <label className="label">Name
                  <input className="field" value={form.name} maxLength={80} required onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="label">Department
                  <input className="field" value={form.department} maxLength={60} list="role-departments"
                    onChange={(e) => setForm({ ...form, department: e.target.value })} />
                  <datalist id="role-departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
                </label>
                <label className="label">Description
                  <textarea className="field" rows={3} value={form.description} maxLength={500}
                    onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </label>
                <button type="submit" className="btn">Save</button>
              </form>
              <button className="btn btn-danger" onClick={deleteRole}>Delete role</button>
            </aside>
          ) : custom.length > 0 && (
            <aside className="card hidden gap-2 lg:flex">
              <p className="hint">Select a role to edit it in a form, see who holds it, or delete it.</p>
            </aside>
          ))}
        </div>
        {isAdmin && custom.length > 0 && (
          <p className="hint mt-2">Double-click (or tap twice) a cell to rename a role or change its department or description. Select a role to delete it.</p>
        )}
      </Section>

      <Section id="roles.standard" title="Standard roles" summary={standard.length}>
        <LatticeGrid options={standardOptions} rows={standard} height={360} />
      </Section>
    </section>
  );
}
