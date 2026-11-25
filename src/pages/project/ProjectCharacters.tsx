import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { LatticeGrid, gridDropdown, gridEsc } from '../../components/LatticeGrid';
import { OpenLink } from '../../components/OpenLink';
import { CharacterNotes } from '../../components/Notes';
import { Section } from '../../components/Section';
import { ItemHistory } from '../../components/ItemHistory';
import { TagPicker } from '../../components/TagPicker';
import { api, type Character, type CharacterInput, type Scene } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  CASTING_STATUSES, CHARACTER_KINDS, NONE, displayName, errorText, labelOf, valueOf,
  type CastingStatus, type CharacterKind,
} from '../../lib/format';
import { itemPath } from '../../lib/links';
import { scrollToForm, useOpenFromLink } from '../../lib/reveal';
import { confirmDiscard, useUnsaved } from '../../lib/unsaved';
import { useProject } from './ProjectLayout';

type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
type Person = { id: string; name: string };

const sceneName = (s: Pick<Scene, 'number' | 'set_name'>) => `Scene ${s.number}${s.set_name ? `: ${s.set_name}` : ''}`;
const withNone = (labels: string[]) => [NONE, ...labels];

/** A cast number as typed: blank is none; otherwise a whole number from 1 to 9999. */
function parseCastNumber(text: string): number | null {
  const t = text.trim().replace(/^#/, '');
  if (!t) return null;
  if (!/^\d+$/.test(t) || Number(t) < 1 || Number(t) > 9999) throw new Error('A cast number is a whole number, like 1 or 12.');
  return Number(t);
}

/** Scene numbers as typed in the table ("1, 4, 12A") to scene ids. */
function sceneIdsFor(text: string, scenes: Scene[]) {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const raw of text.split(',').map((x) => x.trim().replace(/^scene\s+/i, '')).filter(Boolean)) {
    const s = scenes.find((x) => x.number.toLowerCase() === raw.toLowerCase());
    if (s) { if (!ids.includes(s.id)) ids.push(s.id); } else unknown.push(raw);
  }
  if (unknown.length) throw new Error(`There's no scene ${unknown.join(', ')} in this project. Add it on the Scenes page first.`);
  return ids;
}

interface CharRow {
  id: string; cast: string; name: string; kind: string; casting: string; actor: string; stand_in: string; double: string;
  age_range: string; gender: string; scenes: string; description: string; traits: string;
  wardrobe: string; hair_makeup: string; props: string; continuity: string;
  actorId: string | null; standInId: string | null; doubleId: string | null;
}

const LEFT = 'Left the project';

/** A casting status as a coloured pill. */
const castingPill = (label: string) =>
  `<span class="task-pill task-pill-cast-${valueOf(CASTING_STATUSES, label) ?? 'open'}">${gridEsc(label)}</span>`;

/**
 * A project's characters: who they are, who plays them, how they look and which
 * scenes they're in. Anyone on the project adds and edits them; whoever added a
 * character, or an admin, deletes it. A character's scenes are the same links the
 * Scenes page shows, so they can be changed from either page.
 */
