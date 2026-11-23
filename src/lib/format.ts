import type { Profile, ProjectStatus, Role } from './database.types';

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

export function sortRoles(roles: Role[]) {
  // Standard roles first in their set order, then custom roles by name.
  return [...roles].sort((a, b) =>
    a.company_id === b.company_id
      ? a.sort_order - b.sort_order || a.name.localeCompare(b.name)
      : a.company_id === null ? -1 : b.company_id === null ? 1 : 0,
  );
}

export const errorText = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : String(e);
