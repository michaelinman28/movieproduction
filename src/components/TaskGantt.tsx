import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Task } from '../lib/api';
import { TASK_STATUSES, dueWhen, isOverdue, labelOf, startWhen } from '../lib/format';
import { addDays, daysBetween, isoDate, parseIso, spanOf } from './TaskCalendar';

/** Width of one day, in pixels. */
const DAY = 32;
/** Days shown before the earliest task and after the latest one (and around today). */
const LEAD = 7, TRAIL = 21;
/** Longest stretch drawn, so a typo (a date years away) can't make a chart miles wide. */
const MAX_DAYS = 730;
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export interface GanttRow { task: Task; depth: number; kids: number }

/**
 * A Gantt chart of a project's tasks: months and days across the top, task names down
 * the left (in sub-task tree order, with sub-tasks indented and foldable), and on each
 * task's row a bar from its start to its due date, or a marker on its one day. It
 * scrolls sideways like the task table; on phones the names scroll with it, as in the
 * tables. Click a task (name or bar) to open its form; click a day to choose it (new
 * tasks are added on it). On a computer, drag a bar sideways to move the task by whole
 * days (saved at once, like a table cell).
 */
export function TaskGantt({ rows, selectedId, day, onDay, onOpen, onMove, nameOf }: {
  rows: GanttRow[];
  selectedId: string | null;
  day: string;
  onDay: (day: string) => boolean;
  onOpen: (id: string) => void;
  onMove: (id: string, to: { due_date?: string; start_date?: string }) => void;
  nameOf: Map<string, string>;
}) {
  const today = isoDate(new Date());
  const scroller = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<{ id: string; days: number } | null>(null);
  const dragStart = useRef<{ id: string; x: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);

  // The days shown: from a week before the earliest task (or today) to three weeks
  // after the latest one.
  const { first, count } = useMemo(() => {
    let lo = today, hi = today;
    for (const r of rows) {
      const sp = spanOf(r.task);
      if (!sp) continue;
      if (sp.first < lo) lo = sp.first;
      if (sp.last > hi) hi = sp.last;
    }
    const start = addDays(lo, -LEAD);
    return { first: start, count: Math.min(daysBetween(start, addDays(hi, TRAIL)) + 1, MAX_DAYS) };
  }, [rows, today]);
  const days = useMemo(() => Array.from({ length: count }, (_, i) => addDays(first, i)), [first, count]);
  const indexOf = (iso: string) => daysBetween(first, iso);
  const width = count * DAY;

  // Months across the top, each as wide as its days.
  const months = useMemo(() => {
    const out: { key: string; label: string; days: number }[] = [];
    for (const d of days) {
      const key = d.slice(0, 7);
      if (out[out.length - 1]?.key === key) out[out.length - 1].days++;
      else out.push({ key, label: parseIso(d).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }), days: 1 });
    }
    return out;
  }, [days]);

  // Rows under a folded parent are hidden.
  const shown = useMemo(() => {
    const out: GanttRow[] = [];
    let hideBelow: number | null = null;
    for (const r of rows) {
      if (hideBelow !== null && r.depth > hideBelow) continue;
      hideBelow = folded.has(r.task.id) ? r.depth : null;
      out.push(r);
    }
    return out;
  }, [rows, folded]);

  function scrollToDay(iso: string, smooth = false) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, indexOf(iso) * DAY - 3 * DAY), behavior: smooth ? 'smooth' : 'auto' });
  }
  // Start at today.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => scrollToDay(today), []);
  function goToday() { if (onDay(today)) scrollToDay(today, true); }

  const fold = (id: string) => setFolded((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Dragging a bar (mouse only: on touch screens a swipe scrolls the chart).
  function down(e: ReactPointerEvent, id: string) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = { id, x: e.clientX, moved: false };
  }
  function move(e: ReactPointerEvent) {
    const s = dragStart.current;
    if (!s) return;
    const n = Math.round((e.clientX - s.x) / DAY);
    if (Math.abs(e.clientX - s.x) > 4) s.moved = true;
    if (s.moved) setDrag({ id: s.id, days: n });
  }
  function up(t: Task) {
    const s = dragStart.current;
    dragStart.current = null;
    if (!s?.moved) return;
    skipClick.current = true;
    const n = drag?.days ?? 0;
    setDrag(null);
    if (!n) return;
    onMove(t.id, {
      ...(t.due_date ? { due_date: addDays(t.due_date, n) } : {}),
      ...(t.start_date ? { start_date: addDays(t.start_date, n) } : {}),
    });
  }
  function open(id: string) {
    if (skipClick.current) { skipClick.current = false; return; }
    onOpen(id);
  }

  // Day lines, with weekends shaded.
  const satOffset = ((6 - parseIso(first).getDay() + 7) % 7) * DAY;
  const lanes = {
    backgroundImage: `linear-gradient(90deg, var(--color-line) 0 1px, transparent 1px), linear-gradient(90deg, var(--color-bg) 0 ${2 * DAY}px, transparent ${2 * DAY}px)`,
    backgroundSize: `${DAY}px 100%, ${7 * DAY}px 100%`,
    backgroundPosition: `0 0, ${satOffset}px 0`,
    width,
  };
  const todayAt = indexOf(today);
  const dayAt = indexOf(day);
  // Names stay in view while scrolling on wider screens; on phones they scroll with the
  // chart, like the first column of the tables.
  const nameCell = 'w-40 shrink-0 border-r border-line bg-surface sm:sticky sm:left-0 sm:z-[1] sm:w-64';

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-secondary w-auto shrink-0" onClick={goToday}>Today</button>
        <p className="hint m-0">Scroll sideways to see other days. {rows.length > 0 && 'On a computer, drag a bar to move a task.'}</p>
      </div>
      <div ref={scroller} className="overflow-x-auto rounded-md border border-line bg-surface" role="grid" aria-label="Tasks over time">
        <div className="min-w-max">
          {/* Months */}
          <div className="flex border-b border-line text-sm font-semibold">
            <div className={nameCell} />
            <div className="flex" style={{ width }}>
              {months.map((m) => (
                <div key={m.key} className="border-l border-line py-1 first:border-l-0" style={{ width: m.days * DAY }}>
                  {/* The month's name stays in view while its days are on screen. */}
                  <span className="sticky left-0 inline-block whitespace-nowrap px-2 sm:left-64">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Days */}
          <div className="flex border-b border-line text-xs" role="row">
            <div className={`${nameCell} flex items-end px-2 pb-1 font-semibold`} role="columnheader">Task</div>
            <div className="flex" style={{ width }}>
              {days.map((d) => {
                const date = parseIso(d);
                const weekend = date.getDay() === 0 || date.getDay() === 6;
                return (
                  <button key={d} type="button" role="columnheader" aria-label={date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    aria-pressed={d === day}
                    className={`flex h-11 shrink-0 flex-col items-center justify-center leading-tight ${weekend ? 'bg-bg text-muted' : ''} ${d === day ? 'outline-2 -outline-offset-2 outline-accent' : ''}`}
                    style={{ width: DAY }} onClick={() => onDay(d)}>
                    <span className="text-muted">{WEEKDAY[date.getDay()]}</span>
                    <span className={`rounded-full px-1 ${d === today ? 'bg-accent font-semibold text-accent-fg' : ''}`}>{date.getDate()}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Tasks */}
          {shown.map(({ task: t, depth, kids }) => {
            const sp = spanOf(t);
            const sel = t.id === selectedId;
            const shift = drag?.id === t.id ? drag.days * DAY : 0;
            const tone = t.status === 'done' ? 'bg-muted/50' : isOverdue(t) ? 'bg-danger' : 'bg-accent';
            const when = sp
              ? sp.first === sp.last
                ? `${parseIso(sp.first).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}${dueWhen(t) || startWhen(t) ? `, ${dueWhen(t) || startWhen(t)}` : ''}`
                : `${parseIso(sp.first).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} to ${parseIso(sp.last).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
              : '';
            const label = `${t.title}${when ? `: ${when}` : ''} (${labelOf(TASK_STATUSES, t.status)}${t.assignee_id && nameOf.get(t.assignee_id) ? `, ${nameOf.get(t.assignee_id)}` : ''})`;
            const a = sp ? indexOf(sp.first) : 0, b = sp ? indexOf(sp.last) : 0;
            return (
              <div key={t.id} role="row" className="flex border-b border-line last:border-b-0">
                <div className={`${nameCell} flex min-h-11 items-center ${sel ? 'bg-accent-soft' : ''}`} role="rowheader" style={{ paddingLeft: 4 + depth * 16 }}>
                  {kids > 0 ? (
                    <button type="button" className="flex h-11 w-7 shrink-0 items-center justify-center text-muted" aria-expanded={!folded.has(t.id)}
                      aria-label={`${folded.has(t.id) ? 'Show' : 'Hide'} sub-tasks of ${t.title}`} onClick={() => fold(t.id)}>
                      <span className={`section-chevron ${folded.has(t.id) ? '' : 'section-chevron-open'}`} aria-hidden="true">▸</span>
                    </button>
                  ) : <span className="w-7 shrink-0" />}
                  <button type="button" className={`min-h-11 min-w-0 flex-1 truncate pr-2 text-left text-sm ${t.status === 'done' ? 'text-muted line-through' : isOverdue(t) ? 'task-overdue' : ''} ${kids ? 'font-semibold' : ''}`}
                    title={label} onClick={() => open(t.id)}>
                    {t.title}{kids > 0 && <span className="font-normal text-muted"> ({kids})</span>}
                  </button>
                </div>
                <div className="relative shrink-0" style={lanes}>
                  {todayAt >= 0 && todayAt < count && <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent/60" style={{ left: todayAt * DAY + DAY / 2 - 1 }} aria-hidden="true" />}
                  {dayAt >= 0 && dayAt < count && day !== today && <div className="pointer-events-none absolute inset-y-0 bg-accent/10" style={{ left: dayAt * DAY, width: DAY }} aria-hidden="true" />}
                  {!sp ? (
                    <span className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-xs text-muted" style={{ left: Math.max(0, todayAt) * DAY + 4 }}>No start or due date</span>
                  ) : a === b ? (
                    // One day: a diamond on that day.
                    <button type="button" aria-label={label} title={label}
                      className={`absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center ${drag?.id === t.id ? 'cursor-grabbing' : 'cursor-grab'}`}
                      style={{ left: a * DAY + shift }}
                      onPointerDown={(e) => down(e, t.id)} onPointerMove={move} onPointerUp={() => up(t)} onPointerCancel={() => { dragStart.current = null; setDrag(null); }}
                      onClick={() => open(t.id)}>
                      <span className={`block h-3.5 w-3.5 rotate-45 rounded-sm ${tone} ${sel ? 'ring-2 ring-fg' : ''}`} />
                      {/* Phones: the name scrolls away, so it's written beside the marker. */}
                      <span className="pointer-events-none absolute left-8 whitespace-nowrap text-xs sm:hidden" aria-hidden="true">{t.title}</span>
                    </button>
                  ) : (
                    // Several days: a bar from the start to the due date.
                    <button type="button" aria-label={label} title={label}
                      className={`absolute top-1/2 h-6 -translate-y-1/2 rounded text-left ${tone} ${sel ? 'ring-2 ring-fg' : ''} ${drag?.id === t.id ? 'cursor-grabbing opacity-80' : 'cursor-grab'}`}
                      style={{ left: a * DAY + 2 + shift, width: (b - a + 1) * DAY - 4 }}
                      onPointerDown={(e) => down(e, t.id)} onPointerMove={move} onPointerUp={() => up(t)} onPointerCancel={() => { dragStart.current = null; setDrag(null); }}
                      onClick={() => open(t.id)}>
                      <span className={`sticky left-0 inline-block max-w-full truncate px-2 text-left align-top text-xs font-medium leading-6 sm:left-64 ${t.status === 'done' ? 'text-fg' : 'text-accent-fg'}`} aria-hidden="true">{t.title}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {!rows.length && <p className="hint p-3">No tasks yet. Add one above.</p>}
        </div>
      </div>
    </div>
  );
}
