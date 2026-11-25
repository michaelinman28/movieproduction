import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LatticeGrid, gridDropdown, gridEsc, gridLink, gridLinkHtml, gridLinkList } from '../../components/LatticeGrid';
import { OpenLink } from '../../components/OpenLink';
import { Section } from '../../components/Section';
import { ItemHistory } from '../../components/ItemHistory';
import {
  api, type Location, type Scene, type ShootDay, type ShootDayCall, type ShootDayCallInput, type ShootDayInput, type ShootDayItem, type ShootItemKind,
} from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  NONE, SCENE_INT_EXT, SCENE_TIMES, SHOOT_ITEM_KINDS, castLabel, clockLabel, clockValue, displayName, errorText, labelOf, pagesLabel, parseTime, shortDate,
} from '../../lib/format';
import type { Role } from '../../lib/database.types';
import { scrollToForm, useOpenFromLink } from '../../lib/reveal';
import { itemPath } from '../../lib/links';
import { confirmDiscard, useUnsaved } from '../../lib/unsaved';
import type { LatticeGridInstance } from '../../vendor/lattice-grid/lattice-grid';
import { useProject } from './ProjectLayout';

type Run = (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;


/** Where a day can be: every location not marked Not using, plus its current one. */
const locationChoices = (locations: Location[], currentId?: string | null) =>
  locations.filter((l) => l.status !== 'not_using' || l.id === currentId);

/** Where someone stands with the sent call sheet. */
export function callStatus(day: Pick<ShootDay, 'version'>, c: Pick<ShootDayCall, 'viewed_version' | 'confirmed_version'>) {
  if (!day.version) return 'Not sent';
  if (c.confirmed_version === day.version) return 'Confirmed';
  if (c.viewed_version === day.version) return 'Viewed';
  return c.confirmed_version ? 'Confirmed an old version' : 'Waiting';
}

/** A person's department, from their first project role that has one. */
export function departmentOf(roleIds: string[], roles: Role[]) {
  for (const id of roleIds) { const r = roles.find((x) => x.id === id); if (r?.department) return r.department; }
  return '';
}

const TIME_FIELDS = ['crew_call', 'shooting_call', 'lunch', 'wrap'] as const;

// ---- Days ---------------------------------------------------------------------

interface DayRow {
  id: string; day: string; date: string; title: string; location: string;
  crew_call: string; shooting_call: string; lunch: string; wrap: string;
  scenes: string; pages: string; sent: string; confirmed: string; open: string;
  locationId: string | null; sceneIds: string[];
}

/**
 * A project's shoot days, by date. Each day has a location, times, a schedule of
 * scenes and breaks, and the people called; its call sheet is built from all that.
 */
export function ProjectShootDays() {
  const { projectId, isAdmin, locations, reloadLocations } = useProject();
  const { session } = useAuth();
  const me = session?.user.id;
  const [days, setDays] = useState<ShootDay[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState('');
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, s] = await Promise.all([api.shootDays(projectId), api.scenes(projectId)]);
      setDays(d);
      setScenes(s);
    } catch (e) { setError(errorText(e)); }
    setLoaded(true);
  }, [projectId]);
  useEffect(() => { load(); reloadLocations(); }, [load, reloadLocations]);

  const run: Run = async (fn, ok) => {
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e)); await load(); return false; }
    if (ok) setNotice(ok);
    await load();
    return true;
  };

  const sceneNumber = useCallback((id: string) => scenes.find((s) => s.id === id)?.number ?? '?', [scenes]);
  /** Selects a day, highlights it and opens its form. */
  function open(id: string) {
    setSelectedId(id);
    setReveal({ id, n: Date.now() });
    scrollToForm(id);
  }
  // A link from elsewhere (?open=<day>) opens that day's form.
  useOpenFromLink((id) => days.some((d) => d.id === id), open);
  const rows = useMemo(() => days.map((d): DayRow => ({
    id: d.id, day: `${d.day_number} of ${d.total_days}`, date: d.shoot_date, title: d.title ?? '',
    location: locations.find((l) => l.id === d.location_id)?.name ?? '',
    crew_call: clockLabel(d.crew_call), shooting_call: clockLabel(d.shooting_call), lunch: clockLabel(d.lunch), wrap: clockLabel(d.wrap),
    scenes: d.scene_ids.map(sceneNumber).join(', '), pages: pagesLabel(d.pages_eighths || null),
    sent: d.version ? `Version ${d.version}` : 'Not sent', confirmed: d.version ? `${d.confirmed} of ${d.called}` : '', open: 'Call sheet',
    locationId: d.location_id, sceneIds: d.scene_ids,
  })), [days, locations, sceneNumber]);
  const locationNames = useMemo(() => locationChoices(locations).map((l) => l.name), [locations]);

  const options = useMemo(() => ({
    rowId: (r: DayRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true,
    emptyMessage: 'No shoot days yet',
    columns: [
      { field: 'day', header: 'Day', width: 90, filter: false, sortable: false, pinned: 'left' },
      { field: 'date', header: 'Date', type: 'date', width: 130, editable: true, render: ({ value }: { value: string }) => gridEsc(value ? shortDate(value) : '') },
      { field: 'open', header: '', width: 110, sortable: false, filter: false, render: ({ data }: { data: DayRow }) => gridLink('Call sheet', `/projects/${projectId}/shoot-days/${data.id}`) },
      { field: 'title', header: 'Title', width: 160, editable: true },
      {
        field: 'location', header: 'Location', width: 170, editable: true, editor: 'select', editorOptions: [NONE, ...locationNames],
        render: ({ value, data }: { value: string; data: DayRow }) => gridDropdown(gridEsc(value || NONE),
          data.locationId && value ? { to: itemPath.location(projectId, data.locationId), title: `Open ${value} on the Locations page` } : null),
      },
      { field: 'crew_call', header: 'Crew call', width: 110, editable: true },
      { field: 'shooting_call', header: 'Shooting call', width: 120, editable: true },
      { field: 'lunch', header: 'Lunch', width: 100, editable: true },
      { field: 'wrap', header: 'Est. wrap', width: 110, editable: true },
      {
        field: 'scenes', header: 'Scenes', width: 150, filterSplit: ',',
        render: ({ data }: { data: DayRow }) => gridLinkList(data.sceneIds.map((id) => ({
          text: sceneNumber(id), to: itemPath.scene(projectId, id), title: `Open scene ${sceneNumber(id)} on the Scenes page`,
        }))),
      },
      { field: 'pages', header: 'Pages', width: 90, filter: false },
      { field: 'sent', header: 'Sent', width: 110, filter: 'set' },
      { field: 'confirmed', header: 'Confirmed', width: 110, filter: false },
    ],
  }), [locationNames, projectId, sceneNumber]);

  async function saveCell(e: { data: DayRow; column: string; newValue: unknown }) {
    const v = String(e.newValue ?? '').trim();
    const patch: ShootDayInput = {};
    if (e.column === 'date') { if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) { await load(); return; } patch.shoot_date = v; }
    else if (e.column === 'title') patch.title = v || null;
    else if (e.column === 'location') patch.location_id = locations.find((l) => l.name === v)?.id ?? null;
    else if ((TIME_FIELDS as readonly string[]).includes(e.column)) { /* parsed below */ }
    else { await load(); return; }
    await run(async () => {
      if ((TIME_FIELDS as readonly string[]).includes(e.column)) patch[e.column as typeof TIME_FIELDS[number]] = parseTime(v);
      return api.updateShootDay(e.data.id, patch);
    });
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!newDate || !confirmDiscard()) return;
    let id = '';
    if (await run(async () => { id = (await api.createShootDay(projectId, { shoot_date: newDate })).id; },
      `Added ${shortDate(newDate)}. Set its location and times, add scenes and call people in the form below the table.`)) {
      setNewDate('');
      open(id);
    }
  }

  const selected = days.find((d) => d.id === selectedId) ?? null;
  const sent = days.filter((d) => d.version).length;
  const summary = days.length ? `${days.length} ${days.length === 1 ? 'day' : 'days'}${sent ? `, ${sent} sent` : ''}` : undefined;

  if (!loaded) return <p className="text-muted">Loading…</p>;

  return (
    <Section id="project.shootDays" title="Shoot days" summary={summary}>
      <form className="form-row mb-2" onSubmit={add}>
        <input className="field" type="date" aria-label="New shoot day's date" value={newDate} onChange={(e) => setNewDate(e.target.value)} required />
        <button type="submit" className="btn" data-pin>Add shoot day</button>
      </form>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <div className="flex flex-col gap-4">
        <LatticeGrid stateId="project.shootDays" options={options} rows={rows} height={Math.min(80 + rows.length * 34, 420)} reveal={reveal}
          on={{
            cellValueChanged: saveCell,
            selectionChanged: (r: DayRow[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); },
          }} />
        {selected && (
          <DayPanel key={selected.id} day={selected} scenes={scenes} run={run} onChanged={load}
            canDelete={isAdmin || selected.created_by === me} onDeleted={() => setSelectedId(null)} />
        )}
      </div>
      {rows.length > 0 && (
        <p className="hint mt-2">
          Double-click a cell to change it (times like 4:30 PM), or select a day to plan it below. Days are numbered by date. Scenes come from the Scenes page.
        </p>
      )}
    </Section>
  );
}

