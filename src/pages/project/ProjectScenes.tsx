import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { TableHint } from '../../components/TableHint';
import { LatticeGrid, type PickMany, gridDropdown, gridEsc, gridLinkList, gridHeight } from '../../components/LatticeGrid';
import { OpenLink } from '../../components/OpenLink';
import { SceneNotes } from '../../components/Notes';
import { itemPath } from '../../lib/links';
import { Section } from '../../components/Section';
import { ItemHistory } from '../../components/ItemHistory';
import { TagPicker } from '../../components/TagPicker';
import { api, type Character, type Element, type Location, type Scene, type SceneInput, type Shot, type ShotInput } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  NONE, SCENE_INT_EXT, SCENE_STATUSES, SCENE_TIMES, SHOT_ANGLES, SHOT_MOVEMENTS, SHOT_SIZES,
  errorText, labelOf, minutesLabel, pagesLabel, parsePages, valueOf,
  type SceneIntExt, type SceneStatus, type SceneTime,
} from '../../lib/format';
import { scrollToForm, useOpenFromLink } from '../../lib/reveal';
import { confirmDiscard, useUnsaved } from '../../lib/unsaved';
import type { LatticeGridInstance } from '../../vendor/lattice-grid/lattice-grid';
import { useProject } from './ProjectLayout';

type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;

/** A pick-list cell: the label with a caret, or a dash when nothing is picked. */
const dd = ({ value }: { value: string }) => gridDropdown(gridEsc(value || NONE));
/** Pick-list choices with a "nothing picked" choice first. */
const withNone = (labels: string[]) => [NONE, ...labels];
/** A picked label back to text to store: the dash means nothing. */
const picked = (v: string) => (v && v !== NONE ? v : null);

/** The locations a scene can be at: every one not marked Not using, plus its current one. */
const locationChoices = (locations: Location[], currentId?: string | null) =>
  locations.filter((l) => l.status !== 'not_using' || l.id === currentId);

// ---- Scenes -------------------------------------------------------------------

interface SceneRow {
  id: string; number: string; set_name: string; int_ext: string; time_of_day: string; pages: string;
  synopsis: string; characters: string; location: string; status: string; needs: string; shots: string; est: string;
  locationId: string | null; elementIds: string[];
}

const sceneRow = (s: Scene, locations: Location[]): SceneRow => ({
  id: s.id, number: s.number, set_name: s.set_name ?? '',
  int_ext: s.int_ext ? labelOf(SCENE_INT_EXT, s.int_ext) : '', time_of_day: s.time_of_day ? labelOf(SCENE_TIMES, s.time_of_day) : '',
  pages: pagesLabel(s.pages_eighths), synopsis: s.synopsis ?? '', characters: s.characters ?? '',
  location: locations.find((l) => l.id === s.location_id)?.name ?? '', locationId: s.location_id, status: labelOf(SCENE_STATUSES, s.status), needs: s.needs ?? '',
  shots: s.shots ? `${s.shots_done} of ${s.shots}` : '', est: minutesLabel(s.est_minutes), elementIds: s.element_ids,
});

/** A scene's status as a coloured pill. */
const statusPill = (label: string) =>
  `<span class="task-pill task-pill-scene-${valueOf(SCENE_STATUSES, label) ?? 'not_scheduled'}">${gridEsc(label)}</span>`;

/**
 * A project's scenes, in shooting-script order, each with its shot list. Scenes are
 * typed in for now (script import can come later); they'll feed shoot days and call
 * sheets. Anyone on the project adds, edits and reorders scenes and shots; whoever
 * added a scene, or an admin, deletes it.
 */
