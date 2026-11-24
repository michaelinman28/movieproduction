import { useMemo, useState, type DragEvent } from 'react';
import type { Task } from '../lib/api';
import { TASK_STATUSES, dueWhen, isOverdue, labelOf, startWhen } from '../lib/format';

/** 'YYYY-MM-DD' for a local date. */
export function isoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const parseIso = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
/** The date `n` days after 'YYYY-MM-DD'. */
export const addDays = (s: string, n: number) => { const d = parseIso(s); return isoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
/** Whole days from a to b. */
export const daysBetween = (a: string, b: string) => Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400000);

/** The first and last day a task covers: its start date (if any) to its due date. */
export function spanOf(t: Task): { first: string; last: string } | null {
  const first = t.start_date ?? t.due_date;
  const last = t.due_date ?? t.start_date;
  if (!first || !last) return null;
  return last < first ? { first: last, last: last } : { first, last };
}
/** Where a day falls in a task's span. */
type Part = 'single' | 'start' | 'middle' | 'end';
interface Entry { t: Task; part: Part; first: string; last: string }

// Within a day: tasks running over several days first (longest-running first, so their
// bars line up from day to day), then timed and part-of-day tasks in order of the day,
// then "any time".
const PART_ORDER: Record<string, string> = { morning: '08:00', afternoon: '13:00', evening: '18:00' };
const dayOrder = (t: Task) => t.due_time?.slice(0, 5) ?? (t.due_part ? PART_ORDER[t.due_part] : '99');
const entryOrder = (a: Entry, b: Entry) => {
  const sa = a.part !== 'single', sb = b.part !== 'single';
  if (sa !== sb) return sa ? -1 : 1;
  if (sa) return a.first.localeCompare(b.first) || b.last.localeCompare(a.last) || a.t.id.localeCompare(b.t.id);
  return dayOrder(a.t).localeCompare(dayOrder(b.t)) || a.t.title.localeCompare(b.t.title);
};
/** What a task is doing on a day, for the day's list: e.g. 'Starts 9:00 AM', 'Day 2 of 4', 'Due Evening'. */
function whenOnDay(e: Entry, day: string) {
  if (e.part === 'single') return dueWhen(e.t) || startWhen(e.t) || 'Any time';
  if (e.part === 'start') return `Starts${startWhen(e.t) ? ` ${startWhen(e.t)}` : ''}`;
  if (e.part === 'end') return `Due${dueWhen(e.t) ? ` ${dueWhen(e.t)}` : ''}`;
  return `Day ${daysBetween(e.first, day) + 1} of ${daysBetween(e.first, e.last) + 1}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Task chips shown in a day before "+N more" (on wider screens).
const MAX_CHIPS = 3;

/**
 * A month calendar of a project's tasks. A task shows on its due date, or, when it has
 * a start date too, as a bar across every day from its start to its due date. Clicking
 * a day lists its tasks below the month; clicking a task opens it in the task panel. On
 * a computer, drag a task to another day to move it (a multi-day task keeps its length;
 * saved at once, like a table cell).
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
  /** Moves a task: its new due date, and new start date when it has one. */
  onMove: (id: string, to: { due_date?: string; start_date?: string }) => void;
  nameOf: Map<string, string>;
}) {
  const [month, setMonth] = useState(() => { const d = parseIso(day); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [dragOver, setDragOver] = useState<string | null>(null);
  const today = isoDate(new Date());

  const byDay = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const t of tasks) {
      const sp = spanOf(t);
      if (!sp) continue;
      // Long spans are capped so a typo (start years early) can't flood the calendar.
      const n = Math.min(daysBetween(sp.first, sp.last), 366);
      for (let i = 0; i <= n; i++) {
        const d = addDays(sp.first, i);
        const part: Part = n === 0 ? 'single' : i === 0 ? 'start' : i === n ? 'end' : 'middle';
        m.set(d, [...(m.get(d) ?? []), { t, part, ...sp }]);
      }
    }
    for (const list of m.values()) list.sort(entryOrder);
    return m;
  }, [tasks]);
  const undated = tasks.filter((t) => !t.due_date && !t.start_date).length;

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
    const from = e.dataTransfer.getData('text/x-task-day');
    const t = tasks.find((x) => x.id === id);
    if (!t || !from || from === iso) return;
    // Moved by whole days; a task over several days keeps its length.
    const n = daysBetween(from, iso);
    onMove(id, {
      ...(t.due_date ? { due_date: addDays(t.due_date, n) } : {}),
      ...(t.start_date ? { start_date: addDays(t.start_date, n) } : {}),
    });
  }

  // A one-day task is a rounded chip; a task over several days is a bar that runs
  // edge to edge through the days between its start and due date.
  const chipClass = (en: Entry, iso: string) => {
    const t = en.t;
    const span = en.part !== 'single';
    const weekStart = parseIso(iso).getDay() === 0;
    return [
      'block h-5 shrink-0 truncate px-1 text-left text-xs leading-5',
      t.status === 'done' ? 'text-muted line-through' : isOverdue(t) ? 'text-danger font-semibold' : 'text-fg',
      !span ? 'w-full rounded' : '',
      // Bars reach into the cell padding so the days join up.
      en.part === 'start' ? '-mr-1 rounded-l border-l-4 border-accent' : '',
      en.part === 'middle' ? (weekStart ? '-mr-1 border-l-4 border-accent/40' : '-mx-1') : '',
      en.part === 'end' ? (weekStart ? 'rounded-r border-l-4 border-accent/40' : '-ml-1 rounded-r') : '',
      t.id === selectedId ? 'bg-accent-soft ring-1 ring-accent' : span ? 'bg-accent-soft/70 hover:bg-accent-soft' : 'bg-bg hover:bg-accent-soft',
    ].join(' ');
  };
  // A bar's name shows where it starts and at the start of each week; elsewhere it's blank.
  const chipLabel = (en: Entry, iso: string) => {
    const t = en.t;
    if (en.part === 'single') return <>{(t.due_time || (!t.due_date && t.start_time)) && <span className="text-muted">{dueWhen(t) || startWhen(t)} </span>}{t.title}</>;
    if (en.part === 'start' || parseIso(iso).getDay() === 0) return <>{en.part !== 'start' && <span aria-hidden="true">… </span>}{t.title}</>;
    return <span className="sr-only">{t.title} continues</span>;
  };

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
          const open = list.filter((en) => en.t.status !== 'done').length;
          const late = list.some((en) => isOverdue(en.t));
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
                {list.slice(0, MAX_CHIPS).map((en) => (
                  <button key={en.t.id} type="button" className={chipClass(en, iso)} draggable
                    title={`${en.t.title}: ${en.part === 'single' ? (dueWhen(en.t) || 'any time') : `${en.first} to ${en.last}`} (${labelOf(TASK_STATUSES, en.t.status)}). Drag to another day to move it.`}
                    onDragStart={(e) => { e.dataTransfer.setData('text/x-task-id', en.t.id); e.dataTransfer.setData('text/x-task-day', iso); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDragOver(null)}
                    onClick={(e) => { e.stopPropagation(); onOpen(en.t.id); }}>
                    {chipLabel(en, iso)}
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
            {dayTasks.map((en) => { const t = en.t; return (
              <li key={t.id} className="border-b border-line last:border-b-0">
                <button type="button" className={`flex min-h-11 w-full items-center gap-2 px-1 text-left ${t.id === selectedId ? 'bg-accent-soft' : 'hover:bg-bg'}`}
                  onClick={() => onOpen(t.id)}>
                  <span className="w-24 shrink-0 text-sm text-muted">{whenOnDay(en, day)}</span>
                  <span className={`min-w-0 flex-1 truncate ${t.status === 'done' ? 'text-muted line-through' : isOverdue(t) ? 'task-overdue' : ''}`}>{t.title}</span>
                  <span className="hidden truncate text-sm text-muted sm:inline">{t.assignee_id ? nameOf.get(t.assignee_id) ?? '' : ''}</span>
                  <span className={`task-pill task-pill-${t.status} shrink-0`}>{labelOf(TASK_STATUSES, t.status)}</span>
                </button>
              </li>
            ); })}
          </ul>
        ) : <p className="hint">Nothing on this day. Add a task above to put it here.</p>}
        {undated > 0 && (
          <p className="hint">{undated === 1 ? '1 task has' : `${undated} tasks have`} no start or due date, so {undated === 1 ? "it isn't" : "they aren't"} on the calendar. Give {undated === 1 ? 'it' : 'them'} one in the task form or the table.</p>
        )}
      </div>
    </div>
  );
}