function DayPanel({ day, scenes, run, onChanged, canDelete, onDeleted }: {
  day: ShootDay; scenes: Scene[]; run: Run; onChanged: () => Promise<void>; canDelete: boolean; onDeleted: () => void;
}) {
  const { projectId, locations, project, isAdmin } = useProject();
  async function remove() {
    if (window.confirm(`Delete day ${day.day_number} (${shortDate(day.shoot_date)}) with its schedule and calls?`)
      && await run(() => api.deleteShootDay(day.id), `Deleted day ${day.day_number}.`)) onDeleted();
  }
  return (
    <aside data-pin-scope data-form-for={day.id} className="card gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3>Day {day.day_number} of {day.total_days}: {shortDate(day.shoot_date)}{day.title ? `, ${day.title}` : ''}</h3>
        <Link className="btn btn-secondary no-underline" to={`/projects/${projectId}/shoot-days/${day.id}`}>Open call sheet</Link>
      </div>
      <p className="hint">{day.version ? `Call sheet version ${day.version} sent; ${day.confirmed} of ${day.called} confirmed. Changes here reach people when you send it again.` : 'The call sheet hasn\'t been sent yet. Open it to check it and send it.'}</p>
      <DayDetails day={day} locations={locations} run={run} />
      <DaySchedule day={day} scenes={scenes} onChanged={onChanged} />
      <DayCalls day={day} onChanged={onChanged} />
      {isAdmin && <ItemHistory companyId={project.company_id} kind="shoot_days" id={day.id} refresh={day.updated_at} />}
      {canDelete && <button className="btn btn-danger sm:w-auto sm:self-start" onClick={remove}>Delete shoot day</button>}
    </aside>
  );
}