export function ProjectScenes() {
  const { projectId, isAdmin, locations } = useProject();
  const { session } = useAuth();
  const me = session?.user.id;
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [elements, setElements] = useState<Element[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newNumber, setNewNumber] = useState('');
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const gridRef = useRef<LatticeGridInstance<SceneRow> | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c, el] = await Promise.all([api.scenes(projectId), api.characters(projectId), api.elements(projectId)]);
      setScenes(s);
      setCharacters(c);
      setElements(el);
    } catch (e) { setError(errorText(e)); }
    setLoaded(true);
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  const run: Run = async (fn, ok) => {
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e)); await load(); return false; }
    if (ok) setNotice(ok);
    await load();
    return true;
  };

  const rows = useMemo(() => scenes.map((s) => sceneRow(s, locations)), [scenes, locations]);
  const locationNames = useMemo(() => locationChoices(locations).map((l) => l.name), [locations]);
  const elementById = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);
  const options = useMemo(() => ({
    rowId: (r: SceneRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, rowReorder: true,
    emptyMessage: 'No scenes yet',
    columns: [
      { field: 'number', header: 'Scene', width: 90, editable: true, pinned: 'left' },
      { field: 'set_name', header: 'Set', width: 200, editable: true },
      { field: 'int_ext', header: 'I/E', width: 100, editable: true, editor: 'select', editorOptions: withNone(SCENE_INT_EXT.map((x) => x.label)), render: dd },
      { field: 'time_of_day', header: 'D/N', width: 100, editable: true, editor: 'select', editorOptions: withNone(SCENE_TIMES.map((x) => x.label)), render: dd },
      { field: 'pages', header: 'Pages', width: 90, editable: true },
      { field: 'synopsis', header: 'Synopsis', width: 260, editable: true, editor: 'textarea' },
      {
        // Comma-separated; new names are added as characters on the Characters page.
        field: 'characters', header: 'Characters', width: 200, editable: true, filterSplit: ',',
        tooltip: () => 'Separate characters with commas. New names are added as characters.',
      },
      {
        field: 'location', header: 'Location', width: 170, editable: true, editor: 'select', editorOptions: withNone(locationNames),
        render: ({ value, data }: { value: string; data: SceneRow }) => gridDropdown(gridEsc(value || NONE),
          data.locationId && value ? { to: itemPath.location(projectId, data.locationId), title: `Open ${value} on the Locations page` } : null),
      },
      {
        field: 'status', header: 'Status', width: 150, editable: true, editor: 'select',
        editorOptions: SCENE_STATUSES.map((s) => s.label), render: ({ value }: { value: string }) => gridDropdown(statusPill(value)),
      },
      { field: 'shots', header: 'Shots done', width: 110, filter: false },
      { field: 'est', header: 'Shot time', width: 110, filter: false },
      {
        // The same links as each element's scenes on the Elements page.
        field: 'elements', header: 'Elements', width: 240,
        pickMany: { choices: () => elements.map((e) => ({ id: e.id, name: e.name })), selected: (r: SceneRow) => r.elementIds } satisfies PickMany<SceneRow>,
        tooltip: () => 'Props, wardrobe, vehicles and other things the scene needs. Add new ones in the scene\'s form or on the Elements page.',
        render: ({ data }: { data: SceneRow }) => gridDropdown(data.elementIds.length ? gridLinkList(data.elementIds.map((id) => elementById.get(id)).filter(Boolean).map((e) => ({
          text: e!.name, to: itemPath.element(projectId, e!.id), title: `Open ${e!.name} on the Elements page`,
        }))) : gridEsc(NONE)),
      },
      { field: 'needs', header: 'Other needs', width: 240, editable: true, editor: 'textarea' },
    ],
  }), [locationNames, projectId, elements, elementById]);

  async function saveCell(e: { data: SceneRow; column: string; newValue: unknown }) {
    const v = typeof e.newValue === 'string' ? e.newValue.trim() : '';
    const patch: SceneInput = {};
    switch (e.column) {
      case 'number': if (!v) { await load(); return; } patch.number = v; break;
      case 'set_name': case 'synopsis': case 'characters': case 'needs': patch[e.column] = v || null; break;
      case 'int_ext': patch.int_ext = (valueOf(SCENE_INT_EXT, v) ?? null) as SceneIntExt | null; break;
      case 'time_of_day': patch.time_of_day = (valueOf(SCENE_TIMES, v) ?? null) as SceneTime | null; break;
      case 'status': { const s = valueOf(SCENE_STATUSES, v); if (!s) { await load(); return; } patch.status = s; break; }
      case 'location': patch.location_id = locations.find((l) => l.name === v)?.id ?? null; break;
      case 'pages': case 'elements': break;
      default: await load(); return;
    }
    await run(async () => {
      if (e.column === 'elements') return api.setSceneElements(e.data.id, e.newValue as string[]);
      if (e.column === 'pages') patch.pages_eighths = parsePages(v);
      return api.updateScene(e.data.id, patch);
    });
  }

  async function reordered() {
    const ids = gridRef.current?.getRows().map((r) => r.id) ?? [];
    if (ids.length) await run(() => api.orderScenes(projectId, ids));
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const number = newNumber.trim();
    if (!number || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createScene(projectId, { number })).id; }, `Added scene ${number}. Fill in its details and shots in the form below the table.`)) {
      setNewNumber('');
      open(id);
    }
  }

  /** Selects a scene, highlights it and opens its form. */
  function open(id: string) {
    setSelectedId(id);
    setReveal({ id, n: Date.now() });
    scrollToForm(id);
  }
  // A link from elsewhere (?open=<scene>, e.g. from a shoot day) opens that scene's form.
  useOpenFromLink((id) => scenes.some((s) => s.id === id), open);

  const selected = scenes.find((s) => s.id === selectedId) ?? null;
  const pages = scenes.reduce((n, s) => n + (s.pages_eighths ?? 0), 0);
  const shots = scenes.reduce((n, s) => n + s.shots, 0);
  const summary = scenes.length
    ? `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}${pages ? `, ${pagesLabel(pages)} pages` : ''}${shots ? `, ${shots} ${shots === 1 ? 'shot' : 'shots'}` : ''}`
    : undefined;

  if (!loaded) return <p className="text-muted">Loading…</p>;

  return (
    <Section id="project.scenes" title="Scenes" summary={summary}>
      <form className="form-row mb-2" onSubmit={add}>
        <input className="field" placeholder="New scene number, e.g. 12A" aria-label="New scene number" value={newNumber} maxLength={20}
          onChange={(e) => setNewNumber(e.target.value)} required />
        <button type="submit" className="btn" data-pin>Add scene</button>
      </form>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {rows.length > 0 && (
        <TableHint more="Drag the handle at the left of a row to change the order (clear any sort or filter first). Pages are in eighths, like 1 3/8.">
          Double-tap (or double-click) a cell to change it, or select a scene to edit it and its shot list.
        </TableHint>
      )}
      <div className="flex flex-col gap-4">
        <LatticeGrid stateId="project.scenes" options={options} rows={rows} height={gridHeight(80, rows.length, 420)} reveal={reveal}
          onReady={(g) => { gridRef.current = g; }}
          on={{
            cellValueChanged: saveCell,
            rowsReordered: reordered,
            selectionChanged: (r: SceneRow[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); },
          }} />
        {selected && (
          <ScenePanel key={selected.id} scene={selected} locations={locations} characters={characters} elements={elements} run={run} reloadCharacters={load}
            isAdmin={isAdmin} canDelete={isAdmin || selected.created_by === me} onDeleted={() => setSelectedId(null)} onShotsChanged={load} />
        )}
      </div>
    </Section>
  );
}

