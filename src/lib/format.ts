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
