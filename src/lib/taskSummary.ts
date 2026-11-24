/**
 * A plain-text summary of chosen tasks, to send from the person's own email app
 * (mailto:) or copy and paste into an email, chat or text. No email server needed,
 * the same way invites work (src/lib/invite.ts).
 */
import type { Location, Task } from './api';
import { TASK_PRIORITIES, TASK_STATUSES, dueWhen, isOverdue, labelOf } from './format';

export interface SummaryContext {
  projectName: string;
  projectId: string;
  /** Names and emails by person id. */
  people: Map<string, { name: string; email: string | null }>;
  categories: Map<string, string>;
  tags: Map<string, string>;
  locations: Location[];
  /** Every task in the project, to place sub-tasks under their parents. */
  all: Task[];
}

/** 'YYYY-MM-DD' to e.g. 'Fri, Nov 20, 2026'. */
function longDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function taskLines(t: Task, ctx: SummaryContext, indent: string): string[] {
  const out: string[] = [];
  const add = (label: string, value: string | null | undefined) => { if (value) out.push(`${indent}${label}: ${value}`); };
  add('Status', `${labelOf(TASK_STATUSES, t.status)} · Priority: ${labelOf(TASK_PRIORITIES, t.priority)}`);
  add('Assigned to', t.assignee_id ? ctx.people.get(t.assignee_id)?.name ?? 'Someone no longer on the project' : 'Nobody yet');
  if (t.due_date) add('Due', `${longDate(t.due_date)}${dueWhen(t) ? `, ${dueWhen(t)}` : ''}${isOverdue(t) ? ' (overdue)' : ''}`);
  const loc = t.location_id ? ctx.locations.find((l) => l.id === t.location_id) : null;
  if (loc) add('Location', loc.address ? `${loc.name}, ${loc.address}` : loc.name);
  add('Category', t.category_id ? ctx.categories.get(t.category_id) : null);
  add('Tags', t.tag_ids.map((id) => ctx.tags.get(id)).filter(Boolean).join(', '));
  const kids = ctx.all.filter((k) => k.parent_id === t.id);
  if (kids.length) add('Sub-tasks', `${kids.filter((k) => k.status === 'done').length} of ${kids.length} done`);
  if (t.description?.trim()) {
    const [first, ...rest] = t.description.trim().split('\n');
    out.push(`${indent}Details: ${first}`, ...rest.map((l) => `${indent}  ${l}`));
  }
  return out;
}

/**
 * The chosen tasks in the order given (tree order), numbered. A chosen sub-task whose
 * parent is also chosen is listed under it (1.1, 1.2…).
 */
export function summaryText(chosen: Task[], ctx: SummaryContext): { subject: string; body: string } {
  const ids = new Set(chosen.map((t) => t.id));
  const top = chosen.filter((t) => !t.parent_id || !ids.has(t.parent_id));
  const lines: string[] = [];
  const write = (t: Task, num: string, depth: number) => {
    const indent = '   '.repeat(depth + 1);
    lines.push(`${'   '.repeat(depth)}${num}. ${t.title}`, ...taskLines(t, ctx, indent), '');
    chosen.filter((k) => k.parent_id === t.id).forEach((k, i) => write(k, `${num}.${i + 1}`, depth + 1));
  };
  top.forEach((t, i) => write(t, String(i + 1), 0));
  const count = `${chosen.length} task${chosen.length === 1 ? '' : 's'}`;
  const subject = chosen.length === 1 ? `${ctx.projectName}: ${chosen[0].title}` : `${ctx.projectName}: ${count}`;
  const link = `${window.location.origin}${import.meta.env.BASE_URL}projects/${ctx.projectId}/tasks`;
  const body = [`${ctx.projectName}: ${count}`, '', ...lines, `See them in Movie Production: ${link}`].join('\n');
  return { subject, body };
}

/** Emails of the people the chosen tasks are assigned to. */
export function assigneeEmails(chosen: Task[], ctx: SummaryContext): string[] {
  const out = new Set<string>();
  for (const t of chosen) { const e = t.assignee_id ? ctx.people.get(t.assignee_id)?.email : null; if (e) out.add(e); }
  return [...out];
}

export function summaryMailto(s: { subject: string; body: string }, to: string[] = []): string {
  return `mailto:${to.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(s.subject)}&body=${encodeURIComponent(s.body)}`;
}

/** Copy the summary to paste anywhere. Returns false if the browser refused. */
export async function copySummary(s: { subject: string; body: string }): Promise<boolean> {
  try { await navigator.clipboard.writeText(s.body); return true; } catch { return false; }
}