export function ProjectCharacters() {
  const { projectId, project, isAdmin, team } = useProject();
  const { session } = useAuth();
  const me = session?.user.id;
  const [chars, setChars] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.characters(projectId), api.scenes(projectId)]);
      setChars(c);
      setScenes(s);
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

  const people: Person[] = useMemo(() => team.map((m) => ({ id: m.user_id, name: displayName(m.profile) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [team]);
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const sceneById = useMemo(() => new Map(scenes.map((s) => [s.id, s])), [scenes]);
  const who = useCallback((id: string | null) => (id ? nameOf.get(id) ?? LEFT : ''), [nameOf]);

  const rows = useMemo<CharRow[]>(() => chars.map((c) => ({
    id: c.id, cast: c.cast_number == null ? '' : String(c.cast_number), name: c.name,
    kind: c.kind ? labelOf(CHARACTER_KINDS, c.kind) : '', casting: labelOf(CASTING_STATUSES, c.casting_status),
    actor: who(c.actor_id), stand_in: who(c.stand_in_id), double: who(c.double_id),
    age_range: c.age_range ?? '', gender: c.gender ?? '',
    scenes: c.scenes.map((l) => sceneById.get(l.scene_id)?.number).filter(Boolean).join(', '),
    description: c.description ?? '', traits: c.traits ?? '',
    wardrobe: c.wardrobe ?? '', hair_makeup: c.hair_makeup ?? '', props: c.props ?? '', continuity: c.continuity ?? '',
    actorId: c.actor_id, standInId: c.stand_in_id, doubleId: c.double_id,
  })), [chars, who, sceneById]);

  const options = useMemo(() => {
    const names = withNone(people.map((p) => p.name));
    const personCol = (field: 'actor' | 'stand_in' | 'double', header: string, idKey: 'actorId' | 'standInId' | 'doubleId') => ({
      field, header, width: 170, editable: true, editor: 'select', editorOptions: names,
      render: ({ value, data }: { value: string; data: CharRow }) => {
        const id = data[idKey];
        return gridDropdown(gridEsc(value || NONE), id && nameOf.has(id) ? { to: itemPath.teamMember(projectId, id), title: `Open ${value} on the Team page` } : null);
      },
    });
    return {
      rowId: (r: CharRow) => r.id,
      toolbar: false, groupPanel: false, statusBar: false,
      selection: 'single', rowClickSelection: true,
      emptyMessage: 'No characters yet',
      columns: [
        { field: 'cast', header: '#', width: 70, editable: true, comparator: (a: string, b: string) => (Number(a) || 1e9) - (Number(b) || 1e9) },
        { field: 'name', header: 'Character', width: 160, editable: true, pinned: 'left' },
        { field: 'kind', header: 'Type', width: 140, editable: true, editor: 'select', editorOptions: withNone(CHARACTER_KINDS.map((x) => x.label)), render: ({ value }: { value: string }) => gridDropdown(gridEsc(value || NONE)) },
        {
          field: 'casting', header: 'Casting', width: 140, editable: true, editor: 'select',
          editorOptions: CASTING_STATUSES.map((x) => x.label), render: ({ value }: { value: string }) => gridDropdown(castingPill(value)),
        },
        personCol('actor', 'Actor', 'actorId'),
        { field: 'scenes', header: 'Scenes', width: 150, editable: true, filterSplit: ',', tooltip: () => 'Scene numbers, separated by commas' },
        { field: 'age_range', header: 'Age', width: 90, editable: true },
        { field: 'gender', header: 'Gender', width: 110, editable: true },
        { field: 'description', header: 'Description', width: 240, editable: true, editor: 'textarea' },
        { field: 'traits', header: 'Traits and arc', width: 220, editable: true, editor: 'textarea' },
        personCol('stand_in', 'Stand-in', 'standInId'),
        personCol('double', 'Stunt double', 'doubleId'),
        { field: 'wardrobe', header: 'Wardrobe', width: 200, editable: true, editor: 'textarea' },
        { field: 'hair_makeup', header: 'Hair and makeup', width: 200, editable: true, editor: 'textarea' },
        { field: 'props', header: 'Props', width: 180, editable: true, editor: 'textarea' },
        { field: 'continuity', header: 'Continuity', width: 220, editable: true, editor: 'textarea' },
      ],
    };
  }, [people, nameOf, projectId]);

  async function saveCell(e: { data: CharRow; column: string; newValue: unknown }) {
    const v = String(e.newValue ?? '').trim();
    const personId = (name: string) => (name && name !== NONE ? people.find((p) => p.name === name)?.id ?? null : null);
    const patch: CharacterInput = {};
    switch (e.column) {
      case 'name': if (!v) { await load(); return; } patch.name = v; break;
      case 'kind': patch.kind = (valueOf(CHARACTER_KINDS, v) ?? null) as CharacterKind | null; break;
      case 'casting': { const s = valueOf(CASTING_STATUSES, v); if (!s) { await load(); return; } patch.casting_status = s; break; }
      case 'actor': patch.actor_id = personId(v); break;
      case 'stand_in': patch.stand_in_id = personId(v); break;
      case 'double': patch.double_id = personId(v); break;
      case 'age_range': case 'gender': case 'description': case 'traits': case 'wardrobe': case 'hair_makeup': case 'props': case 'continuity':
        patch[e.column] = v || null; break;
      case 'cast': case 'scenes': break;
      default: await load(); return;
    }
    await run(async () => {
      if (e.column === 'scenes') return api.setCharacterScenes(e.data.id, sceneIdsFor(v, scenes));
      if (e.column === 'cast') patch.cast_number = parseCastNumber(v);
      return api.updateCharacter(e.data.id, patch);
    });
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createCharacter(projectId, { name })).id; }, `Added ${name}. Fill in their details in the form below the table.`)) {
      setNewName('');
      open(id);
    }
  }

  function open(id: string) {
    setSelectedId(id);
    setReveal({ id, n: Date.now() });
    scrollToForm(id);
  }
  useOpenFromLink((id) => chars.some((c) => c.id === id), open);

  const selected = chars.find((c) => c.id === selectedId) ?? null;
  const cast = chars.filter((c) => c.casting_status === 'cast').length;
  const summary = chars.length ? `${chars.length} ${chars.length === 1 ? 'character' : 'characters'}, ${cast} cast` : undefined;

  if (!loaded) return <p className="text-muted">Loading…</p>;

  return (
    <Section id="project.characters" title="Characters" summary={summary}>
      <form className="form-row mb-2" onSubmit={add}>
        <input className="field" placeholder="New character's name, e.g. Ellie" aria-label="New character's name" value={newName} maxLength={100}
          onChange={(e) => setNewName(e.target.value)} required />
        <button type="submit" className="btn" data-pin>Add character</button>
      </form>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <div className="flex flex-col gap-4">
        <LatticeGrid stateId="project.characters" options={options} rows={rows} height={Math.min(80 + rows.length * 34, 420)} reveal={reveal}
          on={{
            cellValueChanged: saveCell,
            selectionChanged: (r: CharRow[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); },
          }} />
        {selected && (
          <CharacterPanel key={selected.id} character={selected} scenes={scenes} people={people} run={run}
            isAdmin={isAdmin} canDelete={isAdmin || selected.created_by === me} companyId={project.company_id}
            onDeleted={() => setSelectedId(null)} />
        )}
      </div>
      {rows.length > 0 && (
        <p className="hint mt-2">
          Click a type, casting status or person to pick from its list. Double-click any other cell to type a change; type scenes as their numbers, like 1, 4, 12A.
          Select a character to edit everything about them below, including how they look in each scene.
        </p>
      )}
      {!rows.length && <p className="hint mt-2">Characters typed into a scene's Characters on the Scenes page show up here too.</p>}
    </Section>
  );
}