function DayDetails({ day, locations, run }: { day: ShootDay; locations: Location[]; run: Run }) {
  const { projectId } = useProject();
  const initial = useMemo(() => ({
    shoot_date: day.shoot_date, title: day.title ?? '', location_id: day.location_id ?? '',
    crew_call: clockValue(day.crew_call), shooting_call: clockValue(day.shooting_call), lunch: clockValue(day.lunch), wrap: clockValue(day.wrap),
    weather: day.weather ?? '', sunrise: clockValue(day.sunrise), sunset: clockValue(day.sunset), notes: day.notes ?? '',
  }), [day]);
  type Draft = typeof initial;
  const [draft, setDraft] = useState(initial);
  const [looking, setLooking] = useState(false);
  const [weatherNote, setWeatherNote] = useState<string | null>(null);
  const keys = Object.keys(initial) as (keyof Draft)[];
  const changed = keys.some((k) => draft[k].trim() !== initial[k]);
  useUnsaved(changed);
  // When the day reloads (after Save, a weather lookup, or a change elsewhere), take in
  // the new saved values for every field the person hasn't changed, and keep their edits.
  const shown = useRef(initial);
  useEffect(() => {
    const before = shown.current;
    shown.current = initial;
    if (before === initial) return;
    setDraft((d) => {
      const next = { ...d };
      for (const k of Object.keys(initial) as (keyof Draft)[]) if (d[k].trim() === before[k]) next[k] = initial[k];
      return next;
    });
  }, [initial]);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    const d = Object.fromEntries(keys.map((k) => [k, draft[k].trim()])) as Draft;
    const patch: ShootDayInput = {};
    for (const k of keys) {
      if (d[k] === initial[k]) continue;
      if (k === 'shoot_date') { if (d.shoot_date) patch.shoot_date = d.shoot_date; }
      else (patch as Record<string, string | null>)[k] = d[k] || null;
    }
    if (await run(() => api.updateShootDay(day.id, patch), `Saved day ${day.day_number}.`)) setDraft(d);
  }

  async function lookUp() {
    setLooking(true);
    setWeatherNote(null);
    if (!draft.location_id) { setWeatherNote('Pick a location first.'); setLooking(false); return; }
    try {
      // Looks up the date and location shown in the form; the result waits for Save day.
      const w = await api.lookUpWeather(day.id, { shoot_date: draft.shoot_date || undefined, location_id: draft.location_id });
      setDraft((d) => ({ ...d, weather: w.weather, sunrise: clockValue(w.sunrise), sunset: clockValue(w.sunset) }));
      setWeatherNote(`Forecast for ${w.place} filled in. Press Save day to keep it.`);
    } catch (e) { setWeatherNote(errorText(e)); }
    setLooking(false);
  }

  const timeInput = (k: 'crew_call' | 'shooting_call' | 'lunch' | 'wrap' | 'sunrise' | 'sunset', label: string) => (
    <label className="label">{label}
      <input className="field" type="time" value={draft[k]} onChange={set(k)} />
    </label>
  );

  return (
    <Section id="project.shootDays.details" title="Details" level="h4">
      <form className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-4" onSubmit={save}>
        <label className="label">Date
          <input className="field" type="date" value={draft.shoot_date} required onChange={set('shoot_date')} />
        </label>
        <label className="label">Title
          <input className="field" value={draft.title} maxLength={120} placeholder="Diner nights" onChange={set('title')} />
        </label>
        <label className="label md:col-span-2">Location
          <select className="field" value={draft.location_id} onChange={set('location_id')}>
            <option value="">{NONE}</option>
            {locationChoices(locations, day.location_id).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <span className="hint font-normal">Its address, parking and nearest hospital go on the call sheet; edit them on the Locations page.</span>
          {(() => {
            const at = locations.find((l) => l.id === draft.location_id);
            return at ? <OpenLink to={itemPath.location(projectId, at.id)}>Open {at.name} on the Locations page</OpenLink> : null;
          })()}
        </label>
        {timeInput('crew_call', 'General crew call')}
        {timeInput('shooting_call', 'Shooting call')}
        {timeInput('lunch', 'Lunch')}
        {timeInput('wrap', 'Estimated wrap')}
        <label className="label md:col-span-2">Weather
          <input className="field" value={draft.weather} maxLength={200} placeholder="Rain likely, 48°F to 55°F" onChange={set('weather')} />
        </label>
        {timeInput('sunrise', 'Sunrise')}
        {timeInput('sunset', 'Sunset')}
        <div className="flex flex-col gap-1 md:col-span-2">
          <button type="button" className="btn btn-secondary sm:w-auto sm:self-start" disabled={looking} onClick={lookUp}>
            {looking ? 'Looking up…' : 'Look up weather, sunrise and sunset'}
          </button>
          <span className="hint">Fills in the weather, sunrise and sunset for this date and location, from the location's address, up to about 16 days ahead.</span>
          {weatherNote && <span className="hint">{weatherNote}</span>}
        </div>
        <label className="label md:col-span-2">Notes for the call sheet
          <textarea className="field" rows={3} value={draft.notes} maxLength={4000} placeholder="Safety, stunts, special equipment, police on set" onChange={set('notes')} />
        </label>
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="btn flex-1 whitespace-nowrap md:flex-none" disabled={!changed} data-pin="2">Save day</button>
          <button type="button" className="btn btn-secondary" disabled={!changed} onClick={() => setDraft(initial)}>Undo changes</button>
        </div>
        {changed && <p className="hint md:col-span-2">Unsaved changes.</p>}
      </form>
    </Section>
  );
}

