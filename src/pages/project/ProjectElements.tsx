import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { LatticeGrid, type PickMany, gridDropdown, gridEsc, gridLinkList } from '../../components/LatticeGrid';
import { OpenLink } from '../../components/OpenLink';
import { RenameForm } from '../../components/RenameForm';
import { Section } from '../../components/Section';
import { ItemHistory } from '../../components/ItemHistory';
import { TagPicker } from '../../components/TagPicker';
import { api, type Character, type Element, type ElementCategory, type ElementInput, type Location, type Scene } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ELEMENT_STATUSES, NONE, displayName, errorText, labelOf, valueOf, type ElementStatus } from '../../lib/format';
import { itemPath } from '../../lib/links';
import { scrollToForm, useOpenFromLink } from '../../lib/reveal';
import { confirmDiscard, useUnsaved } from '../../lib/unsaved';
import { useProject } from './ProjectLayout';

type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
type Person = { id: string; name: string };

const sceneName = (s: Pick<Scene, 'number' | 'set_name'>) => `Scene ${s.number}${s.set_name ? `: ${s.set_name}` : ''}`;
const withNone = (labels: string[]) => [NONE, ...labels];
const characterName = (c: Pick<Character, 'name' | 'cast_number'>) => (c.cast_number != null ? `${c.cast_number}. ${c.name}` : c.name);
const LEFT = 'Left the project';

/** A quantity as typed: blank is none; otherwise a whole number from 1 up. */
function parseQuantity(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t) || Number(t) < 1 || Number(t) > 100000) throw new Error('A quantity is a whole number, like 1 or 20.');
  return Number(t);
}

/** An element's status as a coloured pill. */
const statusPill = (label: string) =>
  `<span class="task-pill task-pill-el-${valueOf(ELEMENT_STATUSES, label) ?? 'needed'}">${gridEsc(label)}</span>`;

interface ElementRow {
  id: string; name: string; category: string; status: string; quantity: string; character: string; scenes: string;
  owner: string; location: string; description: string; notes: string;
  characterId: string | null; ownerId: string | null; locationId: string | null; sceneIds: string[];
}

/**
 * A project's elements: everything the shoot needs from the script breakdown (props,
 * wardrobe, vehicles, effects…). Each is stored once and linked to the scenes that use
 * it; the Scenes page shows and changes the same links. An element can belong to one
 * character and stay at one location. Anyone on the project adds and edits them;
 * whoever added one, or an admin, deletes it. Admins manage the company's categories.
 */
