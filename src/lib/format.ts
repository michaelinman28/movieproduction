import type { Profile, ProjectStatus, Role, TaskPriority, TaskStatus } from './database.types';

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
