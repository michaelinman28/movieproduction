import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { LatticeGrid, gridDropdown, gridEsc } from './LatticeGrid';
import { Section } from './Section';
import { TagPicker } from './TagPicker';
import { TaskNotes } from './TaskNotes';
import {
  api, type DayPart, type Location, type ProjectMember, type Task, type TaskCategory, type TaskInput, type TaskPriority, type TaskStatus, type TaskTag,
} from '../lib/api';
import {
  DAY_PARTS, HALF_HOURS, TASK_PRIORITIES, TASK_STATUSES, displayName, dueWhen, errorText, isOverdue, labelOf, timeLabel, valueOf,
} from '../lib/format';
import type { LatticeGridInstance } from '../vendor/lattice-grid/lattice-grid';

interface TaskRow {
  id: string;
  path: string[];
  title: string;
  description: string;
  parent: string;
  status: string;
  priority: string;
  assignee: string;
  due: string;
  when: string;
  subtasks: string;
  category: string;
  location: string;
  tags: string;
}

const UNASSIGNED = 'Unassigned';

// How the task grid is laid out: the sub-task tree, or a flat list grouped by a column.
const VIEWS = [
  { value: '', label: 'Sub-task tree' },
  { value: 'assignee', label: 'Grouped by person' },
  { value: 'category', label: 'Grouped by category' },
  { value: 'location', label: 'Grouped by location' },
  { value: 'status', label: 'Grouped by status' },
  { value: 'priority', label: 'Grouped by priority' },
  { value: 'due', label: 'Grouped by due date' },
  { value: 'tags', label: 'Grouped by tags' },
] as const;
const VIEW_KEY = 'mp-task-view';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) ?? ''; } catch { return ''; } };

// Columns edited by picking from a list (editor: 'select') show a caret and open with one click.
const dropdown = gridDropdown;
const esc = gridEsc;
const NO_CATEGORY = 'No category';
const TOP_LEVEL = 'Top level';
const NO_LOCATION = 'No location';
const ANY_TIME = 'Any time';
// Choices for the grid's Time cell: a part of the day, or a half hour.
const WHEN_OPTIONS = [ANY_TIME, ...DAY_PARTS.map((p) => p.label), ...HALF_HOURS.map(timeLabel)];

/** A Time cell choice back to the task fields. */
function parseWhen(label: string): Pick<TaskInput, 'due_part' | 'due_time'> {
  const part = DAY_PARTS.find((p) => p.label === label);
  if (part) return { due_part: part.value, due_time: null };
  const time = HALF_HOURS.find((t) => timeLabel(t) === label);
  return { due_part: null, due_time: time ?? null };
}
// Invisible character used to tell apart sibling tasks that share a title, since
// lattice-grid builds the tree from title paths.
const ZWSP = '​';

/** Children of each task (key '' = top level), siblings in display order. */
function childrenOf(tasks: Task[]) {
  const ids = new Set(tasks.map((t) => t.id));
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.parent_id && ids.has(t.parent_id) ? t.parent_id : '';
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  return map;
}

/** Ids of a task and everything below it. */
function subtree(id: string, kids: Map<string, Task[]>): Set<string> {
  const out = new Set<string>([id]);
  const walk = (pid: string) => { for (const c of kids.get(pid) ?? []) { out.add(c.id); walk(c.id); } };
  walk(id);
  return out;
}

const pill = (text: string, tone: string) => `<span class="task-pill task-pill-${tone}">${text}</span>`;