export function ProjectElements() {
  const { projectId, project, isAdmin, team, locations } = useProject();
  const { session } = useAuth();
  const me = session?.user.id;
  const [elements, setElements] = useState<Element[]>([]);
  const [categories, setCategories] = useState<ElementCategory[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [e, cats, s, c] = await Promise.all([
        api.elements(projectId), api.elementCategories(project.company_id), api.scenes(projectId), api.characters(projectId),
      ]);
      setElements(e);
      setCategories(cats);
      setScenes(s);
      setCharacters(c);
    } catch (e) { setError(errorText(e)); }
    setLoaded(true);
  }, [projectId, project.company_id]);
  useEffect(() => { load(); }, [load]);

  const run: Run = async (fn, ok) => {
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e)); await load(); return false; }
    if (ok) setNotice(ok);
    await load();
    return true;
  };

  const people: Person[] = useMemo(() => team.map((m) => ({ id: m.user_id, name: displayName(m.profile) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [team]);
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const sceneById = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const charById = useMemo(() => new Map(characters.map((c) => [c.id, c])), [characters]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const usable = useMemo(() => locations.filter((l) => l.status !== 'not_using'), [locations]);

  const rows = useMemo<ElementRow[]>(() => elements.map((e) => ({
    id: e.id, name: e.name, category: e.category_id ? catById.get(e.category_id)?.name ?? '' : '',
    status: labelOf(ELEMENT_STATUSES, e.status), quantity: e.quantity == null ? '' : String(e.quantity),
    character: e.character_id ? (charById.get(e.character_id) ? characterName(charById.get(e.character_id)!) : '') : '',
    scenes: e.scenes.map((l) => sceneById.get(l.scene_id)).filter(Boolean).map((s) => `Scene ${s!.number}`).join(', '),
    owner: e.owner_id ? nameOf.get(e.owner_id) ?? LEFT : '',
    location: e.location_id ? locations.find((l) => l.id === e.location_id)?.name ?? '' : '',
    description: e.description ?? '', notes: e.notes ?? '',
    characterId: e.character_id, ownerId: e.owner_id, locationId: e.location_id, sceneIds: e.scenes.map((l) => l.scene_id),
  })), [elements, catById, charById, sceneById, nameOf, locations]);

  const options = useMemo(() => {
    const sceneChoices = scenes.map((s) => ({ id: s.id, name: sceneName(s) }));
    return {
      rowId: (r: ElementRow) => r.id,
      toolbar: false, groupPanel: false, statusBar: false,
      selection: 'single', rowClickSelection: true,
      emptyMessage: 'No elements yet',
      columns: [
        { field: 'name', header: 'Element', width: 190, editable: true, pinned: 'left' },
        {
          field: 'category', header: 'Category', width: 150, editable: true, editor: 'select',
          editorOptions: withNone(categories.map((c) => c.name)), render: ({ value }: { value: string }) => gridDropdown(gridEsc(value || NONE)),
        },
        {
          field: 'status', header: 'Status', width: 120, editable: true, editor: 'select',
          editorOptions: ELEMENT_STATUSES.map((x) => x.label), render: ({ value }: { value: string }) => gridDropdown(statusPill(value)),
        },
        { field: 'quantity', header: 'Qty', width: 70, editable: true, comparator: (a: string, b: string) => (Number(a) || 0) - (Number(b) || 0) },
        {
          // The same links as the Elements on the Scenes page.
          field: 'scenes', header: 'Scenes', width: 180,
          pickMany: { choices: () => sceneChoices, selected: (r: ElementRow) => r.sceneIds } satisfies PickMany<ElementRow>,
          tooltip: () => 'The scenes that use it. Changing them here changes them on the Scenes page too.',
          render: ({ data }: { data: ElementRow }) => gridDropdown(data.sceneIds.length ? gridLinkList(data.sceneIds.map((id) => sceneById.get(id)).filter(Boolean).map((s) => ({
            text: s!.number, to: itemPath.scene(projectId, s!.id), title: `Open ${sceneName(s!)} on the Scenes page`,
          }))) : gridEsc(NONE)),
        },
        {
          field: 'character', header: 'Character', width: 160, editable: true, editor: 'select', editorOptions: withNone(characters.map(characterName)),
          render: ({ value, data }: { value: string; data: ElementRow }) => gridDropdown(gridEsc(value || NONE),
            data.characterId && value ? { to: itemPath.character(projectId, data.characterId), title: `Open ${value} on the Characters page` } : null),
        },
        {
          field: 'owner', header: 'Owner', width: 160, editable: true, editor: 'select', editorOptions: withNone(people.map((p) => p.name)),
          render: ({ value, data }: { value: string; data: ElementRow }) => gridDropdown(gridEsc(value || NONE),
            data.ownerId && nameOf.has(data.ownerId) ? { to: itemPath.teamMember(projectId, data.ownerId), title: `Open ${value} on the Team page` } : null),
        },
        {
          field: 'location', header: 'Location', width: 160, editable: true, editor: 'select', editorOptions: withNone(usable.map((l) => l.name)),
          render: ({ value, data }: { value: string; data: ElementRow }) => gridDropdown(gridEsc(value || NONE),
            data.locationId && value ? { to: itemPath.location(projectId, data.locationId), title: `Open ${value} on the Locations page` } : null),
        },
        { field: 'description', header: 'Description', width: 240, editable: true, editor: 'textarea' },
        { field: 'notes', header: 'Notes', width: 220, editable: true, editor: 'textarea' },
      ],
    };
  }, [scenes, categories, characters, people, usable, sceneById, nameOf, projectId]);

  async function saveCell(e: { data: ElementRow; column: string; newValue: unknown }) {
    const v = typeof e.newValue === 'string' ? e.newValue.trim() : '';
    const pick = (name: string) => (name && name !== NONE ? name : null);
    const patch: ElementInput = {};
    switch (e.column) {
      case 'name': if (!v) { await load(); return; } patch.name = v; break;
      case 'category': patch.category_id = categories.find((c) => c.name === pick(v))?.id ?? null; break;
      case 'status': { const s = valueOf(ELEMENT_STATUSES, v); if (!s) { await load(); return; } patch.status = s; break; }
      case 'character': patch.character_id = characters.find((c) => characterName(c) === pick(v))?.id ?? null; break;
      case 'owner': patch.owner_id = people.find((p) => p.name === pick(v))?.id ?? null; break;
      case 'location': patch.location_id = usable.find((l) => l.name === pick(v))?.id ?? null; break;
      case 'description': case 'notes': patch[e.column] = v || null; break;
      case 'quantity': case 'scenes': break;
      default: await load(); return;
    }
    await run(async () => {
      if (e.column === 'scenes') return api.setElementScenes(e.data.id, e.newValue as string[]);
      if (e.column === 'quantity') patch.quantity = parseQuantity(v);
      return api.updateElement(e.data.id, patch);
    });
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createElement(projectId, { name })).id; }, `Added ${name}. Pick its category and scenes in the form below the table.`)) {
      setNewName('');
      open(id);
    }
  }

  function open(id: string) {
    setSelectedId(id);
    setReveal({ id, n: Date.now() });
    scrollToForm(id);
  }
  useOpenFromLink((id) => elements.some((x) => x.id === id), open);

  const selected = elements.find((x) => x.id === selectedId) ?? null;
  const ready = elements.filter((x) => x.status === 'ready').length;
  const summary = elements.length ? `${elements.length} ${elements.length === 1 ? 'element' : 'elements'}, ${ready} ready` : undefined;

  if (!loaded) return <p className="text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <Section id="project.elements" title="Elements" summary={summary}>
        <form className="form-row mb-2" onSubmit={add}>
          <input className="field" placeholder="New element, e.g. Hero drone" aria-label="New element's name" value={newName} maxLength={100}
            onChange={(e) => setNewName(e.target.value)} required />
          <button type="submit" className="btn" data-pin>Add element</button>
        </form>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <div className="flex flex-col gap-4">
          <LatticeGrid stateId="project.elements" options={options} rows={rows} height={Math.min(80 + rows.length * 34, 420)} reveal={reveal}
            on={{
              cellValueChanged: saveCell,
              selectionChanged: (r: ElementRow[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); },
            }} />
          {selected && (
            <ElementPanel key={selected.id} element={selected} categories={categories} scenes={scenes} characters={characters}
              locations={locations} people={people} run={run} isAdmin={isAdmin} canDelete={isAdmin || selected.created_by === me}
              companyId={project.company_id} onDeleted={() => setSelectedId(null)} />
          )}
        </div>
        {rows.length > 0 ? (
          <p className="hint mt-2">
            Click a category, status, scene list, character, owner or location to pick from its list. Double-click any other cell to type a change.
            Select an element to edit everything about it below, including a note for each scene.
          </p>
        ) : <p className="hint mt-2">Elements are the things the shoot needs: props, wardrobe, vehicles, animals, effects. You can also add them from a scene's form on the Scenes page.</p>}
      </Section>
      {isAdmin && <ElementCategories companyId={project.company_id} categories={categories} reload={load} />}
    </div>
  );
}

