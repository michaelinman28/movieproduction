import { useMemo, useState, type DragEvent } from 'react';
import type { Task } from '../lib/api';
import { TASK_STATUSES, dueWhen, isOverdue, labelOf } from '../lib/format';

/** 'YYYY-MM-DD' for a local date. */
export function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

// Within a day: timed and part-of-day tasks in order of the day, then "any time".
const PART_ORDER: Record<string, string> = { morning: '08:00', afternoon: '13:00', evening: '18:00' };
const dayOrder = (t: Task) => t.due_time?.slice(0, 5) ?? (t.due_part ? PART_ORDER[t.due_part] : '99');

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Task chips shown in a day before "+N more" (on wider screens).
const MAX_CHIPS = 3;

/**
 * A month calendar of a project's tasks by due date. Clicking a day lists its tasks
 * below the month; clicking a task opens it in the task panel. On a computer, drag a
 * task to another day to move its due date (saved at once, like a table cell).
 */
export function TaskCalendar({ tasks, selectedId, day, onDay, onOpen, onMove, nameOf }: {
  tasks: Task[];
  selectedId: string | null;
  /** The chosen day, 'YYYY-MM-DD'. New tasks are added on it. */
  day: string;
  /** Chooses a day; false when it was refused (e.g. unsaved changes kept). */
  onDay: (day: string) => boolean;
  /** Opens a task in the panel, choosing its day too. */
  onOpen: (id: string) => void;
  onMove: (id: string, day: string) => void;
  nameOf: Map<string, string>;
}) {
  const [month, setMonth] = useState(() => { const d = parseIso(day); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [dragOver, setDragOver] = useState<string | null>(null);
  const today = isoDate(new Date());

  const byDay = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) if (t.due_date) m.set(t.due_date, [...(m.get(t.due_date) ?? []), t]);
    for (const list of m.values()) list.sort((a, b) => dayOrder(a).localeCompare(dayOrder(b)) || a.title.localeCompare(b.title));
    return m;
  }, [tasks]);
  const undated = tasks.filter((t) => !t.due_date).length;

  // Whole weeks, Sunday to Saturday, covering the month.
  const weeks = useMemo(() => {
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const out: Date[][] = [];
    for (let d = start; d <= end || out[out.length - 1]?.length < 7;) {
      if (!out.length || out[out.length - 1].length === 7) out.push([]);
      out[out.length - 1].push(d);
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return out;
  }, [month]);

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  function goToday() {
    const d = new Date();
    if (onDay(today)) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  function pick(d: Date) {
    if (onDay(isoDate(d)) && d.getMonth() !== month.getMonth()) setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  function drop(e: DragEvent, iso: string) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/x-task-id');
    const t = tasks.find((x) => x.id === id);
    if (t && t.due_date !== iso) onMove(id, iso);
  }

  const chipClass = (t: Task) => [
    'block w-full truncate rounded px-1 text-left text-xs leading-5',
    t.status === 'done' ? 'text-muted line-through' : isOverdue(t) ? 'text-danger font-semibold' : 'text-fg',
    t.id === selectedId ? 'bg-accent-soft ring-1 ring-accent' : 'bg-bg hover:bg-accent-soft',
  ].join(' ');

  const dayTasks = byDay.get(day) ?? [];
  const dayLabel = parseIso(day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1">
        <button type="button" className="btn btn-secondary w-11 shrink-0 px-0" onClick={() => shift(-1)} aria-label="Previous month">‹</button>
        <h3 className="m-0 min-w-0 flex-1 text-center">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <button type="button" className="btn btn-secondary w-11 shrink-0 px-0" onClick={() => shift(1)} aria-label="Next month">›</button>
        <button type="button" className="btn btn-secondary w-auto shrink-0" onClick={goToday}>Today</button>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-md border border-line bg-surface" role="grid" aria-label="Tasks by due date">
        {WEEKDAYS.map((w) => (
          <div key={w} role="columnheader" className="border-b border-line py-1 text-center text-xs font-semibold text-muted">
            <span className="sm:hidden">{w[0]}</span><span className="hidden sm:inline">{w}</span>
          </div>
        ))}
        {weeks.flat().map((d) => {
          const iso = isoDate(d);
          const list = byDay.get(iso) ?? [];
          const inMonth = d.getMonth() === month.getMonth();
          const open = list.filter((t) => t.status !== 'done').length;
          const late = list.some(isOverdue);
          return (
            <div key={iso} role="gridcell" aria-selected={iso === day}
              className={`flex min-h-14 min-w-0 cursor-pointer flex-col gap-0.5 border-b border-r border-line p-0.5 [&:nth-child(7n)]:border-r-0 sm:min-h-24 sm:p-1
                ${inMonth ? '' : 'bg-bg text-muted'} ${iso === day ? 'outline-2 -outline-offset-2 outline-accent' : ''} ${dragOver === iso ? 'bg-accent-soft' : ''}`}
              onClick={() => pick(d)}
              onDragOver={(e) => { e.preventDefault(); setDragOver(iso); }}
              onDragLeave={() => setDragOver((o) => (o === iso ? null : o))}
              onDrop={(e) => drop(e, iso)}>
              <span className={`self-start rounded-full px-1.5 text-xs leading-5 sm:text-sm ${iso === today ? 'bg-accent font-semibold text-accent-fg' : ''}`}>{d.getDate()}</span>
              {/* Phones: a count per day; the day's tasks are listed below the month. */}
              {list.length > 0 && (
                <span className={`text-center text-xs font-semibold sm:hidden ${late ? 'text-danger' : open ? 'text-accent' : 'text-muted'}`}
                  aria-label={`${list.length} ${list.length === 1 ? 'task' : 'tasks'}`}>
                  {list.length}
                </span>
              )}
              <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {list.slice(0, MAX_CHIPS).map((t) => (
                  <button key={t.id} type="button" className={chipClass(t)} draggable
                    title={`${t.title}${dueWhen(t) ? `, ${dueWhen(t)}` : ''} (${labelOf(TASK_STATUSES, t.status)}). Drag to another day to move it.`}
                    onDragStart={(e) => { e.dataTransfer.setData('text/x-task-id', t.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDragOver(null)}
                    onClick={(e) => { e.stopPropagation(); onOpen(t.id); }}>
                    {t.due_time && <span className="text-muted">{dueWhen(t)} </span>}{t.title}
                  </button>
                ))}
                {list.length > MAX_CHIPS && <span className="px-1 text-xs text-muted">+{list.length - MAX_CHIPS} more</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1" aria-live="polite">
        <h4 className="m-0">{dayLabel}</h4>
        {dayTasks.length ? (
          <ul className="flex flex-col">
            {dayTasks.map((t) => (
              <li key={t.id} className="border-b border-line last:border-b-0">
                <button type="button" className={`flex min-h-11 w-full items-center gap-2 px-1 text-left ${t.id === selectedId ? 'bg-accent-soft' : 'hover:bg-bg'}`}
                  onClick={() => onOpen(t.id)}>
                  <span className="w-20 shrink-0 text-sm text-muted">{dueWhen(t) || 'Any time'}</span>
                  <span className={`min-w-0 flex-1 truncate ${t.status === 'done' ? 'text-muted line-through' : isOverdue(t) ? 'task-overdue' : ''}`}>{t.title}</span>
                  <span className="hidden truncate text-sm text-muted sm:inline">{t.assignee_id ? nameOf.get(t.assignee_id) ?? '' : ''}</span>
                  <span className={`task-pill task-pill-${t.status} shrink-0`}>{labelOf(TASK_STATUSES, t.status)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="hint">Nothing due this day. Add a task above to put it here.</p>}
        {undated > 0 && (
          <p className="hint">{undated === 1 ? '1 task has' : `${undated} tasks have`} no due date, so {undated === 1 ? "it isn't" : "they aren't"} on the calendar. Give {undated === 1 ? 'it' : 'them'} one in the task form or the table.</p>
        )}
      </div>
    </div>
  );
}