function ScenePanel({ scene, locations, characters, elements, run, reloadCharacters, isAdmin, canDelete, onDeleted, onShotsChanged }: {
  scene: Scene; locations: Location[]; characters: Character[]; elements: Element[]; run: Run; reloadCharacters: () => Promise<void>;
  isAdmin: boolean; canDelete: boolean; onDeleted: () => void; onShotsChanged: () => Promise<void>;
}) {
  const { project } = useProject();
  // Every field here is held until Save.
  const initial = useMemo(() => ({
    number: scene.number, set_name: scene.set_name ?? '', int_ext: scene.int_ext ?? '', time_of_day: scene.time_of_day ?? '',
    pages: pagesLabel(scene.pages_eighths), synopsis: scene.synopsis ?? '', needs: scene.needs ?? '',
    location_id: scene.location_id ?? '', status: scene.status as string,
  }), [scene]);
  type Draft = typeof initial;
  const [draft, setDraft] = useState(initial);
  const keys = Object.keys(initial) as (keyof Draft)[];
  const initialCast = scene.character_ids;
  const [cast, setCast] = useState(initialCast);
  const castChanged = cast.length !== initialCast.length || cast.some((id) => !initialCast.includes(id));
  const initialElements = scene.element_ids;
  const [elementIds, setElementIds] = useState(initialElements);
  const elementsChanged = elementIds.length !== initialElements.length || elementIds.some((id) => !initialElements.includes(id));
  const changed = keys.some((k) => draft[k].trim() !== initial[k]) || castChanged || elementsChanged;
  useUnsaved(changed);
  // Show changes made in the table unless something here is unsaved.
  useEffect(() => { if (!changed) { setDraft(initial); setCast(initialCast); setElementIds(initialElements); } }, [initial, initialCast, initialElements]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  // A new character is added to the project straight away; it goes in this scene when you save.
  async function createCharacter(name: string) {
    try {
      const made = await api.createCharacter(scene.project_id, { name });
      await reloadCharacters();
      return made;
    } catch (e) { window.alert(errorText(e)); return null; }
  }

  // A new element is added to the project straight away; it goes in this scene when you save.
  async function createElement(name: string) {
    try {
      const made = await api.createElement(scene.project_id, { name });
      await reloadCharacters();
      return made;
    } catch (e) { window.alert(errorText(e)); return null; }
  }

  function undo() {
    setDraft(initial);
    setCast(initialCast);
    setElementIds(initialElements);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const d = Object.fromEntries(keys.map((k) => [k, draft[k].trim()])) as Draft;
    if (await run(async () => {
      const patch: SceneInput = {};
      if (d.number !== initial.number) { if (!d.number) throw new Error('A scene needs a number.'); patch.number = d.number; }
      for (const k of ['set_name', 'synopsis', 'needs'] as const) if (d[k] !== initial[k]) patch[k] = d[k] || null;
      if (d.int_ext !== initial.int_ext) patch.int_ext = (d.int_ext || null) as SceneIntExt | null;
      if (d.time_of_day !== initial.time_of_day) patch.time_of_day = (d.time_of_day || null) as SceneTime | null;
      if (d.location_id !== initial.location_id) patch.location_id = d.location_id || null;
      if (d.status !== initial.status) patch.status = d.status as SceneStatus;
      if (d.pages !== initial.pages) patch.pages_eighths = parsePages(d.pages);
      if (Object.keys(patch).length) await api.updateScene(scene.id, patch);
      if (castChanged) await api.setSceneCharacters(scene.id, cast);
      if (elementsChanged) await api.setSceneElements(scene.id, elementIds);
    }, `Saved scene ${d.number}.`)) setDraft(d);
  }

  async function remove() {
    const msg = scene.shots ? `Delete scene ${scene.number} and its ${scene.shots === 1 ? 'shot' : `${scene.shots} shots`}?` : `Delete scene ${scene.number}?`;
    if (window.confirm(msg) && await run(() => api.deleteScene(scene.id), `Deleted scene ${scene.number}.`)) onDeleted();
  }

  const heading = [scene.number, scene.set_name].filter(Boolean).join('  ');
  return (
    <aside data-pin-scope data-form-for={scene.id} data-form-label={`Scene ${scene.number || heading}`} className="card gap-2">
      <h3>Scene {heading}</h3>
      <Section id="project.scenes.details" title="Details" level="h4">
        <form className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-4" onSubmit={save}>
          <label className="label">Scene number
            <input className="field" value={draft.number} maxLength={20} required onChange={set('number')} />
          </label>
          <label className="label">Set
            <input className="field" value={draft.set_name} maxLength={200} placeholder="INT. DINER" onChange={set('set_name')} />
          </label>
          <label className="label">Interior or exterior
            <select className="field" value={draft.int_ext} onChange={set('int_ext')}>
              <option value="">{NONE}</option>
              {SCENE_INT_EXT.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <label className="label">Time of day
            <select className="field" value={draft.time_of_day} onChange={set('time_of_day')}>
              <option value="">{NONE}</option>
              {SCENE_TIMES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <label className="label">Pages
            <input className="field" value={draft.pages} maxLength={12} placeholder="1 3/8" inputMode="text" onChange={set('pages')} />
          </label>
          <label className="label">Status
            <select className="field" value={draft.status} onChange={set('status')}>
              {SCENE_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <label className="label md:col-span-2">Location
            <select className="field" value={draft.location_id} onChange={set('location_id')}>
              <option value="">{NONE}</option>
              {locationChoices(locations, scene.location_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {(() => {
              const at = locations.find((l) => l.id === draft.location_id);
              return at ? <OpenLink to={itemPath.location(scene.project_id, at.id)}>Open {at.name} on the Locations page</OpenLink> : null;
            })()}
          </label>
          <label className="label md:col-span-2">Synopsis
            <textarea className="field" rows={2} value={draft.synopsis} maxLength={1000} placeholder="Maya confronts Leo about the money" onChange={set('synopsis')} />
          </label>
          <div className="label md:col-span-2">Characters
            <TagPicker tags={characters} selected={cast} onChange={setCast} onCreate={createCharacter} noun="character" listLabel="Characters in this scene" maxLength={100} />
            {cast.length > 0 && (
              <span className="flex flex-wrap gap-x-4">
                {cast.map((id) => {
                  const ch = characters.find((x) => x.id === id);
                  return ch ? <OpenLink key={id} to={itemPath.character(scene.project_id, id)}>Open {ch.name}</OpenLink> : null;
                })}
              </span>
            )}
          </div>
          <div className="label md:col-span-2">Elements
            <TagPicker tags={elements} selected={elementIds} onChange={setElementIds} onCreate={createElement} noun="element" listLabel="Elements in this scene" maxLength={100} />
            {elementIds.length > 0 && (
              <span className="flex flex-wrap gap-x-4">
                {elementIds.map((id) => {
                  const el = elements.find((x) => x.id === id);
                  return el ? <OpenLink key={id} to={itemPath.element(scene.project_id, id)}>Open {el.name}</OpenLink> : null;
                })}
              </span>
            )}
            <span className="hint">Props, wardrobe, vehicles, effects. Type a new one and press Enter to add it to the Elements page.</span>
          </div>
          <label className="label md:col-span-2">Other needs
            <textarea className="field" rows={2} value={draft.needs} maxLength={2000} placeholder="Anything else, e.g. train arrival timing" onChange={set('needs')} />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" className="btn flex-1 whitespace-nowrap md:flex-none" disabled={!changed} data-pin="2">Save scene</button>
            <button type="button" className="btn btn-secondary" disabled={!changed} onClick={undo}>Undo changes</button>
          </div>
          {changed && <p className="hint md:col-span-2">Unsaved changes.</p>}
        </form>
      </Section>
      {/* Notes have their own section, so they stay at hand with Details and the shot list folded away. */}
      <SceneNotes sceneId={scene.id} canManage={isAdmin} />
      <ShotList scene={scene} onChanged={onShotsChanged} />
      {isAdmin && <ItemHistory companyId={project.company_id} kind="scenes" id={scene.id} refresh={`${scene.updated_at}${scene.shots}`} />}
      {canDelete && <button className="btn btn-danger sm:w-auto sm:self-start" onClick={remove}>Delete scene</button>}
    </aside>
  );
}

// ---- Shots --------------------------------------------------------------------

interface ShotRow {
  id: string; n: number; done: boolean; description: string; size: string; angle: string; movement: string;
  lens: string; equipment: string; est: string; notes: string;
}
const shotRow = (s: Shot, i: number): ShotRow => ({
  id: s.id, n: i + 1, done: s.done, description: s.description, size: s.size ?? '', angle: s.angle ?? '', movement: s.movement ?? '',
  lens: s.lens ?? '', equipment: s.equipment ?? '', est: s.est_minutes == null ? '' : String(s.est_minutes), notes: s.notes ?? '',
});

/** Estimated minutes as typed: blank is null; a whole number from 0 to 1440. */
function parseMinutes(text: string): number | null {
  const t = text.trim().replace(/\s*m(in(ute)?s?)?$/i, '');
  if (!t) return null;
  if (!/^\d+$/.test(t) || Number(t) > 1440) throw new Error('Estimated time is a number of minutes, like 30.');
  return Number(t);
}

/** A scene's shot list: shots in shooting order, ticked off on set. */
function ShotList({ scene, onChanged }: { scene: Scene; onChanged: () => Promise<void> }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newShot, setNewShot] = useState('');
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const gridRef = useRef<LatticeGridInstance<ShotRow> | null>(null);

  const load = useCallback(async () => {
    try { setShots(await api.shots(scene.id)); } catch (e) { setError(errorText(e)); }
  }, [scene.id]);
  useEffect(() => { load(); }, [load]);

  const run: Run = async (fn) => {
    setError(null);
    let ok = true;
    try { await fn(); } catch (e) { setError(errorText(e)); ok = false; }
    await load();
    await onChanged();
    return ok;
  };
  const runRef = useRef(run);
  runRef.current = run;

  const rows = useMemo(() => shots.map(shotRow), [shots]);
  const options = useMemo(() => ({
    rowId: (r: ShotRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, rowReorder: true,
    emptyMessage: 'No shots yet',
    columns: [
      { field: 'n', header: '#', type: 'number', width: 60, filter: false },
      {
        // One tap ticks a shot done, so it works on set from a phone.
        field: 'done', header: 'Done', width: 80, filter: 'set', sortable: true,
        render: ({ data }: { data: ShotRow }) => {
          const box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = data.done;
          box.className = 'grid-check';
          box.setAttribute('aria-label', `Shot ${data.n} done`);
          // Keep the grid from selecting the row (and redrawing the box) under the tap.
          for (const ev of ['pointerdown', 'mousedown', 'dblclick'] as const) box.addEventListener(ev, (e) => e.stopPropagation());
          box.addEventListener('click', (e) => { e.stopPropagation(); runRef.current(() => api.updateShot(data.id, { done: box.checked })); });
          return box;
        },
      },
      { field: 'description', header: 'Shot', width: 260, editable: true, editor: 'textarea' },
      { field: 'size', header: 'Size', width: 150, editable: true, editor: 'select', editorOptions: withNone(SHOT_SIZES), render: dd },
      { field: 'angle', header: 'Angle', width: 130, editable: true, editor: 'select', editorOptions: withNone(SHOT_ANGLES), render: dd },
      { field: 'movement', header: 'Movement', width: 130, editable: true, editor: 'select', editorOptions: withNone(SHOT_MOVEMENTS), render: dd },
      { field: 'lens', header: 'Lens', width: 90, editable: true },
      { field: 'equipment', header: 'Equipment', width: 180, editable: true },
      { field: 'est', header: 'Est. minutes', width: 120, editable: true },
      { field: 'notes', header: 'Notes', width: 220, editable: true, editor: 'textarea' },
    ],
  }), []);

  async function saveCell(e: { data: ShotRow; column: string; newValue: unknown }) {
    const v = String(e.newValue ?? '').trim();
    const patch: ShotInput = {};
    switch (e.column) {
      case 'description': if (!v) { await load(); return; } patch.description = v; break;
      case 'size': case 'angle': case 'movement': patch[e.column] = picked(v); break;
      case 'lens': case 'equipment': case 'notes': patch[e.column] = v || null; break;
      case 'est': break;
      default: await load(); return;
    }
    await run(async () => {
      if (e.column === 'est') patch.est_minutes = parseMinutes(v);
      return api.updateShot(e.data.id, patch);
    });
  }

  async function reordered() {
    const ids = gridRef.current?.getRows().map((r) => r.id) ?? [];
    if (ids.length) await run(() => api.orderShots(scene.id, ids));
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const description = newShot.trim();
    if (!description || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createShot(scene.id, { description })).id; })) {
      setNewShot('');
      setSelectedId(id);
      setReveal({ id, n: Date.now() });
      scrollToForm(id);
    }
  }

  const index = shots.findIndex((s) => s.id === selectedId);
  const selected = index >= 0 ? shots[index] : null;
  const done = shots.filter((s) => s.done).length;
  const minutes = shots.reduce((n, s) => n + (s.est_minutes ?? 0), 0);
  const summary = shots.length ? `${done} of ${shots.length} done${minutes ? `, about ${minutesLabel(minutes)}` : ''}` : undefined;

  return (
    <Section id="project.scenes.shots" title="Shot list" level="h4" summary={summary}>
      <form className="form-row mb-2" onSubmit={add}>
        <input className="field" placeholder="New shot, e.g. Wide of diner, Maya enters" aria-label="New shot" value={newShot} maxLength={500}
          onChange={(e) => setNewShot(e.target.value)} required />
        <button type="submit" className="btn" data-pin>Add shot</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="flex flex-col gap-4">
        <LatticeGrid stateId="project.scenes.shots" options={options} rows={rows} height={gridHeight(80, rows.length, 360)} reveal={reveal}
          onReady={(g) => { gridRef.current = g; }}
          on={{
            cellValueChanged: saveCell,
            rowsReordered: reordered,
            selectionChanged: (r: ShotRow[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); },
          }} />
        {selected && <ShotForm key={selected.id} shot={selected} n={index + 1} run={run} onDeleted={() => setSelectedId(null)} />}
      </div>
      {rows.length > 0 && <p className="hint mt-2">Tick Done as each shot is captured. Drag the handle at the left of a row to change the shooting order.</p>}
    </Section>
  );
}

function ShotForm({ shot, n, run, onDeleted }: { shot: Shot; n: number; run: Run; onDeleted: () => void }) {
  const initial = useMemo(() => ({
    description: shot.description, size: shot.size ?? '', angle: shot.angle ?? '', movement: shot.movement ?? '', lens: shot.lens ?? '',
    equipment: shot.equipment ?? '', est: shot.est_minutes == null ? '' : String(shot.est_minutes), notes: shot.notes ?? '', done: shot.done ? 'yes' : '',
  }), [shot]);
  type Draft = typeof initial;
  const [draft, setDraft] = useState(initial);
  const keys = Object.keys(initial) as (keyof Draft)[];
  const changed = keys.some((k) => draft[k].trim() !== initial[k]);
  useUnsaved(changed);
  useEffect(() => { if (!changed) setDraft(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    const d = Object.fromEntries(keys.map((k) => [k, draft[k].trim()])) as Draft;
    if (await run(() => {
      const patch: ShotInput = {};
      if (d.description !== initial.description) { if (!d.description) throw new Error('Describe the shot.'); patch.description = d.description; }
      for (const k of ['size', 'angle', 'movement', 'lens', 'equipment', 'notes'] as const) if (d[k] !== initial[k]) patch[k] = d[k] || null;
      if (d.est !== initial.est) patch.est_minutes = parseMinutes(d.est);
      if (d.done !== initial.done) patch.done = d.done === 'yes';
      return api.updateShot(shot.id, patch);
    })) setDraft(d);
  }

  async function remove() {
    if (window.confirm(`Delete shot ${n}?`) && await run(() => api.deleteShot(shot.id))) onDeleted();
  }

  const pick = (k: 'size' | 'angle' | 'movement', label: string, list: string[]) => (
    <label className="label">{label}
      <select className="field" value={draft[k]} onChange={set(k)}>
        <option value="">{NONE}</option>
        {/* Keep a value that isn't in the list (a company's own) choosable. */}
        {[...list, ...(draft[k] && !list.includes(draft[k]) ? [draft[k]] : [])].map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </label>
  );

  return (
    <div data-pin-scope data-form-for={shot.id} className="flex flex-col gap-2 rounded-md border border-line p-3">
      <p className="font-semibold">Shot {n}</p>
      <form className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-4" onSubmit={save}>
        <label className="label md:col-span-2">Shot
          <textarea className="field" rows={2} value={draft.description} maxLength={500} required onChange={set('description')} />
        </label>
        {pick('size', 'Size', SHOT_SIZES)}
        {pick('angle', 'Angle', SHOT_ANGLES)}
        {pick('movement', 'Movement', SHOT_MOVEMENTS)}
        <label className="label">Lens
          <input className="field" value={draft.lens} maxLength={40} placeholder="35mm" onChange={set('lens')} />
        </label>
        <label className="label">Equipment
          <input className="field" value={draft.equipment} maxLength={300} placeholder="Dolly and track" onChange={set('equipment')} />
        </label>
        <label className="label">Estimated minutes
          <input className="field" value={draft.est} maxLength={5} inputMode="numeric" placeholder="30" onChange={set('est')} />
        </label>
        <label className="label md:col-span-2">Notes
          <textarea className="field" rows={2} value={draft.notes} maxLength={2000} onChange={set('notes')} />
        </label>
        <label className="check md:col-span-2">
          <input type="checkbox" checked={draft.done === 'yes'} onChange={(e) => setDraft({ ...draft, done: e.target.checked ? 'yes' : '' })} />
          Done
        </label>
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="btn flex-1 whitespace-nowrap md:flex-none" disabled={!changed} data-pin="2">Save shot</button>
          <button type="button" className="btn btn-secondary" disabled={!changed} onClick={() => setDraft(initial)}>Undo changes</button>
        </div>
        {changed && <p className="hint md:col-span-2">Unsaved changes.</p>}
      </form>
      <button className="btn btn-danger sm:w-auto sm:self-start" onClick={remove}>Delete shot</button>
    </div>
  );
}