export function TaskTree({ projectId, companyId, team, locations, canManage, onTasksChanged }: {
  projectId: string; companyId: string; team: ProjectMember[];
  /** The project's locations, which a task can be assigned to. */
  locations: Location[];
  canManage: boolean;
  /** Called after tasks change, e.g. so location task counts can refresh. */
  onTasksChanged?: () => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const gridRef = useRef<LatticeGridInstance<TaskRow> | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, c, g] = await Promise.all([api.tasks(projectId), api.taskCategories(companyId), api.taskTags(companyId)]);
      setTasks(t);
      setCategories(c);
      setTags(g);
    } catch (e) { setError(errorText(e)); }
    setLoaded(true);
  }, [projectId, companyId]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setError(null);
    setNotice(null);
    try { await fn(); } catch (e) { setError(errorText(e)); await load(); return false; }
    if (ok) setNotice(ok);
    await load();
    onTasksChanged?.();
    return true;
  };

  const people = useMemo(() => team.map((m) => ({ id: m.user_id, name: displayName(m.profile) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [team]);
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const locationName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);
  // Only the names matter to the grid; task counts changing shouldn't rebuild it.
  const locationList = locations.map((l) => l.name).join('\n');
  const kids = useMemo(() => childrenOf(tasks), [tasks]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  // A unique label per task for the "Sub-task of" picker: tasks sharing a title get (2), (3)…
  const taskLabels = useMemo(() => {
    const seen = new Map<string, number>();
    return new Map([...tasks].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((t) => {
      const n = (seen.get(t.title) ?? 0) + 1;
      seen.set(t.title, n);
      return [t.id, n > 1 ? `${t.title} (${n})` : t.title];
    }));
  }, [tasks]);

  // Rows in tree order, each with its path of (made unique) titles.
  const rows = useMemo<TaskRow[]>(() => {
    const out: TaskRow[] = [];
    const walk = (pid: string, parentPath: string[]) => {
      const seen = new Map<string, number>();
      for (const t of kids.get(pid) ?? []) {
        const n = seen.get(t.title) ?? 0;
        seen.set(t.title, n + 1);
        const path = [...parentPath, t.title + ZWSP.repeat(n)];
        const sub = kids.get(t.id) ?? [];
        out.push({
          id: t.id, path, title: t.title,
          description: t.description ?? '',
          parent: t.parent_id ? taskLabels.get(t.parent_id) ?? '' : TOP_LEVEL,
          status: labelOf(TASK_STATUSES, t.status),
          priority: labelOf(TASK_PRIORITIES, t.priority),
          assignee: t.assignee_id ? nameOf.get(t.assignee_id) ?? 'Left the project' : UNASSIGNED,
          due: t.due_date ?? '',
          when: dueWhen(t),
          subtasks: sub.length ? `${sub.filter((s) => s.status === 'done').length} of ${sub.length} done` : '',
          category: t.category_id ? categoryName.get(t.category_id) ?? '' : '',
          location: t.location_id ? locationName.get(t.location_id) ?? '' : '',
          tags: t.tag_ids.map((id) => tagName.get(id)).filter(Boolean).sort().join(', '),
        });
        walk(t.id, path);
      }
    };
    walk('', []);
    return out;
  }, [kids, taskLabels, nameOf, categoryName, tagName, locationName]);

  const [view, setView] = useState<string>(readView);
  function changeView(v: string) {
    setView(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage unavailable */ }
  }

  const options = useMemo(() => {
    const overdueText = ({ value, data }: { value: string; data: TaskRow }) => {
      const t = byIdRef.current.get(data.id);
      return value ? (t && isOverdue(t) ? `<span class="task-overdue">${value}</span>` : value) : '';
    };
    const columns = [
      // In the tree the task's name is the tree column; a flat list needs its own.
      ...(view ? [{ field: 'title', header: 'Task', width: window.innerWidth < 640 ? 170 : 240, editable: true }] : []),
      {
        field: 'assignee', header: 'Assigned to', width: 170, editable: true, editor: 'select',
        editorOptions: [UNASSIGNED, ...people.map((p) => p.name)],
        render: ({ value }: { value: string }) => dropdown(esc(value)),
      },
      {
        field: 'category', header: 'Category', width: 150, editable: true, editor: 'select',
        editorOptions: [NO_CATEGORY, ...categories.map((c) => c.name)],
        render: ({ value }: { value: string }) => dropdown(value ? esc(value) : '<span class="text-muted">None</span>'),
      },
      {
        field: 'status', header: 'Status', width: 130, editable: true, editor: 'select',
        editorOptions: TASK_STATUSES.map((s) => s.label),
        render: ({ value }: { value: string }) => dropdown(pill(value, valueOf(TASK_STATUSES, value) ?? 'todo')),
      },
      {
        field: 'priority', header: 'Priority', width: 115, editable: true, editor: 'select',
        editorOptions: TASK_PRIORITIES.map((s) => s.label),
        render: ({ value }: { value: string }) => dropdown(pill(value, valueOf(TASK_PRIORITIES, value) ?? 'medium')),
      },
      {
        field: 'location', header: 'Location', width: 160, editable: true, editor: 'select',
        editorOptions: [NO_LOCATION, ...locationList.split('\n').filter(Boolean)],
        render: ({ value }: { value: string }) => dropdown(value ? esc(value) : '<span class="text-muted">None</span>'),
      },
      { field: 'due', header: 'Due', type: 'date', width: 120, editable: true, render: overdueText },
      {
        // A part of the day or a time on the due date. More exact times are set in the task panel.
        field: 'when', header: 'Time', width: 120, editor: 'select', editorOptions: WHEN_OPTIONS,
        editable: (d: TaskRow) => !!d.due,
        render: (a: { value: string; data: TaskRow }) => (a.data.due ? dropdown(overdueText(a)) : ''),
      },
      {
        // Comma-separated; new names become new company tags.
        field: 'tags', header: 'Tags', width: 200, editable: true,
        tooltip: () => 'Separate tags with commas. New names are added as tags.',
      },
      { field: 'description', header: 'Description', width: 260, editable: true, editor: 'textarea' },
      {
        // Move a task under another one (not under itself or its own sub-tasks).
        field: 'parent', header: 'Sub-task of', width: 170, editable: true, editor: 'select',
        editorOptions: (d: TaskRow) => {
          const below = subtree(d.id, kidsRef.current);
          return [TOP_LEVEL, ...[...labelsRef.current].filter(([id]) => !below.has(id)).map(([, label]) => label).sort()];
        },
        render: ({ value }: { value: string }) => dropdown(esc(value)),
      },
      { field: 'subtasks', header: 'Sub-tasks', width: 120 },
    ];
    const common = {
      rowId: (r: TaskRow) => r.id,
      groupDefaultExpanded: -1,
      toolbar: { quickFilter: true, expandCollapse: true },
      statusBar: false,
      emptyMessage: 'No tasks yet. Add one above.',
      columns,
    };
    return view
      ? {
        ...common,
        // Grouped list: one group per value of the chosen column. More columns can be
        // dragged into the bar above the grid to group further.
        groupBy: [view],
        groupPanel: true,
        groupColumnHeader: 'Group',
        groupColumnWidth: window.innerWidth < 640 ? 160 : 200,
      }
      : {
        ...common,
        treeData: true,
        getTreePath: (r: TaskRow) => r.path,
        treeColumnHeader: 'Task',
        // The tree column is the task's name, and edits it (a local lattice-grid option).
        treeColumnField: 'title',
        // Keep the pinned task column narrow enough on phones to leave room for the others.
        groupColumnWidth: window.innerWidth < 640 ? 190 : 260,
        groupPanel: false,
      };
  }, [people, categories, locationList, view]);

  // The due-date renderer reads the latest tasks without rebuilding the grid.
  const byIdRef = useRef(byId);
  byIdRef.current = byId;
  // The Sub-task of picker reads the latest tasks the same way.
  const kidsRef = useRef(kids);
  kidsRef.current = kids;
  const labelsRef = useRef(taskLabels);
  labelsRef.current = taskLabels;

  /** Tag names (comma-separated) to tag ids, creating tags the company doesn't have yet. */
  async function tagIdsFor(text: string) {
    const names = [...new Set(text.split(',').map((n) => n.trim()).filter(Boolean))];
    const ids: string[] = [];
    for (const name of names) {
      const found = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      ids.push(found ? found.id : (await api.createTaskTag(companyId, name)).id);
    }
    return ids;
  }

  async function onCellChanged(e: { data: TaskRow; column: string; newValue: unknown }) {
    const v = e.newValue == null ? '' : String(e.newValue);
    if (e.column === 'tags') {
      await run(async () => api.updateTask(e.data.id, { tag_ids: await tagIdsFor(v) }));
      return;
    }
    if ((e.column === '__group' || e.column === 'title') && !v.trim()) { await load(); return; }
    const patch: TaskInput | null =
      e.column === '__group' || e.column === 'title' ? { title: v.trim() }
      : e.column === 'description' ? { description: v.trim() || null }
      : e.column === 'parent' ? { parent_id: v === TOP_LEVEL || !v ? null : [...taskLabels].find(([, l]) => l === v)?.[0] }
      : e.column === 'status' ? { status: valueOf(TASK_STATUSES, v) as TaskStatus | undefined }
      : e.column === 'priority' ? { priority: valueOf(TASK_PRIORITIES, v) as TaskPriority | undefined }
      : e.column === 'assignee' ? { assignee_id: v === UNASSIGNED || !v ? null : people.find((p) => p.name === v)?.id ?? null }
      // Clearing the date clears its time too.
      : e.column === 'due' ? (v ? { due_date: v } : { due_date: null, due_part: null, due_time: null })
      : e.column === 'when' ? parseWhen(v)
      : e.column === 'category' ? { category_id: v === NO_CATEGORY || !v ? null : categories.find((c) => c.name === v)?.id }
      : e.column === 'location' ? { location_id: v === NO_LOCATION || !v ? null : locations.find((l) => l.name === v)?.id }
      : null;
    if (!patch || Object.values(patch).some((x) => x === undefined)) { await load(); return; }
    await run(() => api.updateTask(e.data.id, patch));
  }

  // Selecting follows the focused cell, so parent tasks (tree groups) can be picked too.
  function onRange(r: { r1: number }) {
    // `display` is a lattice-grid internal that isn't in its type declarations.
    const g = gridRef.current as unknown as { display?: { node?: { data?: TaskRow } }[] } | null;
    const id: string | undefined = g?.display?.[r.r1]?.node?.data?.id;
    if (id) setSelectedId(id);
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    if (await run(() => api.createTask(projectId, { title }), `Added "${title}".`)) setNewTitle('');
  }

  // Group header rows take space too when the list is grouped.
  const groupCount = view ? new Set(rows.map((r) => r[view as keyof TaskRow] as string)).size : 0;
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <Section id="project.tasks" title="Tasks" summary={tasks.length ? `${done} of ${tasks.length} done` : undefined}>
      <p className="hint">
        Click a person, location, category, status, priority, time or parent task to pick from its list. Double-click a task name, due date, tags or description to type a change.
        Select a task to edit its description, tags and notes, add sub-tasks, or move it.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="label sm:flex-row sm:items-center sm:gap-2">Show
          <select className="field sm:w-auto" value={view} onChange={(e) => changeView(e.target.value)} aria-label="How to show tasks">
            {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
        </label>
        {view && <span className="hint">Drag more column headers into the bar above the grid to group further.</span>}
      </div>
      <form className="form-row my-2" onSubmit={addTask}>
        <input className="field" placeholder="New task, e.g. Scout locations" value={newTitle} maxLength={200}
          onChange={(e) => setNewTitle(e.target.value)} required />
        <button type="submit" className="btn" data-pin>Add task</button>
      </form>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {/* The panel's space is always kept so selecting a task doesn't resize the grid
          in the middle of a double-click. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {loaded ? (
          <LatticeGrid
            options={options}
            rows={rows}
            height={Math.min(160 + (rows.length + groupCount) * 34 + (view ? 44 : 0), 640)}
            on={{ cellValueChanged: onCellChanged, rangeChanged: onRange }}
            onReady={(g) => { gridRef.current = g; }}
          />
        ) : <p className="text-muted">Loading tasks…</p>}
        {selected ? (
          <TaskPanel
            key={selected.id}
            task={selected}
            projectId={projectId}
            tasks={tasks}
            kids={kids}
            canManage={canManage}
            people={people}
            companyId={companyId}
            categories={categories}
            locations={locations}
            tags={tags}
            run={run}
            onDeleted={() => setSelectedId(null)}
            onAdded={(id) => setSelectedId(id)}
          />
        ) : (
          <aside data-pin-scope className="card hidden lg:flex">
            <p className="text-muted">Select a task to see its details.</p>
          </aside>
        )}
      </div>
    </Section>
  );
}

function TaskPanel({ task, projectId, companyId, tasks, kids, categories, locations, tags, people, canManage, run, onDeleted, onAdded }: {
  task: Task; projectId: string; companyId: string; tasks: Task[]; kids: Map<string, Task[]>;
  categories: TaskCategory[]; locations: Location[]; tags: TaskTag[]; people: { id: string; name: string }[]; canManage: boolean;
  run: (fn: () => Promise<unknown>, ok?: string) => Promise<boolean>;
  onDeleted: () => void; onAdded: (id: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [dueDate, setDueDate] = useState(task.due_date ?? '');
  // 'any', a part of the day, or 'time' for an exact time.
  const [when, setWhen] = useState<string>(task.due_part ?? (task.due_time ? 'time' : 'any'));
  const [dueTime, setDueTime] = useState(task.due_time?.slice(0, 5) ?? '');
  const [subTitle, setSubTitle] = useState('');
  const below = useMemo(() => subtree(task.id, kids), [task.id, kids]);
  const children = kids.get(task.id) ?? [];
  const parents = tasks.filter((t) => !below.has(t.id)).sort((a, b) => a.title.localeCompare(b.title));
  const due: Pick<TaskInput, 'due_date' | 'due_part' | 'due_time'> = !dueDate
    ? { due_date: null, due_part: null, due_time: null }
    : {
      due_date: dueDate,
      due_part: when === 'any' || when === 'time' ? null : when as DayPart,
      due_time: when === 'time' && dueTime ? dueTime : null,
    };
  const changed = title.trim() !== task.title || (description.trim() || null) !== task.description
    || due.due_date !== task.due_date || due.due_part !== task.due_part
    || (due.due_time ?? null) !== (task.due_time?.slice(0, 5) ?? null);

  async function save(e: FormEvent) {
    e.preventDefault();
    await run(() => api.updateTask(task.id, { title: title.trim(), description: description.trim() || null, ...due }), 'Task saved.');
  }

  async function addSub(e: FormEvent) {
    e.preventDefault();
    const t = subTitle.trim();
    if (!t) return;
    let id = '';
    if (await run(async () => { id = (await api.createTask(projectId, { title: t, parent_id: task.id })).id; }, `Added "${t}" under "${task.title}".`)) {
      setSubTitle('');
      if (id) onAdded(id);
    }
  }

  async function setTags(ids: string[]) {
    await run(() => api.updateTask(task.id, { tag_ids: ids }));
  }

  async function createTag(name: string) {
    let made: TaskTag | null = null;
    await run(async () => { made = await api.createTaskTag(companyId, name); });
    return made;
  }

  async function move(parentId: string) {
    await run(() => api.updateTask(task.id, { parent_id: parentId || null }),
      parentId ? 'Task moved.' : 'Task moved to the top level.');
  }

  async function remove() {
    const n = below.size - 1;
    const msg = n ? `Delete "${task.title}" and its ${n} sub-task${n === 1 ? '' : 's'}?` : `Delete "${task.title}"?`;
    if (!window.confirm(msg)) return;
    if (await run(() => api.deleteTask(task.id), `Deleted "${task.title}".`)) onDeleted();
  }

  return (
    <aside data-pin-scope className="card gap-3 lg:max-h-[720px] lg:overflow-auto">
      <form className="flex flex-col gap-2" onSubmit={save}>
        <label className="label">Task<input className="field" value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="label">Description<textarea className="field" rows={3} value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="label">Due date<input className="field" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
        {dueDate && (
          <div className="grid grid-cols-2 gap-2">
            <label className="label">Time of day
              <select className="field" value={when} onChange={(e) => setWhen(e.target.value)}>
                <option value="any">{ANY_TIME}</option>
                {DAY_PARTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                <option value="time">Exact time</option>
              </select>
            </label>
            {when === 'time' && (
              <label className="label">Time<input className="field" type="time" value={dueTime} required onChange={(e) => setDueTime(e.target.value)} /></label>
            )}
          </div>
        )}
        <button type="submit" className="btn" disabled={!changed} data-pin="2">Save</button>
      </form>

      <div className="grid grid-cols-2 gap-2">
        <label className="label">Status
          <select className="field" value={task.status}
            onChange={(e) => run(() => api.updateTask(task.id, { status: e.target.value as TaskStatus }))}>
            {TASK_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </label>
        <label className="label">Priority
          <select className="field" value={task.priority}
            onChange={(e) => run(() => api.updateTask(task.id, { priority: e.target.value as TaskPriority }))}>
            {TASK_PRIORITIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </select>
        </label>
      </div>

      <label className="label">Assigned to
        <select className="field" value={task.assignee_id ?? ''}
          onChange={(e) => run(() => api.updateTask(task.id, { assignee_id: e.target.value || null }), 'Task assigned.')}>
          <option value="">{UNASSIGNED}</option>
          {task.assignee_id && !people.some((p) => p.id === task.assignee_id) && <option value={task.assignee_id}>Left the project</option>}
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {people.length <= 1 && (
          <span className="hint">Only people on the project team can be assigned. Add more people in the Team section above.</span>
        )}
      </label>

      <label className="label">Location
        <select className="field" value={task.location_id ?? ''}
          onChange={(e) => run(() => api.updateTask(task.id, { location_id: e.target.value || null }))}>
          <option value="">{NO_LOCATION}</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {!locations.length && <span className="hint">Add the project's locations in the Locations section above.</span>}
      </label>

      <label className="label">Category
        <select className="field" value={task.category_id ?? ''}
          onChange={(e) => run(() => api.updateTask(task.id, { category_id: e.target.value || null }))}>
          <option value="">{NO_CATEGORY}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <div className="label">Tags
        <TagPicker tags={tags} selected={task.tag_ids} onChange={setTags} onCreate={createTag} />
      </div>

      <TaskNotes taskId={task.id} canManage={canManage} />

      <Section id="task.subtasks" title="Sub-tasks" level="h4" bodyClassName="flex flex-col gap-2"
        summary={children.length ? `${children.filter((c) => c.status === 'done').length} of ${children.length} done` : undefined}>
        {children.length > 0 && (
          <ul className="flex flex-col">
            {children.map((c) => (
              <li key={c.id} className="flex items-center gap-2 border-b border-line py-1 last:border-b-0">
                <input type="checkbox" className="h-5 w-5 shrink-0 cursor-pointer accent-accent" checked={c.status === 'done'} aria-label={`Mark ${c.title} done`}
                  onChange={(e) => run(() => api.updateTask(c.id, { status: e.target.checked ? 'done' : 'todo' }))} />
                <button type="button" className={`btn-link min-w-0 flex-1 truncate text-left ${c.status === 'done' ? 'line-through text-muted' : ''}`}
                  title="Open this sub-task" onClick={() => onAdded(c.id)}>
                  {c.title}
                </button>
                <span className={`task-pill task-pill-${c.status}`}>{labelOf(TASK_STATUSES, c.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <form className="flex flex-col gap-2" onSubmit={addSub}>
        <label className="label">Add a sub-task
          <input className="field" placeholder="e.g. Visit the warehouse" value={subTitle} maxLength={200} onChange={(e) => setSubTitle(e.target.value)} required />
        </label>
        <button type="submit" className="btn btn-secondary">Add sub-task</button>
      </form>

      <label className="label">Sub-task of
        <select className="field" value={task.parent_id ?? ''} onChange={(e) => move(e.target.value)}>
          <option value="">Nothing (top-level task)</option>
          {parents.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </label>

      <button type="button" className="btn btn-danger" onClick={remove}>Delete task</button>
    </aside>
  );
}
