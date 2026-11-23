import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { LatticeGrid, gridDropdown, gridEsc } from './LatticeGrid';
import { Section } from './Section';
import { TagPicker } from './TagPicker';
import { TaskNotes } from './TaskNotes';
import { TaskCalendar, isoDate } from './TaskCalendar';
import { confirmDiscard, useUnsaved } from '../lib/unsaved';
import { scrollToForm } from '../lib/reveal';
import { useAuth } from '../lib/auth';
import { mapsLinkProps } from '../lib/maps';
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
/** 'YYYY-MM-DD' to e.g. 'Mon, Nov 23'. */
const dayName = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); };

// How tasks are shown: the sub-task tree, a month calendar by due date, only the overdue tasks, a flat list grouped
// by a column, or only the tasks assigned to you.
const VIEWS = [
  { value: '', label: 'Sub-task tree' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'assignee', label: 'Grouped by person' },
  { value: 'category', label: 'Grouped by category' },
  { value: 'location', label: 'Grouped by location' },
  { value: 'status', label: 'Grouped by status' },
  { value: 'priority', label: 'Grouped by priority' },
  { value: 'due', label: 'Grouped by due date' },
  { value: 'mine', label: 'My tasks' },
] as const;
const VIEW_KEY = 'mp-task-view';
// A view that no longer exists (e.g. the old "Grouped by tags") falls back to the tree.
const readView = () => { try { const v = localStorage.getItem(VIEW_KEY) ?? ''; return VIEWS.some((x) => x.value === v) ? v : ''; } catch { return ''; } };

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
  // A task just added (or opened from the panel) is highlighted in the grid.
  const [reveal, setReveal] = useState<{ id: string; n: number } | null>(null);
  /** Selects a task, highlights it in the grid and shows its form. */
  function open(id: string) {
    setSelectedId(id);
    setReveal({ id, n: Date.now() });
    scrollToForm(id);
  }
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
  // Locations marked Not using aren't offered, except to a task already there.
  const locationList = locations.filter((l) => l.status !== 'not_using').map((l) => l.name).join('\n');
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
  const calendar = view === 'calendar';
  // Overdue: a flat list of only the tasks past their due time, oldest first.
  const overdue = view === 'overdue';
  // My tasks: a flat list of only the tasks assigned to you, soonest due first.
  const mine = view === 'mine';
  const me = useAuth().session?.user.id;
  // The column the grid groups by ('' for none).
  const groupBy = calendar || overdue || mine ? '' : view;
  // A flat list (grouped, overdue or my tasks) rather than the sub-task tree.
  const flat = !!groupBy || overdue || mine;
  // The calendar's chosen day; tasks added while the calendar shows are due on it.
  const [day, setDay] = useState(() => isoDate(new Date()));
  /** Switching views closes the open task form (asking first if it has unsaved changes). */
  function changeView(v: string) {
    if (selectedId) {
      if (!confirmDiscard()) return;
      setSelectedId(null);
    }
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
      ...(flat ? [{ field: 'title', header: 'Task', width: window.innerWidth < 640 ? 170 : 240, editable: true }] : []),
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
        editorOptions: (d: TaskRow) => {
          const names = locationList.split('\n').filter(Boolean);
          return [NO_LOCATION, ...(d.location && !names.includes(d.location) ? [d.location] : []), ...names];
        },
        render: ({ value }: { value: string }) => dropdown(value ? esc(value) : '<span class="text-muted">None</span>'),
      },
      { field: 'due', header: 'Due', type: 'date', width: 120, editable: true, render: overdueText, ...(overdue || mine ? { sort: 'asc' } : {}) },
      {
        // A part of the day or a time on the due date. More exact times are set in the task panel.
        field: 'when', header: 'Time', width: 120, editor: 'select', editorOptions: WHEN_OPTIONS,
        editable: (d: TaskRow) => !!d.due,
        render: (a: { value: string; data: TaskRow }) => (a.data.due ? dropdown(overdueText(a)) : ''),
      },
      {
        // Comma-separated; new names become new company tags.
        field: 'tags', header: 'Tags', width: 200, editable: true, filter: 'set', filterSplit: ',',
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
      emptyMessage: overdue ? 'Nothing is overdue.' : mine ? 'Nothing is assigned to you.' : 'No tasks yet. Add one above.',
      columns,
    };
    return flat
      ? {
        ...common,
        // Grouped list: one group per value of the chosen column. More columns can be
        // dragged into the bar above the grid to group further (the overdue list too).
        groupBy: groupBy ? [groupBy] : [],
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
  }, [people, categories, locationList, groupBy, flat, overdue, mine]);

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
    // Moving to another task with unsaved changes in the panel asks first.
    if (id && id !== selectedId && confirmDiscard()) setSelectedId(id);
  }

  async function addTask(e: FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    if (!confirmDiscard()) return;
    let id = '';
    // In My tasks a new task is yours (when you're on the team), so it shows in the list.
    const meOnTeam = mine && !!me && people.some((p) => p.id === me);
    const input: TaskInput & { title: string } = { title, ...(calendar ? { due_date: day } : {}), ...(meOnTeam ? { assignee_id: me } : {}) };
    if (await run(async () => { id = (await api.createTask(projectId, input)).id; }, `Added "${title}"${calendar ? ` on ${dayName(day)}` : ''}. Fill in the rest of its details in the form.${overdue ? " It isn't overdue, so it won't be in this list." : ''}`)) {
      setNewTitle('');
      // Adding is usually the start: open the new task's form.
      if (id) open(id);
    }
  }

  /** Calendar: choosing another day closes the open task unless it's due that day. */
  function chooseDay(d: string) {
    if (d === day) return true;
    const sel = selectedId ? byId.get(selectedId) : null;
    if (sel && sel.due_date !== d) {
      if (!confirmDiscard()) return false;
      setSelectedId(null);
    }
    setDay(d);
    return true;
  }
  /** Calendar: opens a task and moves the chosen day to its due date. */
  function openOnCalendar(id: string) {
    if (id !== selectedId && !confirmDiscard()) return;
    const due = byId.get(id)?.due_date;
    if (due) setDay(due);
    setSelectedId(id);
    scrollToForm(id);
  }

  // The overdue list shows only tasks past their due time.
  const overdueCount = tasks.filter(isOverdue).length;
  const myCount = tasks.filter((t) => t.assignee_id === me && t.status !== 'done').length;
  const shown = useMemo(() => {
    if (overdue) return rows.filter((r) => { const t = byId.get(r.id); return !!t && isOverdue(t); });
    if (mine) return rows.filter((r) => byId.get(r.id)?.assignee_id === me);
    return rows;
  }, [overdue, mine, me, rows, byId]);

  // Group header rows take space too when the list is grouped.
  const groupCount = groupBy ? new Set(shown.map((r) => r[groupBy as keyof TaskRow] as string)).size : 0;
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <Section id="project.tasks" title="Tasks" summary={tasks.length ? `${done} of ${tasks.length} done` : undefined}>
      <p className="hint">
        {calendar
          ? 'Tasks show on their due date. Click a day to list its tasks and add new ones on it, and click a task to open its form. On a computer, drag a task to another day to move it.'
          : 'Click a person, location, category, status, priority, time or parent task to pick from its list. Double-click a task name, due date, tags or description to type a change.'}
        {' '}Select a task to edit its description, tags and notes, add sub-tasks, or move it.
      </p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="label sm:flex-row sm:items-center sm:gap-2">Show
          <select className="field sm:w-auto" value={view} onChange={(e) => changeView(e.target.value)} aria-label="How to show tasks">
            {VIEWS.map((v) => <option key={v.value} value={v.value}>{v.value === 'overdue' ? `Overdue (${overdueCount})` : v.value === 'mine' ? `My tasks (${myCount} open)` : v.label}</option>)}
          </select>
        </label>
        {groupBy && <span className="hint">Drag more column headers into the bar above the grid to group further.</span>}
        {mine && <span className="hint">Tasks assigned to you, soonest due first. Tasks you add here are assigned to you.</span>}
        {overdue && <span className="hint">Tasks that aren't done and are past their due time, oldest first. Drag a column header into the bar above the grid to group them.</span>}
      </div>
      <form className="form-row my-2" onSubmit={addTask}>
        <input className="field" placeholder={calendar ? `New task on ${dayName(day)}` : 'New task, e.g. Scout locations'} aria-label="New task name" value={newTitle} maxLength={200}
          onChange={(e) => setNewTitle(e.target.value)} required />
        <button type="submit" className="btn" data-pin>Add task</button>
      </form>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {/* The task's form opens under the table or calendar, which keeps the full width. */}
      <div className="flex flex-col gap-4">
        {!loaded ? <p className="text-muted">Loading tasks…</p> : calendar ? (
          <TaskCalendar tasks={tasks} selectedId={selectedId} day={day} onDay={chooseDay} nameOf={nameOf}
            onOpen={openOnCalendar}
            onMove={(id, to) => run(() => api.updateTask(id, { due_date: to }), `Moved "${byId.get(id)?.title}" to ${dayName(to)}.`)} />
        ) : (
          <LatticeGrid
            options={options}
            rows={shown}
            height={Math.min(160 + (shown.length + groupCount) * 34 + (flat ? 44 : 0), 640)}
            on={{ cellValueChanged: onCellChanged, rangeChanged: onRange }}
            reveal={reveal}
            onReady={(g) => { gridRef.current = g; }}
          />
        )}
        {selected && (
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
            onAdded={(id) => { if (confirmDiscard()) open(id); }}
          />
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
  // Every field here is held until Save (the table saves each cell as it changes).
  const fromTask = (t: Task) => ({
    title: t.title, description: t.description ?? '', dueDate: t.due_date ?? '',
    // 'any', a part of the day, or 'time' for an exact time.
    when: t.due_part ?? (t.due_time ? 'time' : 'any'), dueTime: t.due_time?.slice(0, 5) ?? '',
    status: t.status, priority: t.priority, assignee: t.assignee_id ?? '', location: t.location_id ?? '',
    category: t.category_id ?? '', tags: t.tag_ids, parent: t.parent_id ?? '',
  });
  type Draft = ReturnType<typeof fromTask>;
  // `base` is what the form started from; Save sends only the fields that differ from it,
  // so a change made meanwhile in the table to another field isn't overwritten.
  const [base, setBase] = useState<Draft>(() => fromTask(task));
  const [draft, setDraft] = useState<Draft>(base);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const [subTitle, setSubTitle] = useState('');
  const below = useMemo(() => subtree(task.id, kids), [task.id, kids]);
  const children = kids.get(task.id) ?? [];
  const parents = tasks.filter((t) => !below.has(t.id)).sort((a, b) => a.title.localeCompare(b.title));

  const dueOf = (d: Draft): Pick<TaskInput, 'due_date' | 'due_part' | 'due_time'> => !d.dueDate
    ? { due_date: null, due_part: null, due_time: null }
    : { due_date: d.dueDate, due_part: d.when === 'any' || d.when === 'time' ? null : d.when as DayPart, due_time: d.when === 'time' && d.dueTime ? d.dueTime : null };
  const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  function patchOf(d: Draft): TaskInput {
    const p: TaskInput = {};
    if (d.title.trim() !== base.title) p.title = d.title.trim();
    if (d.description.trim() !== base.description) p.description = d.description.trim() || null;
    if (d.dueDate !== base.dueDate || d.when !== base.when || d.dueTime !== base.dueTime) Object.assign(p, dueOf(d));
    if (d.status !== base.status) p.status = d.status;
    if (d.priority !== base.priority) p.priority = d.priority;
    if (d.assignee !== base.assignee) p.assignee_id = d.assignee || null;
    if (d.location !== base.location) p.location_id = d.location || null;
    if (d.category !== base.category) p.category_id = d.category || null;
    if (!sameTags(d.tags, base.tags)) p.tag_ids = d.tags;
    if (d.parent !== base.parent) p.parent_id = d.parent || null;
    return p;
  }
  const changes = patchOf(draft);
  const changed = Object.keys(changes).length > 0;
  useUnsaved(changed);

  // When the task changes elsewhere (the table, a reload) and nothing here is unsaved,
  // show the new values.
  useEffect(() => {
    if (!changed) { const f = fromTask(task); setBase(f); setDraft(f); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!changed) return;
    if (await run(() => api.updateTask(task.id, changes), 'Task saved.')) {
      const f = { ...draft, title: draft.title.trim(), description: draft.description.trim() };
      setBase(f);
      setDraft(f);
    }
  }
  function discard() { setDraft(base); }

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
  async function createTag(name: string) {
    // A new tag is added to the company's list straight away; it goes on this task when you save.
    let made: TaskTag | null = null;
    await run(async () => { made = await api.createTaskTag(companyId, name); });
    return made;
  }

  async function remove() {
    const n = below.size - 1;
    const msg = n ? `Delete "${task.title}" and its ${n} sub-task${n === 1 ? '' : 's'}?` : `Delete "${task.title}"?`;
    if (!window.confirm(msg)) return;
    if (await run(() => api.deleteTask(task.id), `Deleted "${task.title}".`)) onDeleted();
  }
  return (
    <aside data-pin-scope data-form-for={task.id} className="card gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8">
      <form className="flex flex-col gap-2" onSubmit={save}>
        <label className="label">Task<input className="field" value={draft.title} maxLength={200} required onChange={(e) => set('title', e.target.value)} /></label>
        <label className="label">Description<textarea className="field" rows={3} value={draft.description} maxLength={5000} onChange={(e) => set('description', e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="label">Status
            <select className="field" value={draft.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {TASK_STATUSES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
          <label className="label">Priority
            <select className="field" value={draft.priority} onChange={(e) => set('priority', e.target.value as TaskPriority)}>
              {TASK_PRIORITIES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
          </label>
        </div>
        <label className="label">Due date<input className="field" type="date" value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} /></label>
        {draft.dueDate && (
          <div className="grid grid-cols-2 gap-2">
            <label className="label">Time of day
              <select className="field" value={draft.when} onChange={(e) => set('when', e.target.value)}>
                <option value="any">{ANY_TIME}</option>
                {DAY_PARTS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                <option value="time">Exact time</option>
              </select>
            </label>
            {draft.when === 'time' && (
              <label className="label">Time<input className="field" type="time" value={draft.dueTime} required onChange={(e) => set('dueTime', e.target.value)} /></label>
            )}
          </div>
        )}
        <label className="label">Assigned to
          <select className="field" value={draft.assignee} onChange={(e) => set('assignee', e.target.value)}>
            <option value="">{UNASSIGNED}</option>
            {draft.assignee && !people.some((p) => p.id === draft.assignee) && <option value={draft.assignee}>Left the project</option>}
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {people.length <= 1 && (
            <span className="hint">Only people on the project team can be assigned. Add more people on the Team page.</span>
          )}
        </label>
        <label className="label">Location
          <select className="field" value={draft.location} onChange={(e) => set('location', e.target.value)}>
            <option value="">{NO_LOCATION}</option>
            {locations.filter((l) => l.status !== 'not_using' || l.id === draft.location).map((l) => (
              <option key={l.id} value={l.id}>{l.name}{l.status === 'not_using' ? ' (not using)' : ''}</option>
            ))}
          </select>
          {(() => {
            const at = locations.find((l) => l.id === draft.location);
            return at?.address ? <a className="text-sm" {...mapsLinkProps(at.address)}>Open {at.name} in maps</a> : null;
          })()}
          {!locations.length && <span className="hint">Add the project's locations on the Locations page.</span>}
        </label>
        <label className="label">Category
          <select className="field" value={draft.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">{NO_CATEGORY}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="label">Tags
          <TagPicker tags={tags} selected={draft.tags} onChange={(ids) => set('tags', ids)} onCreate={createTag} />
        </div>
        <label className="label">Sub-task of
          <select className="field" value={draft.parent} onChange={(e) => set('parent', e.target.value)}>
            <option value="">Nothing (top-level task)</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn flex-1" disabled={!changed} data-pin="2">Save</button>
          <button type="button" className="btn btn-secondary" disabled={!changed} onClick={discard}>Undo changes</button>
        </div>
        {changed && <p className="hint">Unsaved changes.</p>}
      </form>

      {/* On wide screens: the form on the left; notes and sub-tasks on the right. */}
      <div className="flex flex-col gap-3">
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

        <button type="button" className="btn btn-danger" onClick={remove}>Delete task</button>
      </div>
    </aside>
  );
}