// ---- The day's schedule -------------------------------------------------------

interface ItemRow { id: string; time: string; what: string; set_name: string; dn: string; pages: string; cast: string; synopsis: string; kind: ShootItemKind; sceneId: string | null }

function DaySchedule({ day, scenes, onChanged }: { day: ShootDay; scenes: Scene[]; onChanged: () => Promise<void> }) {
  const { projectId } = useProject();
  const [items, setItems] = useState<ShootDayItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [kind, setKind] = useState<ShootItemKind>('scene');
  const [sceneId, setSceneId] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  const gridRef = useRef<LatticeGridInstance<ItemRow> | null>(null);

  const load = useCallback(async () => {
    try { setItems((await api.callSheet(day.id)).items); } catch (e) { setError(errorText(e)); }
  }, [day.id]);
  useEffect(() => { load(); }, [load]);

  const run: Run = async (fn) => {
    setError(null);
    let ok = true;
    try { await fn(); } catch (e) { setError(errorText(e)); ok = false; }
    await load();
    await onChanged();
    return ok;
  };

  const sceneOf = (id: string | null) => scenes.find((s) => s.id === id);
  const rows = useMemo(() => items.map((i): ItemRow => {
    const s = sceneOf(i.scene_id);
    const what = i.kind === 'scene' ? `Scene ${s?.number ?? '?'}` : `${labelOf(SHOOT_ITEM_KINDS, i.kind)}${i.label ? `: ${i.label}` : ''}`;
    return {
      id: i.id, kind: i.kind, sceneId: i.scene_id, time: clockLabel(i.at_time), what,
      set_name: s?.set_name ?? '', dn: s ? [s.int_ext ? labelOf(SCENE_INT_EXT, s.int_ext) : '', s.time_of_day ? labelOf(SCENE_TIMES, s.time_of_day) : ''].filter(Boolean).join(' / ') : '',
      pages: pagesLabel(s?.pages_eighths), cast: s?.characters ?? '', synopsis: s?.synopsis ?? '',
    };
  }), [items, scenes]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => ({
    rowId: (r: ItemRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true, rowReorder: true,
    emptyMessage: 'Nothing scheduled yet',
    columns: [
      { field: 'time', header: 'Time', width: 100, editable: true, filter: false },
      {
        // A scene links to it on the Scenes page; breaks and moves are typed here.
        field: 'what', header: 'What', width: 220, editable: (r: ItemRow) => r.kind !== 'scene',
        render: ({ value, data }: { value: string; data: ItemRow }) => data.kind === 'scene' && data.sceneId
          ? gridLinkHtml(value, itemPath.scene(projectId, data.sceneId), `Open ${value.toLowerCase()} on the Scenes page`) : gridEsc(value),
      },
      { field: 'set_name', header: 'Set', width: 200 },
      { field: 'dn', header: 'I/E, D/N', width: 120, filter: 'set' },
      { field: 'pages', header: 'Pages', width: 80, filter: false },
      { field: 'cast', header: 'Characters', width: 180, filterSplit: ',' },
      { field: 'synopsis', header: 'Synopsis', width: 240 },
    ],
  }), [projectId]);

  async function saveCell(e: { data: ItemRow; column: string; newValue: unknown }) {
    const v = String(e.newValue ?? '').trim();
    if (e.column === 'time') { await run(async () => api.updateShootDayItem(e.data.id, { at_time: parseTime(v) })); return; }
    if (e.column === 'what' && e.data.kind !== 'scene') {
      // The kind's name is shown in front of the words; keep only the words.
      const prefix = `${labelOf(SHOOT_ITEM_KINDS, e.data.kind)}:`;
      await run(() => api.updateShootDayItem(e.data.id, { label: (v.startsWith(prefix) ? v.slice(prefix.length) : v).trim() || null }));
      return;
    }
    await load();
  }

  async function reordered() {
    const ids = gridRef.current?.getRows().map((r) => r.id) ?? [];
    if (ids.length) await run(() => api.orderShootDayItems(day.id, ids));
  }

  const onDay = new Set(items.map((i) => i.scene_id));
  const free = scenes.filter((s) => !onDay.has(s.id));

  async function add(e: FormEvent) {
    e.preventDefault();
    if (kind === 'scene' && !sceneId) return;
    if (!confirmDiscard()) return;
    let id = '';
    if (await run(async () => {
      id = (await api.addShootDayItem(day.id, kind === 'scene' ? { kind, scene_id: sceneId } : { kind, label: label.trim() || null })).id;
    })) {
      setSceneId('');
      setLabel('');
      setSelectedId(id);
      setReveal({ id, n: Date.now() });
      scrollToForm(id);
    }
  }

  const selected = items.find((i) => i.id === selectedId) ?? null;
  const summary = day.scene_ids.length ? `${day.scene_ids.length} ${day.scene_ids.length === 1 ? 'scene' : 'scenes'}, ${pagesLabel(day.pages_eighths)} pages` : undefined;

  return (
    <Section id="project.shootDays.schedule" title="Schedule" level="h4" summary={summary}>
      <form className="mb-2 flex flex-col gap-2 sm:flex-row" onSubmit={add}>
        <select className="field sm:w-44" aria-label="What to add" value={kind} onChange={(e) => setKind(e.target.value as ShootItemKind)}>
          {SHOOT_ITEM_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
        {kind === 'scene' ? (
          <select className="field flex-1" aria-label="Scene" value={sceneId} onChange={(e) => setSceneId(e.target.value)} required>
            <option value="">{free.length ? 'Pick a scene…' : 'Every scene is on this day (add scenes on the Scenes page)'}</option>
            {free.map((s) => <option key={s.id} value={s.id}>{s.number}{s.set_name ? `  ${s.set_name}` : ''}{s.status === 'shot' ? ' (shot)' : ''}</option>)}
          </select>
        ) : (
          <input className="field flex-1" aria-label="Details" value={label} maxLength={300} onChange={(e) => setLabel(e.target.value)}
            required={kind !== 'meal'} placeholder={kind === 'meal' ? 'Hot meal, 1 hour (optional)' : kind === 'move' ? 'Move to the parking lot' : 'Rain tower test'} />
        )}
        <button type="submit" className="btn" data-pin>Add to day</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="flex flex-col gap-4">
        <LatticeGrid stateId="project.shootDays.schedule" options={options} rows={rows} height={Math.min(80 + rows.length * 34, 360)} reveal={reveal}
          onReady={(g) => { gridRef.current = g; }}
          on={{
            cellValueChanged: saveCell,
            rowsReordered: reordered,
            selectionChanged: (r: ItemRow[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); },
          }} />
        {selected && <ItemForm key={selected.id} item={selected} scene={sceneOf(selected.scene_id)} run={run} onDeleted={() => setSelectedId(null)} />}
      </div>
      {rows.length > 0 && <p className="hint mt-2">Drag the handle at the left of a row to change the order. Times are optional, like 10:00 PM for the meal break.</p>}
    </Section>
  );
}

function ItemForm({ item, scene, run, onDeleted }: { item: ShootDayItem; scene?: Scene; run: Run; onDeleted: () => void }) {
  const { projectId } = useProject();
  const initial = useMemo(() => ({ time: clockValue(item.at_time), label: item.label ?? '' }), [item]);
  const [draft, setDraft] = useState(initial);
  const changed = draft.time !== initial.time || draft.label.trim() !== initial.label;
  useUnsaved(changed);
  useEffect(() => { if (!changed) setDraft(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  const name = item.kind === 'scene' ? `Scene ${scene?.number ?? ''}` : labelOf(SHOOT_ITEM_KINDS, item.kind);

  async function save(e: FormEvent) {
    e.preventDefault();
    await run(() => api.updateShootDayItem(item.id, {
      ...(draft.time !== initial.time ? { at_time: draft.time || null } : {}),
      ...(item.kind !== 'scene' && draft.label.trim() !== initial.label ? { label: draft.label.trim() || null } : {}),
    }));
  }
  async function remove() {
    if (window.confirm(`Delete ${name} from this day's schedule?`) && await run(() => api.deleteShootDayItem(item.id))) onDeleted();
  }

  return (
    <div data-pin-scope data-form-for={item.id} className="flex flex-col gap-2 rounded-md border border-line p-3">
      <p className="font-semibold">{name}{scene?.set_name ? `  ${scene.set_name}` : ''}</p>
      <form className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-4" onSubmit={save}>
        <label className="label">Time
          <input className="field" type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
        </label>
        {item.kind !== 'scene' && (
          <label className="label">Details
            <input className="field" value={draft.label} maxLength={300} required={item.kind !== 'meal'} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
          </label>
        )}
        {scene && (
          <p className="hint flex flex-col md:col-span-2">
            Change the scene itself (set, pages, characters) on the Scenes page.
            <OpenLink to={itemPath.scene(projectId, scene.id)}>Open scene {scene.number} on the Scenes page</OpenLink>
          </p>
        )}
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="btn flex-1 whitespace-nowrap md:flex-none" disabled={!changed} data-pin="2">Save item</button>
          <button type="button" className="btn btn-secondary" disabled={!changed} onClick={() => setDraft(initial)}>Undo changes</button>
        </div>
        {changed && <p className="hint md:col-span-2">Unsaved changes.</p>}
      </form>
      <button className="btn btn-danger sm:w-auto sm:self-start" onClick={remove}>Delete from schedule</button>
    </div>
  );
}

// ---- Who is called ------------------------------------------------------------

interface CallRow {
  id: string; name: string; department: string; roles: string; character: string; call: string;
  pickup: string; makeup: string; note: string; status: string;
}

function DayCalls({ day, onChanged }: { day: ShootDay; onChanged: () => Promise<void> }) {
  const { projectId, team, roles } = useProject();
  const [calls, setCalls] = useState<ShootDayCall[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addId, setAddId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);

  const load = useCallback(async () => {
    try { setCalls(await api.shootDayCalls(day.id)); } catch (e) { setError(errorText(e)); }
  }, [day.id]);
  useEffect(() => { load(); }, [load]);

  const run: Run = async (fn) => {
    setError(null);
    let ok = true;
    try { await fn(); } catch (e) { setError(errorText(e)); ok = false; }
    await load();
    await onChanged();
    return ok;
  };

  const crewCall = clockLabel(day.crew_call);
  const rows = useMemo(() => calls.map((c): CallRow => ({
    id: c.user_id, name: displayName(c.profile), department: castLabel(c) ? 'Cast' : departmentOf(c.role_ids, roles),
    roles: roles.filter((r) => c.role_ids.includes(r.id)).map((r) => r.name).join(', '), character: castLabel(c),
    call: clockLabel(c.call_time), pickup: clockLabel(c.pickup_time), makeup: clockLabel(c.makeup_time), note: c.note ?? '',
    status: callStatus(day, c),
  })).sort((a, b) => Number(b.department === 'Cast') - Number(a.department === 'Cast') || a.department.localeCompare(b.department) || a.name.localeCompare(b.name)),
  [calls, roles, day]);

  const options = useMemo(() => ({
    rowId: (r: CallRow) => r.id,
    toolbar: false, groupPanel: false, statusBar: false,
    selection: 'single', rowClickSelection: true,
    emptyMessage: 'Nobody called yet',
    columns: [
      {
        field: 'name', header: 'Name', width: 170, pinned: 'left',
        render: ({ value, data }: { value: string; data: CallRow }) => gridLinkHtml(value, itemPath.teamMember(projectId, data.id), `Open ${value} on the Team page`),
      },
      { field: 'department', header: 'Department', width: 130, filter: 'set' },
      { field: 'roles', header: 'Roles', width: 180, filterSplit: ',' },
      { field: 'character', header: 'Character', width: 150, editable: true, tooltip: () => 'From the Characters page, unless you type one here' },
      { field: 'call', header: 'Call', width: 110, editable: true, render: ({ value }: { value: string }) => gridEsc(value || (crewCall ? `${crewCall} (crew)` : '')) },
      { field: 'pickup', header: 'Pickup', width: 100, editable: true },
      { field: 'makeup', header: 'Makeup', width: 100, editable: true },
      { field: 'note', header: 'Note', width: 200, editable: true },
      { field: 'status', header: 'Call sheet', width: 130, filter: 'set' },
    ],
  }), [crewCall, projectId]);

  async function saveCell(e: { data: CallRow; column: string; newValue: unknown }) {
    const v = String(e.newValue ?? '').trim();
    const timeKey = ({ call: 'call_time', pickup: 'pickup_time', makeup: 'makeup_time' } as const)[e.column as 'call' | 'pickup' | 'makeup'];
    await run(async () => {
      const patch: ShootDayCallInput = {};
      if (timeKey) patch[timeKey] = parseTime(v);
      // Blank, or the characters they're cast as, means no typed-in character.
      else if (e.column === 'character') patch.character_name = v && v !== castLabel({ characters: calls.find((c) => c.user_id === e.data.id)?.characters, character_name: null }) ? v : null;
      else if (e.column === 'note') patch.note = v || null;
      else return;
      return api.setShootDayCall(day.id, e.data.id, patch);
    });
  }

  const called = new Set(calls.map((c) => c.user_id));
  const notCalled = team.filter((m) => !called.has(m.user_id));

  async function addOne(e: FormEvent) {
    e.preventDefault();
    if (!addId || !confirmDiscard()) return;
    const id = addId;
    if (await run(() => api.setShootDayCall(day.id, id, {}))) {
      setAddId('');
      setSelectedId(id);
      setReveal({ id, n: Date.now() });
      scrollToForm(id);
    }
  }

  const selected = calls.find((c) => c.user_id === selectedId) ?? null;
  const cast = calls.filter((c) => castLabel(c)).length;
  const summary = calls.length ? `${calls.length} called${cast ? ` (${cast} cast)` : ''}${day.version ? `, ${day.confirmed} confirmed` : ''}` : undefined;

  return (
    <Section id="project.shootDays.calls" title="Who's called" level="h4" summary={summary}>
      <div className="mb-2 flex flex-col gap-2 sm:flex-row">
        <form className="flex flex-1 flex-col gap-2 sm:flex-row" onSubmit={addOne}>
          <select className="field flex-1" aria-label="Person to call" value={addId} onChange={(e) => setAddId(e.target.value)} required>
            <option value="">{notCalled.length ? 'Pick someone on the team…' : 'Everyone on the team is called'}</option>
            {notCalled.map((m) => <option key={m.user_id} value={m.user_id}>{displayName(m.profile)}</option>)}
          </select>
          <button type="submit" className="btn" data-pin>Call</button>
        </form>
        {notCalled.length > 1 && (
          <button type="button" className="btn btn-secondary" onClick={() => run(() => api.callEveryone(day.id))}>Call everyone ({notCalled.length})</button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="flex flex-col gap-4">
        <LatticeGrid stateId="project.shootDays.calls" options={options} rows={rows} height={Math.min(80 + rows.length * 34, 400)} reveal={reveal}
          on={{
            cellValueChanged: saveCell,
            selectionChanged: (r: CallRow[]) => { const id = r[0]?.id ?? null; if (id !== selectedId && confirmDiscard()) setSelectedId(id); },
          }} />
        {selected && <CallForm key={selected.user_id} day={day} call={selected} run={run} onRemoved={() => setSelectedId(null)} />}
      </div>
      {rows.length > 0 && (
        <p className="hint mt-2">
          A blank call means the general crew call{crewCall ? ` (${crewCall})` : ''}. Give actors their character and they're listed as cast.
          Add people to the project on the Team page first.
        </p>
      )}
    </Section>
  );
}

function CallForm({ day, call, run, onRemoved }: { day: ShootDay; call: ShootDayCall; run: Run; onRemoved: () => void }) {
  const { projectId } = useProject();
  const initial = useMemo(() => ({
    character: call.character_name ?? '', call: clockValue(call.call_time), pickup: clockValue(call.pickup_time), makeup: clockValue(call.makeup_time), note: call.note ?? '',
  }), [call]);
  type Draft = typeof initial;
  const [draft, setDraft] = useState(initial);
  const keys = Object.keys(initial) as (keyof Draft)[];
  const changed = keys.some((k) => draft[k].trim() !== initial[k]);
  useUnsaved(changed);
  // When the day reloads (after Save, a weather lookup, or a change elsewhere), take in
  // the new saved values for every field the person hasn't changed, and keep their edits.
  const shown = useRef(initial);
  useEffect(() => {
    const before = shown.current;
    shown.current = initial;
    if (before === initial) return;
    setDraft((d) => {
      const next = { ...d };
      for (const k of Object.keys(initial) as (keyof Draft)[]) if (d[k].trim() === before[k]) next[k] = initial[k];
      return next;
    });
  }, [initial]);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [k]: e.target.value });
  const name = displayName(call.profile);

  async function save(e: FormEvent) {
    e.preventDefault();
    const d = Object.fromEntries(keys.map((k) => [k, draft[k].trim()])) as Draft;
    const patch: ShootDayCallInput = {};
    if (d.character !== initial.character) patch.character_name = d.character || null;
    if (d.call !== initial.call) patch.call_time = d.call || null;
    if (d.pickup !== initial.pickup) patch.pickup_time = d.pickup || null;
    if (d.makeup !== initial.makeup) patch.makeup_time = d.makeup || null;
    if (d.note !== initial.note) patch.note = d.note || null;
    if (await run(() => api.setShootDayCall(day.id, call.user_id, patch))) setDraft(d);
  }
  async function remove() {
    if (window.confirm(`Remove ${name} from day ${day.day_number}? They won't be on its call sheet.`) && await run(() => api.removeShootDayCall(day.id, call.user_id))) onRemoved();
  }

  return (
    <div data-pin-scope data-form-for={call.user_id} className="flex flex-col gap-2 rounded-md border border-line p-3">
      <p className="font-semibold">
        <Link to={itemPath.teamMember(projectId, call.user_id)} title={`Open ${name} on the Team page`}>{name}</Link>
        {' '}<span className="font-normal text-muted">({callStatus(day, call)})</span>
      </p>
      <form className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-4" onSubmit={save}>
        <label className="label">Character (cast only)
          <input className="field" value={draft.character} maxLength={120} placeholder={castLabel({ ...call, character_name: null }) || 'Maya'} onChange={set('character')} />
        </label>
        <label className="label">Call time
          <input className="field" type="time" value={draft.call} onChange={set('call')} />
          <span className="hint font-normal">Blank means the crew call{day.crew_call ? ` (${clockLabel(day.crew_call)})` : ''}.</span>
        </label>
        <label className="label">Pickup
          <input className="field" type="time" value={draft.pickup} onChange={set('pickup')} />
        </label>
        <label className="label">Makeup and wardrobe
          <input className="field" type="time" value={draft.makeup} onChange={set('makeup')} />
        </label>
        <label className="label md:col-span-2">Note (on their line of the call sheet)
          <input className="field" value={draft.note} maxLength={500} placeholder="Bring the 85mm" onChange={set('note')} />
        </label>
        <div className="flex gap-2 md:col-span-2">
          <button type="submit" className="btn flex-1 whitespace-nowrap md:flex-none" disabled={!changed} data-pin="2">Save call</button>
          <button type="button" className="btn btn-secondary" disabled={!changed} onClick={() => setDraft(initial)}>Undo changes</button>
        </div>
        {changed && <p className="hint md:col-span-2">Unsaved changes.</p>}
      </form>
      <button className="btn btn-danger sm:w-auto sm:self-start" onClick={remove}>Remove from this day</button>
    </div>
  );
}
