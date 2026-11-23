import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { LatticeGrid } from './LatticeGrid';
import { TagPicker } from './TagPicker';
import { TaskNotes } from './TaskNotes';
import {
  api, type DayPart, type ProjectMember, type Task, type TaskCategory, type TaskInput, type TaskPriority, type TaskStatus, type TaskTag,
} from '../lib/api';
import {
  DAY_PARTS, HALF_HOURS, TASK_PRIORITIES, TASK_STATUSES, displayName, dueWhen, errorText, isOverdue, labelOf, timeLabel, valueOf,
} from '../lib/format';
import type { LatticeGridInstance } from '../vendor/lattice-grid/lattice-grid';

interface TaskRow {
  id: string;
  path: string[];
  status: string;
  priority: string;
  assignee: string;
  due: string;
  when: string;
  subtasks: string;
  category: string;
  tags: string;
}

const UNASSIGNED = 'Unassigned';
const NO_CATEGORY = 'No category';
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

export function TaskTree({ projectId, companyId, team, canManage }: {
  projectId: string; companyId: string; team: ProjectMember[]; canManage: boolean;
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
    return true;
  };

  const people = useMemo(() => team.map((m) => ({ id: m.user_id, name: displayName(m.profile) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [team]);
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const categoryName = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const tagName = useMemo(() => new Map(tags.map((t) => [t.id, t.name])), [tags]);
  const kids = useMemo(() => childrenOf(tasks), [tasks]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

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
          id: t.id, path,
          status: labelOf(TASK_STATUSES, t.status),
          priority: labelOf(TASK_PRIORITIES, t.priority),
          assignee: t.assignee_id ? nameOf.get(t.assignee_id) ?? 'Left the project' : UNASSIGNED,
          due: t.due_date ?? '',
          when: dueWhen(t),
          subtasks: sub.length ? `${sub.filter((s) => s.status === 'done').length} of ${sub.length} done` : '',
          category: t.category_id ? categoryName.get(t.category_id) ?? '' : '',
          tags: t.tag_ids.map((id) => tagName.get(id)).filter(Boolean).sort().join(', '),
        });
        walk(t.id, path);
      }
    };
    walk('', []);
    return out;
  }, [kids, nameOf, categoryName, tagName]);

  const options = useMemo(() => ({
    rowId: (r: TaskRow) => r.id,
    treeData: true,
    getTreePath: (r: TaskRow) => r.path,
    treeColumnHeader: 'Task',
    // Keep the pinned task column narrow enough on phones to leave room for the others.
    groupColumnWidth: window.innerWidth < 640 ? 190 : 260,
    groupDefaultExpanded: -1,
    toolbar: { quickFilter: true, expandCollapse: true },
    groupPanel: false, statusBar: false,
    emptyMessage: 'No tasks yet. Add one above.',
    columns: [
      {
        field: 'assignee', header: 'Assigned to', width: 160, editable: true, editor: 'select',
        editorOptions: [UNASSIGNED, ...people.map((p) => p.name)],
      },
      {
        field: 'category', header: 'Category', width: 140, editable: true, editor: 'select',
        editorOptions: [NO_CATEGORY, ...categories.map((c) => c.name)],
      },
      {
        field: 'status', header: 'Status', width: 120, editable: true, editor: 'select',
        editorOptions: TASK_STATUSES.map((s) => s.label),
        render: ({ value }: { value: string }) => pill(value, valueOf(TASK_STATUSES, value) ?? 'todo'),
      },
      {
        field: 'priority', header: 'Priority', width: 100, editable: true, editor: 'select',
        editorOptions: TASK_PRIORITIES.map((s) => s.label),
        render: ({ value }: { value: string }) => pill(value, valueOf(TASK_PRIORITIES, value) ?? 'medium'),
      },
      {
        field: 'due', header: 'Due', type: 'date', width: 120, editable: true,
        render: ({ value, data }: { value: string; data: TaskRow }) => {
          const t = byIdRef.current.get(data.id);
          return value ? (t && isOverdue(t) ? `<span class="task-overdue">${value}</span>` : value) : '';
        },
      },
      {
        // A part of the day or a time on the due date. More exact times are set in the task panel.
        field: 'when', header: 'Time', width: 110, editor: 'select', editorOptions: WHEN_OPTIONS,
        editable: (d: TaskRow) => !!d.due,
        render: ({ value, data }: { value: string; data: TaskRow }) => {
          const t = byIdRef.current.get(data.id);
          return value ? (t && isOverdue(t) ? `<span class="task-overdue">${value}</span>` : value) : '';
        },
      },
      { field: 'tags', header: 'Tags', width: 200 },
      { field: 'subtasks', header: 'Sub-tasks', width: 120 },
    ],
  }), [people, categories]);

  // The due-date renderer reads the latest tasks without rebuilding the grid.
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  async function onCellChanged(e: { data: TaskRow; column: string; newValue: unknown }) {
    const v = e.newValue == null ? '' : String(e.newValue);
    const patch: TaskInput | null =
      e.column === 'status' ? { status: valueOf(TASK_STATUSES, v) as TaskStatus | undefined }
      : e.column === 'priority' ? { priority: valueOf(TASK_PRIORITIES, v) as TaskPriority | undefined }
      : e.column === 'assignee' ? { assignee_id: v === UNASSIGNED || !v ? null : people.find((p) => p.name === v)?.id ?? null }
      // Clearing the date clears its time too.
      : e.column === 'due' ? (v ? { due_date: v } : { due_date: null, due_part: null, due_time: null })
      : e.column === 'when' ? parseWhen(v)
      : e.column === 'category' ? { category_id: v === NO_CATEGORY || !v ? null : categories.find((c) => c.name === v)?.id }
      : null;
    if (!patch || Object.values(patch).some((x) => x === undefined)) { await load(); return; }
    await run(() => api.updateTask(e.data.id, patch));
  }

  // Selecting follows the focused cell, so parent tasks (tree groups) can be picked too.
  function onRange(r: { r1: number }) {
    // `display` is lattice-grid's list of shown rows; it isn't in the type declarations.
    const entry = (gridRef.current as unknown as { display?: { node?: { data?: TaskRow } }[] })?.display?.[r.r1];
    const id: string | undefined = entry?.node?.data?.id;
    if (id) setSelectedId(id);
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    if (await run(() => api.createTask(projectId, { title }), `Added "${title}".`)) setNewTitle('');
  }

  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <div>
      <h2>Tasks</h2>
      <p className="hint mt-1">
        {tasks.length ? `${done} of ${tasks.length} done. ` : ''}
        Double-click (or tap twice) a person, category, status, priority, due date or time to change it. Select a task to edit its description, tags and notes, add sub-tasks, or move it.
      </p>
      <form className="form-row my-2" onSubmit={addTask}>
        <input className="field" placeholder="New task, e.g. Scout locations" value={newTitle} maxLength={200}
          onChange={(e) => setNewTitle(e.target.value)} required />
        <button type="submit" className="btn">Add task</button>
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
            height={Math.min(160 + rows.length * 34, 600)}
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
            tags={tags}
            run={run}
            onDeleted={() => setSelectedId(null)}
            onAdded={(id) => setSelectedId(id)}
          />
        ) : (
          <aside className="card hidden lg:flex">
            <p className="text-muted">Select a task to see its details.</p>
          </aside>
        )}
      </div>
    </div>
  );
}

function TaskPanel({ task, projectId, companyId, tasks, kids, categories, tags, people, canManage, run, onDeleted, onAdded }: {
  task: Task; projectId: string; companyId: string; tasks: Task[]; kids: Map<string, Task[]>;
  categories: TaskCategory[]; tags: TaskTag[]; people: { id: string; name: string }[]; canManage: boolean;
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
    <aside className="card gap-3 lg:max-h-[720px] lg:overflow-auto">
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
        <button type="submit" className="btn" disabled={!changed}>Save</button>
      </form>

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

      <section className="flex flex-col gap-2" aria-label="Sub-tasks">
        <h4>Sub-tasks{children.length ? ` (${children.filter((c) => c.status === 'done').length} of ${children.length} done)` : ''}</h4>
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
      </section>

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