function ElementPanel({ element: el, categories, scenes, characters, locations, people, run, isAdmin, canDelete, companyId, onDeleted }: {
  element: Element; categories: ElementCategory[]; scenes: Scene[]; characters: Character[]; locations: Location[]; people: Person[];
  run: Run; isAdmin: boolean; canDelete: boolean; companyId: string; onDeleted: () => void;
}) {
  // Every field, the scene picks and the scene notes are held until Save.
  const initial = useMemo(() => ({
    name: el.name, category_id: el.category_id ?? '', status: el.status as string, quantity: el.quantity == null ? '' : String(el.quantity),
    owner_id: el.owner_id ?? '', character_id: el.character_id ?? '', location_id: el.location_id ?? '',
    description: el.description ?? '', notes: el.notes ?? '',
  }), [el]);
  const initialScenes = useMemo(() => el.scenes.map((l) => l.scene_id), [el]);
  const initialNotes = useMemo(() => Object.fromEntries(el.scenes.map((l) => [l.scene_id, l.note ?? ''])), [el]);
  type Draft = typeof initial;
  const [draft, setDraft] = useState(initial);
  const [sceneIds, setSceneIds] = useState(initialScenes);
  const [notes, setNotes] = useState<Record<string, string>>(initialNotes);
  const keys = Object.keys(initial) as (keyof Draft)[];
  const scenesChanged = sceneIds.length !== initialScenes.length || sceneIds.some((id) => !initialScenes.includes(id));
  const notesChanged = sceneIds.some((id) => (notes[id] ?? '').trim() !== (initialNotes[id] ?? ''));
  const changed = keys.some((k) => draft[k].trim() !== initial[k]) || scenesChanged || notesChanged;
  useUnsaved(changed);
  // Show changes made in the table unless something here is unsaved.
  useEffect(() => {
    if (changed) return;
    setDraft(initial);
    setSceneIds(initialScenes);
    setNotes(initialNotes);
  }, [initial, initialScenes, initialNotes]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  function undo() {
    setDraft(initial);
    setSceneIds(initialScenes);
    setNotes(initialNotes);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const d = Object.fromEntries(keys.map((k) => [k, draft[k].trim()])) as Draft;
    await run(async () => {
      const patch: ElementInput = {};
      if (d.name !== initial.name) { if (!d.name) throw new Error('An element needs a name.'); patch.name = d.name; }
      if (d.quantity !== initial.quantity) patch.quantity = parseQuantity(d.quantity);
      if (d.status !== initial.status) patch.status = d.status as ElementStatus;
      for (const k of ['category_id', 'owner_id', 'character_id', 'location_id', 'description', 'notes'] as const) if (d[k] !== initial[k]) patch[k] = d[k] || null;
      if (Object.keys(patch).length) await api.updateElement(el.id, patch);
      if (scenesChanged) await api.setElementScenes(el.id, sceneIds);
      for (const id of sceneIds) {
        const note = (notes[id] ?? '').trim();
        if (note !== (initialNotes[id] ?? '')) await api.setSceneElementNote(id, el.id, note || null);
      }
    }, `Saved ${d.name}.`);
  }

  async function remove() {
    const n = el.scenes.length;
    const msg = n ? `Delete ${el.name}? It'll be taken out of ${n === 1 ? 'the scene' : `${n} scenes`} it's in.` : `Delete ${el.name}?`;
    if (window.confirm(msg) && await run(() => api.deleteElement(el.id), `Deleted ${el.name}.`)) onDeleted();
  }

  const picks = useMemo(() => scenes.map((s) => ({ id: s.id, name: sceneName(s) })), [scenes]);
  const sceneOf = (id: string) => scenes.find((s) => s.id === id);
  const owner = people.find((p) => p.id === draft.owner_id);
  const character = characters.find((c) => c.id === draft.character_id);
  const location = locations.find((l) => l.id === draft.location_id);
  const text = (k: 'description' | 'notes', label: string, placeholder?: string) => (
    <label className="label md:col-span-2">{label}
      <textarea className="field" rows={2} value={draft[k]} maxLength={4000} placeholder={placeholder} onChange={set(k)} />
    </label>
  );

  return (
    <aside data-pin-scope data-form-for={el.id} className="card gap-2">
      <h3>{el.name}</h3>
      {/* One form across the sections, so Save keeps everything together. */}
      <form className="flex flex-col gap-2" onSubmit={save}>
        <Section id="project.elements.details" title="Details" level="h4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-4">
            <label className="label">Name
              <input className="field" value={draft.name} maxLength={100} required onChange={set('name')} />
            </label>
            <label className="label">Category
              <select className="field" value={draft.category_id} onChange={set('category_id')}>
                <option value="">{NONE}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="label">Status
              <select className="field" value={draft.status} onChange={set('status')}>
                {ELEMENT_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </label>
            <label className="label">Quantity
              <input className="field" value={draft.quantity} maxLength={6} inputMode="numeric" placeholder="1" onChange={set('quantity')} />
            </label>
            <label className="label">Owner
              <select className="field" value={draft.owner_id} onChange={set('owner_id')}>
                <option value="">{NONE}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                {draft.owner_id && !owner && <option value={draft.owner_id}>{LEFT}</option>}
              </select>
              {owner && <OpenLink to={itemPath.teamMember(el.project_id, owner.id)}>Open {owner.name} on the Team page</OpenLink>}
            </label>
            <label className="label">Character
              <select className="field" value={draft.character_id} onChange={set('character_id')}>
                <option value="">{NONE}</option>
                {characters.map((c) => <option key={c.id} value={c.id}>{characterName(c)}</option>)}
              </select>
              {character && <OpenLink to={itemPath.character(el.project_id, character.id)}>Open {character.name} on the Characters page</OpenLink>}
            </label>
            <label className="label md:col-span-2">Location
              <select className="field" value={draft.location_id} onChange={set('location_id')}>
                <option value="">{NONE}</option>
                {locations.filter((l) => l.status !== 'not_using' || l.id === el.location_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              {location && <OpenLink to={itemPath.location(el.project_id, location.id)}>Open {location.name} on the Locations page</OpenLink>}
            </label>
            <p className="hint md:col-span-2">Pick a character if it belongs to one (Ellie's backpack), and a location if it stays at one place (set dressing).</p>
            {text('description', 'Description', 'What it is, what it looks like')}
            {text('notes', 'Notes', 'Where it comes from, rental details, backups')}
          </div>
        </Section>
        <Section id="project.elements.scenes" title="Scenes" level="h4" summary={sceneIds.length || undefined}>
          <div className="flex flex-col gap-2">
            <TagPicker tags={picks} selected={sceneIds} onChange={setSceneIds} noun="scene" listLabel="Scenes that use it" maxLength={60} />
            {sceneIds.length > 0 && <p className="hint">Anything about it in each scene:</p>}
            <ul className="flex flex-col gap-2">
              {sceneIds.map((id) => {
                const s = sceneOf(id);
                return (
                  <li key={id} className="flex flex-col gap-1 rounded-md border border-line p-2">
                    <OpenLink to={itemPath.scene(el.project_id, id)}>{s ? sceneName(s) : 'Scene'}</OpenLink>
                    <input className="field" aria-label={`Note for ${s ? sceneName(s) : 'this scene'}`} value={notes[id] ?? ''} maxLength={500}
                      placeholder="e.g. Broken by the end of the scene" onChange={(e) => setNotes({ ...notes, [id]: e.target.value })} />
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>
        <div className="flex gap-2">
          <button type="submit" className="btn flex-1 whitespace-nowrap md:flex-none" disabled={!changed} data-pin="2">Save element</button>
          <button type="button" className="btn btn-secondary" disabled={!changed} onClick={undo}>Undo changes</button>
        </div>
        {changed && <p className="hint">Unsaved changes.</p>}
      </form>
      {isAdmin && <ItemHistory companyId={companyId} kind="elements" id={el.id} refresh={el.updated_at} />}
      {canDelete && <button className="btn btn-danger sm:w-auto sm:self-start" onClick={remove}>Delete element</button>}
    </aside>
  );
}

/** The company's element categories (admins): add, rename, delete. */
function ElementCategories({ companyId, categories, reload }: { companyId: string; categories: ElementCategory[]; reload: () => Promise<void> }) {
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
  const rows = useMemo(() => categories.map((t) => ({ id: t.id, name: t.name, elements: t.elements })), [categories]);
  const options = useMemo(() => ({
    rowId: (r: { id: string }) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true,
    emptyMessage: 'No categories',
    columns: [
      { field: 'name', header: 'Category', width: 220, editable: true },
      { field: 'elements', header: 'Elements', type: 'number', width: 110, filter: false },
    ],
  }), []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createElementCategory(companyId, name)).id; })) {
      setNewName('');
      setSelectedId(id);
      setReveal({ id, n: Date.now() });
      scrollToForm(id);
    }
  }

  const selected = categories.find((t) => t.id === selectedId) ?? null;
  async function remove(t: ElementCategory) {
    const msg = t.elements ? `Delete the ${t.name} category? Its ${t.elements === 1 ? 'element stays' : `${t.elements} elements stay`}, with no category.` : `Delete the ${t.name} category?`;
    if (window.confirm(msg) && await run(() => api.deleteElementCategory(t.id))) setSelectedId(null);
  }

  return (
    <Section id="project.elements.categories" title="Element categories" summary={categories.length} bodyClassName="flex flex-col gap-2">
      <p className="hint">The kinds of elements, shared by every project in the company. Double-click a category to rename it, or select it to rename or delete it below.</p>
      <form className="form-row" onSubmit={add}>
        <input className="field" placeholder="New category, e.g. Drones" aria-label="New element category" value={newName} maxLength={60} required onChange={(e) => setNewName(e.target.value)} />
        <button type="submit" className="btn btn-secondary">Add category</button>
      </form>
      {error && <p className="error">{error}</p>}
      <LatticeGrid stateId="project.elements.categories" options={options} rows={rows} reveal={reveal} height={Math.min(80 + rows.length * 34, 320)}
        on={{
          selectionChanged: (r: { id: string }[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); },
          cellValueChanged: (e: { data: { id: string }; newValue: unknown }) => {
            const v = String(e.newValue ?? '').trim();
            if (v) run(() => api.renameElementCategory(e.data.id, v)); else reload();
          },
        }} />
      {selected && (
        <div className="card gap-2" data-form-for={selected.id}>
          <span className="hint">{selected.name}: used by {selected.elements} {selected.elements === 1 ? 'element' : 'elements'}.</span>
          <RenameForm key={selected.id} label="Category name" value={selected.name} maxLength={60}
            onSave={(name) => run(() => api.renameElementCategory(selected.id, name))} />
          <button className="btn btn-danger sm:self-start" onClick={() => remove(selected)}>Delete category</button>
        </div>
      )}
    </Section>
  );
}
