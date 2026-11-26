import type { DayPart, Profile, ProjectStatus, Role, Task, TaskPriority, TaskStatus } from './database.types';

export const PROJECT_STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'development', label: 'Development' },
  { value: 'pre_production', label: 'Pre-production' },
  { value: 'production', label: 'Production' },
  { value: 'post_production', label: 'Post-production' },
  { value: 'released', label: 'Released' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const statusLabel = (s: ProjectStatus) => PROJECT_STATUSES.find((x) => x.value === s)?.label ?? s;
export const statusValue = (label: string) =>
  PROJECT_STATUSES.find((x) => x.label === label || x.value === label)?.value;

export const displayName = (p: Pick<Profile, 'full_name' | 'email'> | undefined) =>
  p?.full_name?.trim() || p?.email || 'Unknown';

/** Role names for a set of role ids, in the roles' standard order. */
export function roleNames(ids: Set<string> | string[], roles: Role[]) {
  const set = ids instanceof Set ? ids : new Set(ids);
  return roles.filter((r) => set.has(r.id)).map((r) => r.name).join(', ');
}

/** Comma-separated role names (any case) to role ids, with the names that match no role. */
export function roleIdsFor(text: string, roles: Role[]) {
  const names = [...new Set(text.split(',').map((n) => n.trim()).filter(Boolean))];
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const n of names) {
    const r = roles.find((x) => x.name.toLowerCase() === n.toLowerCase());
    if (r) ids.push(r.id); else unknown.push(n);
  }
  return { ids, unknown };
}

export const errorText = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : String(e);

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export const labelOf = <T extends string>(list: { value: T; label: string }[], v: T) => list.find((x) => x.value === v)?.label ?? v;
export const valueOf = <T extends string>(list: { value: T; label: string }[], label: string) =>
  list.find((x) => x.label === label || x.value === label)?.value;

export const DAY_PARTS: { value: DayPart; label: string; ends: string }[] = [
  { value: 'morning', label: 'Morning', ends: '12:00' },
  { value: 'afternoon', label: 'Afternoon', ends: '17:00' },
  { value: 'evening', label: 'Evening', ends: '24:00' },
];

/** '14:30:00' -> '2:30 PM' */
export function timeLabel(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** When on its due date a task is due: 'Morning', '2:30 PM', or ''. */
export const dueWhen = (t: Pick<Task, 'due_part' | 'due_time'>) =>
  t.due_part ? labelOf(DAY_PARTS, t.due_part) : t.due_time ? timeLabel(t.due_time) : '';

/** When on its start date a task starts: 'Morning', '9:00 AM', or ''. */
export const startWhen = (t: Pick<Task, 'start_part' | 'start_time'>) =>
  t.start_part ? labelOf(DAY_PARTS, t.start_part) : t.start_time ? timeLabel(t.start_time) : '';

/** Every half hour of the day as 'HH:MM', for picking a due time. */
export const HALF_HOURS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** Local date and time now as 'YYYY-MM-DD' and 'HH:MM'. */
function localNow() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** A task is overdue once its due date, and its part of the day or time, has passed. */
export function isOverdue(t: Pick<Task, 'status' | 'due_date' | 'due_part' | 'due_time'>) {
  if (t.status === 'done' || !t.due_date) return false;
  const now = localNow();
  if (t.due_date !== now.date) return t.due_date < now.date;
  const deadline = t.due_part ? DAY_PARTS.find((p) => p.value === t.due_part)!.ends : t.due_time ? t.due_time.slice(0, 5) : '24:00';
  return now.time >= deadline;
}

export const LOCATION_STATUSES: { value: 'considering' | 'confirmed' | 'not_using'; label: string }[] = [
  { value: 'considering', label: 'Considering' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'not_using', label: 'Not using' },
];

// ---- Scenes and shots -------------------------------------------------------

export type SceneIntExt = 'int' | 'ext' | 'int_ext';
export type SceneTime = 'day' | 'night' | 'dawn' | 'dusk';
export type SceneStatus = 'not_scheduled' | 'scheduled' | 'shot';

export const SCENE_INT_EXT: { value: SceneIntExt; label: string }[] = [
  { value: 'int', label: 'INT' },
  { value: 'ext', label: 'EXT' },
  { value: 'int_ext', label: 'INT/EXT' },
];
export const SCENE_TIMES: { value: SceneTime; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
  { value: 'dawn', label: 'Dawn' },
  { value: 'dusk', label: 'Dusk' },
];
export const SCENE_STATUSES: { value: SceneStatus; label: string }[] = [
  { value: 'not_scheduled', label: 'Not scheduled' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'shot', label: 'Shot' },
];

// ---- Characters ---------------------------------------------------------------

export type CharacterKind = 'lead' | 'supporting' | 'day_player' | 'background';
export type CastingStatus = 'open' | 'auditioning' | 'offered' | 'cast';

export const CHARACTER_KINDS: { value: CharacterKind; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'supporting', label: 'Supporting' },
  { value: 'day_player', label: 'Day player' },
  { value: 'background', label: 'Background' },
];
export const CASTING_STATUSES: { value: CastingStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'auditioning', label: 'Auditioning' },
  { value: 'offered', label: 'Offered' },
  { value: 'cast', label: 'Cast' },
];

