// Plain words for the activity log (audit trail): what kind of item, what was done,
// which fields changed, and where each entry links to.
import type { AuditAction, AuditChange, AuditEntry } from './api';
import { itemPath } from './links';
import { shortDate, timeLabel } from './format';

export const KIND_LABELS: Record<string, string> = {
  companies: 'Company', company_members: 'Company member', company_member_roles: 'Company role',
  projects: 'Project', project_members: 'Project team', project_member_roles: 'Project role',
  roles: 'Role', profiles: 'Person', person_contacts: 'Extra contact',
  tasks: 'Task', task_notes: 'Task note', task_categories: 'Task category', task_tags: 'Task tag', task_tag_links: 'Tag on a task',
  project_locations: 'Location', scenes: 'Scene', scene_notes: 'Scene note', shots: 'Shot',
  shoot_days: 'Shoot day', shoot_day_items: 'Day schedule', shoot_day_calls: 'Call',
  journal_entries: 'Journal entry', journal_entry_shares: 'Journal share', audit_log: 'Activity log',
};
export const kindLabel = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, ' ');

export const ACTION_LABELS: Record<AuditAction, string> = {
  insert: 'Added', update: 'Changed', delete: 'Deleted', view: 'Viewed', sign_in: 'Signed in', cleanup: 'Cleaned up',
};

const FIELD_LABELS: Record<string, string> = {
  assignee_id: 'Assigned to', parent_id: 'Sub-task of', user_id: 'Person', author_id: 'Written by', created_by: 'Added by',
  sent_by: 'Sent by', is_admin: 'Admin', int_ext: 'Int/Ext', pages_eighths: 'Pages (eighths)', est_minutes: 'Minutes',
  due_part: 'Due part of day', start_part: 'Start part of day', at_time: 'Time', sort_order: 'Order', full_name: 'Name',
  confirmed_version: 'Confirmed version', confirmed_at: 'Confirmed', sent_at: 'Sent', version: 'Version', body: 'Text',
};
export function fieldLabel(f: string) {
  if (FIELD_LABELS[f]) return FIELD_LABELS[f];
  const s = f.replace(/_id$/, '').replace(/_/g, ' ');
  return s[0].toUpperCase() + s.slice(1);
}

const pad = (n: number) => String(n).padStart(2, '0');
/** A sortable local time, 'YYYY-MM-DD HH:mm:ss'. */
export const sortableTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
/** e.g. 'Nov 25, 4:30 PM', with the year only when it isn't this year. */
export const friendlyTime = (iso: string) => {
  const d = new Date(iso);
  const year = d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' as const } : {};
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', ...year, hour: 'numeric', minute: '2-digit' });
};

function value(c: AuditChange, v: string | null) {
  if (v === null) return '—';
  if (c.type === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `${shortDate(v)}, ${v.slice(0, 4)}`;
  if (c.type === 'time' && /^\d{2}:\d{2}/.test(v)) return timeLabel(v);
  if (c.type === 'datetime' && !Number.isNaN(Date.parse(v))) return friendlyTime(v);
  return v.length > 200 ? `${v.slice(0, 200)}…` : v;
}

/** One change in words: "Due date: Fri, Dec 7, 2026 → Sat, Dec 8, 2026". */
export function changeText(e: AuditEntry, c: AuditChange) {
  if (e.private) return fieldLabel(c.field);
  if (e.action === 'insert') return `${fieldLabel(c.field)}: ${value(c, c.after)}`;
  if (e.action === 'delete') return `${fieldLabel(c.field)}: ${value(c, c.before)}`;
  return `${fieldLabel(c.field)}: ${value(c, c.before)} → ${value(c, c.after)}`;
}

/** Everything the entry says beyond who, what and when. */
export function changesText(e: AuditEntry) {
  if (e.private) {
    const what = e.kind === 'journal_entry_shares' ? 'A private journal entry was shared or unshared' : `A private journal entry was ${ACTION_LABELS[e.action].toLowerCase()}`;
    return e.changes.length ? `${what} (${e.changes.map((c) => fieldLabel(c.field)).join(', ')})` : what;
  }
  const parts = e.changes.map((c) => changeText(e, c));
  if (e.action === 'sign_in' && e.detail) parts.push(`Device: ${e.detail}`);
  else if (e.detail) parts.push(e.detail);
  if (e.source === 'link') parts.push('From their personal call sheet link');
  return parts.join('; ');
}

/** The item's name, with what it belongs to (a note's task, a shot's scene). */
export function itemText(e: AuditEntry) {
  const own = e.item_label ?? kindLabel(e.kind);
  return e.parent_label && !e.private && e.parent_kind !== 'profiles' ? `${own} (${e.parent_label})` : own;
}

/** One line for an item's History: "Bea changed", or "Bea added task note: Call Joe" for what's on the item. */
export function sentence(e: AuditEntry, own: boolean) {
  const who = e.actor.name ?? 'Someone';
  if (e.action === 'view') return `${who} opened the call sheet`;
  if (e.action === 'sign_in') return `${who} signed in`;
  const did = ACTION_LABELS[e.action].toLowerCase();
  if (own) return `${who} ${did} ${kindLabel(e.kind).toLowerCase()}`;
  return `${who} ${did} ${kindLabel(e.kind).toLowerCase()}${e.item_label && !e.private ? `: ${e.item_label}` : ''}`;
}

/** Where the entry's item lives, if it still exists. */
export function entryLink(e: AuditEntry, companyId: string): { to: string; title: string } | null {
  if (!e.item_exists || e.private) return null;
  const pid = e.project_id ?? '';
  const pk = e.parent_kind && ['tasks', 'scenes', 'shoot_days'].includes(e.parent_kind) ? e.parent_kind : null;
  const kind = pk ?? e.kind;
  const id = pk ? e.parent_id ?? '' : e.item_id;
  const person = e.subject_id && ['company_members', 'project_members', 'company_member_roles', 'project_member_roles', 'person_contacts', 'shoot_day_calls', 'profiles'].includes(e.kind);
  if (person && !pk) return { to: itemPath.person(companyId, e.subject_id!), title: 'Open this person on the People list' };
  switch (kind) {
    case 'tasks': return { to: itemPath.task(pid, id), title: 'Open the task' };
    case 'scenes': return { to: itemPath.scene(pid, id), title: 'Open the scene' };
    case 'shoot_days': return e.action === 'view' ? { to: itemPath.callSheet(pid, id), title: 'Open the call sheet' } : { to: itemPath.shootDay(pid, id), title: 'Open the shoot day' };
    case 'project_locations': return { to: itemPath.location(pid, id), title: 'Open the location' };
    case 'task_categories': case 'task_tags': return { to: itemPath.taskSetting(companyId, id), title: 'Open in task settings' };
    case 'roles': return { to: `/companies/${companyId}/roles`, title: 'Open the roles page' };
    case 'projects': return { to: `/projects/${id}`, title: 'Open the project' };
    case 'companies': return { to: `/companies/${id}`, title: 'Open the company' };
    default: return null;
  }
}
