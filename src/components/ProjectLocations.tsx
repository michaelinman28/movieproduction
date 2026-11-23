import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { LatticeGrid, gridDropdown, gridEsc } from './LatticeGrid';
import { Section } from './Section';
import { api, type Location, type LocationInput, type LocationStatus } from '../lib/api';
import { useAuth } from '../lib/auth';
import { confirmDiscard, useUnsaved } from '../lib/unsaved';
import { scrollToForm } from '../lib/reveal';
import { LOCATION_STATUSES, errorText, labelOf, valueOf } from '../lib/format';

interface LocationRow {
  id: string; name: string; description: string; address: string;
  contact_name: string; contact_email: string; contact_phone: string; status: string; tasks: number;
}
type Field = keyof Omit<LocationRow, 'id' | 'tasks' | 'status'>;
const FIELDS: Field[] = ['name', 'description', 'address', 'contact_name', 'contact_email', 'contact_phone'];

const toRow = (l: Location): LocationRow => ({
  id: l.id, name: l.name, description: l.description ?? '', address: l.address ?? '',
  contact_name: l.contact_name ?? '', contact_email: l.contact_email ?? '', contact_phone: l.contact_phone ?? '', status: labelOf(LOCATION_STATUSES, l.status), tasks: l.tasks,
});

/** A link that opens the address in the phone's or computer's maps app. */
const pill = (label: string) =>
  `<span class="task-pill task-pill-loc-${valueOf(LOCATION_STATUSES, label) ?? 'considering'}">${gridEsc(label)}</span>`;

// Whether to list the locations marked "Not using"; remembered on this device.
const SHOW_KEY = 'mp-locations-show-unused';
const readShow = () => { try { return localStorage.getItem(SHOW_KEY) === '1'; } catch { return false; } };

const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

/**
 * A project's locations: where it shoots or works, with an address and an on-site
 * contact. Anyone on the project adds and edits them; whoever added one, or an
 * admin, deletes it. Tasks are assigned to a location in the task grid or panel.
 */