function CharacterPanel({ character: c, scenes, people, run, isAdmin, canDelete, companyId, onDeleted }: {
  character: Character; scenes: Scene[]; people: Person[]; run: Run; isAdmin: boolean; canDelete: boolean; companyId: string; onDeleted: () => void;
}) {
  // Every field, the scene picks and the look notes are held until Save.
  const initial = useMemo(() => ({
    name: c.name, cast: c.cast_number == null ? '' : String(c.cast_number), kind: c.kind ?? '', age_range: c.age_range ?? '', gender: c.gender ?? '',
    description: c.description ?? '', traits: c.traits ?? '', casting_status: c.casting_status as string,
    actor_id: c.actor_id ?? '', stand_in_id: c.stand_in_id ?? '', double_id: c.double_id ?? '',
    wardrobe: c.wardrobe ?? '', hair_makeup: c.hair_makeup ?? '', props: c.props ?? '', continuity: c.continuity ?? '',
  }), [c]);
  const initialScenes = useMemo(() => c.scenes.map((l) => l.scene_id), [c]);
  const initialLooks = useMemo(() => Object.fromEntries(c.scenes.map((l) => [l.scene_id, l.look_note ?? ''])), [c]);
  type Draft = typeof initial;
  const [draft, setDraft] = useState(initial);
  const [sceneIds, setSceneIds] = useState(initialScenes);
  const [looks, setLooks] = useState<Record<string, string>>(initialLooks);
  const keys = Object.keys(initial) as (keyof Draft)[];
  const scenesChanged = sceneIds.length !== initialScenes.length || sceneIds.some((id) => !initialScenes.includes(id));
  const looksChanged = sceneIds.some((id) => (looks[id] ?? '').trim() !== (initialLooks[id] ?? ''));
  const changed = keys.some((k) => draft[k].trim() !== initial[k]) || scenesChanged || looksChanged;
  useUnsaved(changed);
  // Show changes made in the table unless something here is unsaved.
  useEffect(() => {
    if (changed) return;
    setDraft(initial);
    setSceneIds(initialScenes);
    setLooks(initialLooks);
  }, [initial, initialScenes, initialLooks]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  function undo() {
    setDraft(initial);
    setSceneIds(initialScenes);
    setLooks(initialLooks);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const d = Object.fromEntries(keys.map((k) => [k, draft[k].trim()])) as Draft;
    await run(async () => {
      const patch: CharacterInput = {};
      if (d.name !== initial.name) { if (!d.name) throw new Error('A character needs a name.'); patch.name = d.name; }
      if (d.cast !== initial.cast) patch.cast_number = parseCastNumber(d.cast);
      if (d.kind !== initial.kind) patch.kind = (d.kind || null) as CharacterKind | null;
      if (d.casting_status !== initial.casting_status) patch.casting_status = d.casting_status as CastingStatus;
      for (const k of ['actor_id', 'stand_in_id', 'double_id'] as const) if (d[k] !== initial[k]) patch[k] = d[k] || null;
      for (const k of ['age_range', 'gender', 'description', 'traits', 'wardrobe', 'hair_makeup', 'props', 'continuity'] as const) {
        if (d[k] !== initial[k]) patch[k] = d[k] || null;
      }
      if (Object.keys(patch).length) await api.updateCharacter(c.id, patch);
      if (scenesChanged) await api.setCharacterScenes(c.id, sceneIds);
      for (const id of sceneIds) {
        const note = (looks[id] ?? '').trim();
        if (note !== (initialLooks[id] ?? '')) await api.setLookNote(id, c.id, note || null);
      }
    }, `Saved ${d.name}.`);
  }

  async function remove() {
    const n = c.scenes.length;
    const msg = n ? `Delete ${c.name}? They'll be taken out of ${n === 1 ? 'the scene' : `${n} scenes`} they're in.` : `Delete ${c.name}?`;
    if (window.confirm(msg) && await run(() => api.deleteCharacter(c.id), `Deleted ${c.name}.`)) onDeleted();
  }

  const picks = useMemo(() => scenes.map((s) => ({ id: s.id, name: sceneName(s) })), [scenes]);
  const sceneOf = (id: string) => scenes.find((s) => s.id === id);
  const personPick = (k: 'actor_id' | 'stand_in_id' | 'double_id', label: string) => {
    const p = people.find((x) => x.id === draft[k]);
    return (
      <label className="label">{label}
        <select className="field" value={draft[k]} onChange={set(k)}>
          <option value="">{NONE}</option>
          {people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          {draft[k] && !p && <option value={draft[k]}>{LEFT}</option>}
        </select>
        {p && <OpenLink to={itemPath.teamMember(c.project_id, p.id)}>Open {p.name} on the Team page</OpenLink>}
      </label>
    );
  };
  const text = (k: keyof Draft, label: string, max: number, placeholder?: string, rows = 2) => (
    <label className="label md:col-span-2">{label}
      <textarea className="field" rows={rows} value={draft[k]} maxLength={max} placeholder={placeholder} onChange={set(k)} />
    </label>
  );
  const buttons = (
    <div className="flex gap-2 md:col-span-2">
      <button type="submit" className="btn flex-1 whitespace-nowrap md:flex-none" disabled={!changed} data-pin="2">Save character</button>
      <button type="button" className="btn btn-secondary" disabled={!changed} onClick={undo}>Undo changes</button>
    </div>
  );

  return (
    <aside data-pin-scope data-form-for={c.id} className="card gap-2">
      <h3>{c.cast_number != null ? `${c.cast_number}. ` : ''}{c.name}</h3>
      {/* One form across the sections, so Save keeps everything together. */}
      <form className="flex flex-col gap-2" onSubmit={save}>
        <Section id="project.characters.basics" title="Basics" level="h4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-4">
            <label className="label">Name
              <input className="field" value={draft.name} maxLength={100} required onChange={set('name')} />
            </label>
            <label className="label">Cast number
              <input className="field" value={draft.cast} maxLength={5} inputMode="numeric" placeholder="1" onChange={set('cast')} />
            </label>
            <label className="label">Type
              <select className="field" value={draft.kind} onChange={set('kind')}>
                <option value="">{NONE}</option>
                {CHARACTER_KINDS.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </label>
            <label className="label">Age range
              <input className="field" value={draft.age_range} maxLength={40} placeholder="30s" onChange={set('age_range')} />
            </label>
            <label className="label">Gender
              <input className="field" value={draft.gender} maxLength={40} onChange={set('gender')} />
            </label>
            {text('description', 'Description', 2000, 'Who they are, in a line or two')}
            {text('traits', 'Traits and arc', 4000, 'What they want, how they change')}
          </div>
        </Section>
        <Section id="project.characters.casting" title="Casting" level="h4"
          summary={`${labelOf(CASTING_STATUSES, draft.casting_status as CastingStatus)}${draft.actor_id ? `, ${people.find((p) => p.id === draft.actor_id)?.name ?? LEFT}` : ''}`}>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-4">
            <label className="label">Casting status
              <select className="field" value={draft.casting_status} onChange={set('casting_status')}>
                {CASTING_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
            </label>
            {personPick('actor_id', 'Actor')}
            {personPick('stand_in_id', 'Stand-in')}
            {personPick('double_id', 'Stunt double')}
            <p className="hint md:col-span-2">Pick from the project's team; add people on the Team page first. Picking an actor marks the character cast.</p>
          </div>
        </Section>
        <Section id="project.characters.scenes" title="Scenes" level="h4" summary={sceneIds.length || undefined}>
          <div className="flex flex-col gap-2">
            <TagPicker tags={picks} selected={sceneIds} onChange={setSceneIds} noun="scene" listLabel="Scenes they're in" maxLength={60} />
            {sceneIds.length > 0 && <p className="hint">How they look in each scene, for wardrobe, hair and makeup and continuity:</p>}
            <ul className="flex flex-col gap-2">
              {sceneIds.map((id) => {
                const s = sceneOf(id);
                return (
                  <li key={id} className="flex flex-col gap-1 rounded-md border border-line p-2">
                    <OpenLink to={itemPath.scene(c.project_id, id)}>{s ? sceneName(s) : 'Scene'}</OpenLink>
                    <input className="field" aria-label={`Look in ${s ? sceneName(s) : 'this scene'}`} value={looks[id] ?? ''} maxLength={1000}
                      placeholder="e.g. Jacket torn, mud on face" onChange={(e) => setLooks({ ...looks, [id]: e.target.value })} />
                  </li>
                );
              })}
            </ul>
          </div>
        </Section>
        <Section id="project.characters.look" title="Look and continuity" level="h4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-4">
            {text('wardrobe', 'Wardrobe', 4000, 'Costumes and changes')}
            {text('hair_makeup', 'Hair and makeup', 4000)}
            {text('props', 'Props', 4000, 'What they carry or use')}
            {text('continuity', 'Continuity', 4000, 'Things that must match from shot to shot')}
          </div>
        </Section>
        {buttons}
        {changed && <p className="hint">Unsaved changes.</p>}
      </form>
      <CharacterNotes characterId={c.id} canManage={isAdmin} />
      {isAdmin && <ItemHistory companyId={companyId} kind="characters" id={c.id} refresh={c.updated_at} />}
      {canDelete && <button className="btn btn-danger sm:w-auto sm:self-start" onClick={remove}>Delete character</button>}
    </aside>
  );
}