/** An element is needed (still to find), sourced (found, not yet on hand) or ready (on hand for the shoot). */
export type ElementStatus = 'needed' | 'sourced' | 'ready';
export const ELEMENT_STATUSES: { value: ElementStatus; label: string }[] = [
  { value: 'needed', label: 'Needed' },
  { value: 'sourced', label: 'Sourced' },
  { value: 'ready', label: 'Ready' },
];

/**
 * Who someone plays on a call sheet: the character typed on their call, or else the
 * characters they're cast as on the Characters page, e.g. "Ellie (#1)".
 */
export function castLabel(c: { character_name: string | null; characters?: { name: string; cast_number: number | null }[] }) {
  if (c.character_name) return c.character_name;
  return (c.characters ?? []).map((ch) => (ch.cast_number != null ? `${ch.name} (#${ch.cast_number})` : ch.name)).join(', ');
}

/** Shown in a pick-list for "nothing picked". */
export const NONE = '—';

// Shot pick-lists. They're stored as text, so a company can add its own values later.
export const SHOT_SIZES = ['Extreme wide', 'Wide', 'Full', 'Medium wide', 'Medium', 'Medium close-up', 'Close-up', 'Extreme close-up', 'Insert', 'Over the shoulder', 'Two shot', 'POV'];
export const SHOT_ANGLES = ['Eye level', 'High', 'Low', 'Overhead', 'Ground level', 'Dutch'];
export const SHOT_MOVEMENTS = ['Static', 'Pan', 'Tilt', 'Push in', 'Pull out', 'Dolly', 'Tracking', 'Handheld', 'Steadicam', 'Crane', 'Drone', 'Zoom'];

/** A scene's length from eighths of a page: 11 -> '1 3/8', 3 -> '3/8', 16 -> '2'. */
export function pagesLabel(eighths: number | null | undefined) {
  if (eighths == null) return '';
  const whole = Math.floor(eighths / 8), part = eighths % 8;
  if (!part) return String(whole);
  return whole ? `${whole} ${part}/8` : `${part}/8`;
}

/** Pages as typed ('1 3/8', '3/8', '2', '1.5') to eighths; blank is null. Throws if it can't be read. */
export function parsePages(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const m = t.match(/^(\d+)?\s*(?:(\d)\s*\/\s*8)?$/);
  if (m && (m[1] || m[2]) && Number(m[2] ?? 0) < 8) return Number(m[1] ?? 0) * 8 + Number(m[2] ?? 0);
  if (/^\d*\.\d+$/.test(t)) return Math.round(Number(t) * 8);
  throw new Error('Write pages as whole pages and eighths, like 1 3/8, 3/8 or 2.');
}

/** 90 -> '1h 30m', 45 -> '45m', 0 or null -> ''. */
export function minutesLabel(m: number | null | undefined) {
  if (!m) return '';
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${r}m`;
}

// ---- Shoot days ---------------------------------------------------------------

/** A time as typed ('4pm', '4:30 PM', '16:30', '1630') to 'HH:MM'; blank is null. Throws if it can't be read. */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/\./g, '');
  if (!t) return null;
  const m = t.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2] ?? 0);
    const ap = m[3]?.[0];
    const ok = ap ? h >= 1 && h <= 12 : h < 24;
    if (ap) h = (h % 12) + (ap === 'p' ? 12 : 0);
    if (ok && min < 60) return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  throw new Error(`"${text.trim()}" isn't a time. Write it like 4:30 PM or 16:30.`);
}

/** A stored time for showing ('16:00:00' -> '4:00 PM'), or '' for none. */
export const clockLabel = (t: string | null | undefined) => (t ? timeLabel(t) : '');

/** 'HH:MM' from a stored time, for a time input. */
export const clockValue = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

/** '2027-03-12' -> 'Friday, March 12, 2027'. */
export function longDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

/** '2027-03-12' -> 'Fri, Mar 12'. */
export function shortDate(d: string) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export const SHOOT_ITEM_KINDS: { value: 'scene' | 'meal' | 'move' | 'note'; label: string }[] = [
  { value: 'scene', label: 'Scene' },
  { value: 'meal', label: 'Meal break' },
  { value: 'move', label: 'Company move' },
  { value: 'note', label: 'Note' },
];