export function ProjectLocations({ projectId, locations, canManage, onChanged }: {
  projectId: string; locations: Location[]; canManage: boolean; onChanged: () => Promise<void>;
}) {
  const { session } = useAuth();
  const me = session?.user.id;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showUnused, setShowUnused] = useState(readShow);
  function toggleUnused(on: boolean) {
    setShowUnused(on);
    try { if (on) localStorage.setItem(SHOW_KEY, '1'); else localStorage.removeItem(SHOW_KEY); } catch { /* storage unavailable */ }
  }

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e)); await onChanged(); return false; }
    if (ok) setNotice(ok);
    await onChanged();
    return true;
  };

  const unused = locations.filter((l) => l.status === 'not_using').length;
  const rows = useMemo(() => locations.filter((l) => showUnused || l.status !== 'not_using').map(toRow), [locations, showUnused]);
  const options = useMemo(() => ({
    rowId: (r: LocationRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true,
    emptyMessage: locations.length ? 'Every location is marked Not using' : 'No locations yet',
    columns: [
      { field: 'name', header: 'Location', width: 180, editable: true, pinned: 'left' },
      {
        field: 'status', header: 'Status', width: 140, editable: true, editor: 'select',
        editorOptions: LOCATION_STATUSES.map((s) => s.label),
        render: ({ value }: { value: string }) => gridDropdown(pill(value)),
      },
      { field: 'address', header: 'Address', width: 240, editable: true, editor: 'textarea' },
      { field: 'contact_name', header: 'Contact', width: 160, editable: true },
      { field: 'contact_email', header: 'Contact email', width: 200, editable: true },
      { field: 'contact_phone', header: 'Contact phone', width: 150, editable: true },
      { field: 'description', header: 'Description', width: 260, editable: true, editor: 'textarea' },
      { field: 'tasks', header: 'Tasks', type: 'number', width: 90 },
    ],
  }), [locations.length]);

  async function saveCell(e: { data: LocationRow; column: string; newValue: unknown }) {
    const v = String(e.newValue ?? '').trim();
    if (e.column === 'status') {
      const status = valueOf(LOCATION_STATUSES, v) as LocationStatus | undefined;
      if (status) await run(() => api.updateLocation(e.data.id, { status }), status === 'not_using' && !showUnused ? `${e.data.name} is hidden now. Tick "Show the ones we're not using" to see it.` : undefined);
      else await onChanged();
      return;
    }
    if (!FIELDS.includes(e.column as Field) || (e.column === 'name' && !v)) { await onChanged(); return; }
    await run(() => api.updateLocation(e.data.id, { [e.column]: v || null }));
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createLocation(projectId, { name })).id; }, `Added ${name}. Fill in its address and contact on the right.`)) {
      setNewName('');
      setSelectedId(id);
      setReveal({ id, n: Date.now() });
      scrollToForm(id);
    }
  }

  const selected = locations.find((l) => l.id === selectedId) ?? null;

  return (
    <Section id="project.locations" title="Locations"
      summary={locations.length ? `${locations.length - unused} in use${unused ? `, ${unused} not` : ''}` : undefined}>
      <form className="form-row mb-2" onSubmit={add}>
        <input className="field" placeholder="New location, e.g. Old Mill" aria-label="New location name" value={newName} maxLength={120}
          onChange={(e) => setNewName(e.target.value)} required />
        <button type="submit" className="btn" data-pin>Add location</button>
      </form>
      {unused > 0 && (
        <label className="check mb-2">
          <input type="checkbox" checked={showUnused} onChange={(e) => toggleUnused(e.target.checked)} />
          Show the ones we're not using ({unused})
        </label>
      )}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {/* The panel's space stays put so selecting a row doesn't resize the grid mid double-click. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <LatticeGrid options={options} rows={rows} height={Math.min(80 + rows.length * 34, 360)} reveal={reveal}
          on={{ cellValueChanged: saveCell, selectionChanged: (r: LocationRow[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); } }} />
        {selected ? (
          <LocationPanel key={selected.id} location={selected} run={run}
            canDelete={canManage || selected.created_by === me} onDeleted={() => setSelectedId(null)} />
        ) : (
          <aside data-pin-scope className="card hidden lg:flex">
            <p className="hint">Select a location to see and edit all of its details.</p>
          </aside>
        )}
      </div>
      {rows.length > 0 && (
        <p className="hint mt-2">Double-click a cell to change it, or select a location to edit it in a form. Assign tasks to a location in the Tasks section.</p>
      )}
    </Section>
  );
}

function LocationPanel({ location, run, canDelete, onDeleted }: {
  location: Location;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  canDelete: boolean; onDeleted: () => void;
}) {
  // Every field here, status included, is held until Save.
  const initial = useMemo(() => ({ ...toRow(location), status: location.status as string }), [location]);
  const [draft, setDraft] = useState(initial);
  const changed = FIELDS.some((f) => draft[f].trim() !== initial[f]) || draft.status !== initial.status;
  useUnsaved(changed);
  // Show changes made elsewhere (the table) unless something here is unsaved.
  useEffect(() => { if (!changed) setDraft(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (f: Field | 'status') => (e: { target: { value: string } }) => setDraft({ ...draft, [f]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    const patch: LocationInput = {};
    for (const f of FIELDS) if (draft[f].trim() !== initial[f]) patch[f] = draft[f].trim() || (f === 'name' ? undefined : null) as never;
    if (draft.status !== initial.status) patch.status = draft.status as LocationStatus;
    if (await run(() => api.updateLocation(location.id, patch), `Saved ${draft.name.trim()}.`)) {
      setDraft((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])) as typeof d);
    }
  }

  async function remove() {
    const msg = location.tasks
      ? `Delete ${location.name}? ${location.tasks === 1 ? '1 task' : `${location.tasks} tasks`} will have no location.`
      : `Delete ${location.name}?`;
    if (window.confirm(msg) && await run(() => api.deleteLocation(location.id), `Deleted ${location.name}.`)) onDeleted();
  }

  return (
    <aside data-pin-scope data-form-for={location.id} className="card gap-2 lg:max-h-[640px] lg:overflow-auto">
      <h3>{location.name}</h3>
      <p className="hint">{location.tasks ? `${location.tasks === 1 ? '1 task is' : `${location.tasks} tasks are`} here.` : 'No tasks here yet.'}</p>
      <form className="flex flex-col gap-2" onSubmit={save}>
        <label className="label">Name
          <input className="field" value={draft.name} maxLength={120} required onChange={set('name')} />
        </label>
        <label className="label">Status
          <select className="field" value={draft.status} onChange={set('status')}>
            {LOCATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="label">Description
          <textarea className="field" rows={3} value={draft.description} maxLength={2000} onChange={set('description')} />
        </label>
        <label className="label">Address
          <textarea className="field" rows={2} value={draft.address} maxLength={500} autoComplete="street-address" onChange={set('address')} />
          {initial.address && <a className="text-sm" href={mapsUrl(initial.address)} target="_blank" rel="noreferrer">Open in maps</a>}
        </label>
        <label className="label">Contact name
          <input className="field" value={draft.contact_name} maxLength={120} onChange={set('contact_name')} />
        </label>
        <label className="label">Contact email
          <input className="field" type="email" value={draft.contact_email} maxLength={254} onChange={set('contact_email')} />
        </label>
        <label className="label">Contact phone
          <input className="field" type="tel" value={draft.contact_phone} maxLength={40} onChange={set('contact_phone')} />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn flex-1" disabled={!changed} data-pin="2">Save</button>
          <button type="button" className="btn btn-secondary" disabled={!changed} onClick={() => setDraft(initial)}>Undo changes</button>
        </div>
        {changed && <p className="hint">Unsaved changes.</p>}
      </form>
      {(initial.contact_email || initial.contact_phone) && (
        <p className="flex flex-wrap gap-3 text-sm">
          {initial.contact_phone && <a href={`tel:${initial.contact_phone.replace(/[^\d+]/g, '')}`}>Call {initial.contact_name || 'contact'}</a>}
          {initial.contact_email && <a href={`mailto:${initial.contact_email}`}>Email {initial.contact_name || 'contact'}</a>}
        </p>
      )}
      {canDelete && <button className="btn btn-danger" onClick={remove}>Delete location</button>}
    </aside>
  );
}
