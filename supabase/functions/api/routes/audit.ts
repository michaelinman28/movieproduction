import { createRoute, z } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { authed, fail, must } from '../context.ts';
import { AuditCleanupInput, AuditCleanupResult, AuditEntry, AuditItemQuery, AuditPage, AuditQuery, IdParam } from '../schemas.ts';
import { body, errors, ok, router, secured, send } from './common.ts';

// The audit trail (Activity). The database writes every entry itself; this only reads
// them for company admins, in plain words, and offers the temporary clean-up tool.
export const audit = router();
const tags = ['Activity'];

// deno-lint-ignore no-explicit-any
type Row = any;
// deno-lint-ignore no-explicit-any
type Db = any;
type Entry = z.infer<typeof AuditEntry>;

// ---- Turning stored rows into readable changes -------------------------------------

/** Fields that aren't worth showing: ids, stamps and things the entry already says. */
const HIDDEN = new Set(['id', 'created_at', 'updated_at', 'project_id', 'company_id', 'note_at', 'note_by', 'task_id', 'entry_id',
  'shoot_day_id', 'link_token', 'share_token', 'share_phones', 'viewed_version', 'viewed_at', 'shared_at', 'joined_at']);
const HIDDEN_ON_ADD = new Set(['created_by', 'author_id', 'sort_order', 'version', 'has_account', 'confirmed_version']);

/** Fields holding the id of another item, and where to find its name. */
const REFS: Record<string, string> = {
  assignee_id: 'profiles', user_id: 'profiles', author_id: 'profiles', created_by: 'profiles', sent_by: 'profiles',
  location_id: 'project_locations', category_id: 'task_categories', scene_id: 'scenes', parent_id: 'tasks',
  role_id: 'roles', tag_id: 'task_tags',
  actor_id: 'profiles', stand_in_id: 'profiles', double_id: 'profiles', character_id: 'characters', type_id: 'team_note_types',
};
const ENUMS = new Set(['status', 'priority', 'due_part', 'start_part', 'int_ext', 'time_of_day', 'kind', 'visibility', 'casting_status']);
const TIMES = new Set(['crew_call', 'shooting_call', 'lunch', 'wrap', 'sunrise', 'sunset']);

const typeOf = (field: string): 'text' | 'date' | 'time' | 'datetime' =>
  field.endsWith('_at') ? 'datetime' : field.endsWith('_date') ? 'date' : field.endsWith('_time') || TIMES.has(field) ? 'time' : 'text';

const pretty = (v: string) => (v ? v[0].toUpperCase() + v.slice(1).replace(/_/g, ' ') : v);
const personName = (p: Row) => p?.nickname || p?.full_name || p?.email || null;
const dayLabel = (d: Row) => {
  const date = new Date(`${String(d.shoot_date).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  return d.title ? `${date}: ${d.title}` : date;
};

/** How to name items of each kind from their live rows. */
const NAMERS: Record<string, { cols: string; name: (r: Row) => string | null }> = {
  profiles: { cols: 'id, full_name, nickname, email', name: personName },
  project_locations: { cols: 'id, name', name: (r) => r.name },
  task_categories: { cols: 'id, name', name: (r) => r.name },
  task_tags: { cols: 'id, name', name: (r) => r.name },
  roles: { cols: 'id, name', name: (r) => r.name },
  tasks: { cols: 'id, title', name: (r) => r.title },
  scenes: { cols: 'id, number, set_name', name: (r) => `Scene ${r.number}${r.set_name ? `: ${r.set_name}` : ''}` },
  shoot_days: { cols: 'id, shoot_date, title', name: dayLabel },
  characters: { cols: 'id, name', name: (r) => r.name },
  team_note_types: { cols: 'id, name', name: (r) => r.name },
  projects: { cols: 'id, name', name: (r) => r.name },
  companies: { cols: 'id, name', name: (r) => r.name },
};

const isUuid = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s);

/** Names for ids of one kind: from the live rows, else from the item's last log entry
 * (so deleted things still read by name). The second map says which ids still exist. */
async function namesFor(db: Db, table: string, ids: string[]) {
  const names = new Map<string, string | null>();
  const live = new Set<string>();
  const want = [...new Set(ids.filter(isUuid))];
  if (!want.length) return { names, live };
  const namer = NAMERS[table];
  if (namer) {
    const rows = must<Row[]>(await db.from(table).select(namer.cols).in('id', want));
    for (const r of rows) { names.set(r.id, namer.name(r)); live.add(r.id); }
  }
  const missing = want.filter((id) => !names.has(id));
  if (missing.length) {
    const rows = must<Row[]>(await db.from('audit_log').select('row_key, item_label, id').eq('table_name', table).in('row_key', missing).order('id', { ascending: false }));
    for (const r of rows) if (!names.has(r.row_key) && r.item_label) names.set(r.row_key, r.item_label);
  }
  return { names, live };
}

/** Where an entry links to: the item itself, or what it belongs to (a note's task, a shot's scene). */
function target(r: Row): [string, string] | null {
  if (r.parent_table && ['tasks', 'scenes', 'shoot_days', 'characters'].includes(r.parent_table)) return [r.parent_table, r.parent_key];
  if (['company_members', 'project_members', 'company_member_roles', 'project_member_roles', 'person_contacts', 'shoot_day_calls', 'team_notes'].includes(r.table_name) || r.table_name === 'profiles') {
    return r.subject_user_id ? ['profiles', r.subject_user_id] : null;
  }
  if (NAMERS[r.table_name]) return [r.table_name, r.row_key];
  return null;
}

export async function present(db: Db, rows: Row[]): Promise<Entry[]> {
  // Gather every id we need a name for, by kind.
  const need = new Map<string, string[]>();
  const add = (table: string, id: unknown) => { if (isUuid(id)) need.set(table, [...(need.get(table) ?? []), id]); };
  for (const r of rows) {
    if (r.private) continue;
    for (const side of [r.before, r.after]) {
      if (!side) continue;
      for (const [f, v] of Object.entries(side)) if (REFS[f]) add(REFS[f], v);
    }
  }
  for (const r of rows) {
    if (r.project_id) add('projects', r.project_id);
    if (r.parent_table && NAMERS[r.parent_table]) add(r.parent_table, r.parent_key);
    const t = target(r);
    if (t) add(t[0], t[1]);
  }
  const looked = new Map(await Promise.all([...need].map(async ([t, ids]) => [t, await namesFor(db, t, ids)] as const)));
  const nameOf = (t: string, id: string) => looked.get(t)?.names.get(id) ?? null;

  const show = (field: string, v: unknown): string | null => {
    if (v === null || v === undefined || v === '') return null;
    if (REFS[field] && isUuid(v)) return nameOf(REFS[field], v) ?? '(removed)';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    if (ENUMS.has(field) && typeof v === 'string') return pretty(v);
    return String(v);
  };

  return rows.map((r) => {
    const changes: Entry['changes'] = [];
    if (!r.private && (r.before || r.after) && r.action !== 'cleanup') {
      const fields = r.action === 'update' ? (r.changed ?? []) : Object.keys(r.after ?? r.before ?? {});
      for (const f of fields) {
        if (HIDDEN.has(f) || (r.action !== 'update' && HIDDEN_ON_ADD.has(f))) continue;
        // On an add or delete, skip the link to what the entry is already about (a shot's scene, a member's person).
        const v = (r.after ?? r.before)?.[f];
        if (r.action !== 'update' && REFS[f] && (v === r.parent_key || v === r.subject_user_id)) continue;
        const before = r.action === 'insert' ? null : show(f, r.before?.[f]);
        const after = r.action === 'delete' ? null : show(f, r.after?.[f]);
        if (r.action !== 'update' && before === null && after === null) continue;
        changes.push({ field: f, before, after, type: REFS[f] ? 'text' : typeOf(f) });
      }
    } else if (r.private && r.action === 'update') {
      // Only which fields changed, never the values.
      for (const f of r.changed ?? []) if (!HIDDEN.has(f) && !['title', 'body'].includes(f)) changes.push({ field: f, before: null, after: null, type: 'text' });
    }
    const t = target(r);
    return {
      id: Number(r.id), at: r.at, action: r.action, source: r.source,
      kind: r.table_name, item_id: r.row_key, item_label: r.item_label,
      parent_kind: r.parent_table, parent_id: r.parent_key,
      parent_label: r.private ? null : r.parent_table ? nameOf(r.parent_table, r.parent_key) : null,
      company_id: r.company_id, project_id: r.project_id,
      project_name: r.project_id ? nameOf('projects', r.project_id) : null,
      actor: { id: r.actor_id, name: r.actor_id ? r.actor_name : r.source === 'system' ? 'System' : r.actor_name },
      subject_id: r.subject_user_id, private: r.private, detail: r.detail,
      item_exists: t ? looked.get(t[0])?.live.has(t[1]) ?? false : false,
      changes,
    };
  });
}

// ---- Who may read --------------------------------------------------------------------

async function mustBeAdmin(db: Db, userId: string, companyId: string) {
  const rows = must<Row[]>(await db.from('company_members').select('is_admin').eq('company_id', companyId).eq('user_id', userId));
  if (!rows[0]?.is_admin) throw new HTTPException(403, { message: 'Only company admins can see the activity log.' });
}

const toTime = (s: string | undefined, name: string) => {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new HTTPException(400, { message: `${name}: use a date like 2026-11-25` });
  return d.toISOString();
};

// deno-lint-ignore no-explicit-any
function filtered(q: any, f: z.infer<typeof AuditQuery>) {
  if (f.kind) q = q.eq('table_name', f.kind);
  if (f.action) q = q.eq('action', f.action);
  if (f.person_id) q = q.eq('actor_id', f.person_id);
  const from = toTime(f.from, 'from'); if (from) q = q.gte('at', from);
  const to = toTime(f.to, 'to'); if (to) q = q.lt('at', to);
  if (f.before) q = q.lt('id', f.before);
  return q.order('id', { ascending: false }).limit(f.limit + 1);
}

async function page(db: Db, rows: Row[], limit: number) {
  const more = rows.length > limit;
  const kept = rows.slice(0, limit);
  return { entries: await present(db, kept), next_before: more ? Number(kept[kept.length - 1].id) : null };
}

/** People in the company, for the entries about a person that aren't tied to a company (profile changes, sign-ins). */
async function memberIds(db: Db, companyId: string) {
  return must<Row[]>(await db.from('company_members').select('user_id').eq('company_id', companyId)).map((m) => m.user_id as string);
}

// ---- Routes ---------------------------------------------------------------------------

audit.openapi(createRoute({
  method: 'get', path: '/companies/{id}/activity', tags, security: secured,
  summary: 'The company\'s activity log, newest first (company admins only)',
  description: 'Every add, change and delete in the company and its projects, plus sign-ins and call sheet views by its people. '
    + 'Private journal entries show only that something happened, never their content. Pages of up to `limit` entries: pass `next_before` as `before` for the next one.',
  request: { params: IdParam, query: AuditQuery },
  responses: { 200: ok(AuditPage), 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db, userId } = await authed(c);
  const { id } = c.req.valid('param');
  const f = c.req.valid('query');
  await mustBeAdmin(db, userId, id);
  let q = db.from('audit_log').select('*');
  if (f.project_id) q = q.eq('project_id', f.project_id);
  else {
    const people = await memberIds(db, id);
    q = people.length ? q.or(`company_id.eq.${id},and(company_id.is.null,subject_user_id.in.(${people.join(',')}))`) : q.eq('company_id', id);
  }
  return send(c, await page(db, must<Row[]>(await filtered(q, f)), f.limit), 200);
});

audit.openapi(createRoute({
  method: 'get', path: '/projects/{id}/activity', tags, security: secured,
  summary: 'A project\'s activity log, newest first (company admins only)',
  description: 'Like the company log, for one project. It stays after the project is deleted.',
  request: { params: IdParam, query: AuditQuery.omit({ project_id: true }) },
  responses: { 200: ok(AuditPage), 401: errors[401], 403: errors[403], 404: errors[404] },
}), async (c) => {
  const { db, userId } = await authed(c);
  const { id } = c.req.valid('param');
  const f = c.req.valid('query');
  const proj = must<Row[]>(await db.from('projects').select('company_id').eq('id', id))[0];
  if (!proj) throw new HTTPException(404, { message: 'Not found, or you do not have access to it.' });
  await mustBeAdmin(db, userId, proj.company_id);
  return send(c, await page(db, must<Row[]>(await filtered(db.from('audit_log').select('*').eq('project_id', id), f)), f.limit), 200);
});

audit.openapi(createRoute({
  method: 'get', path: '/activity/item', tags, security: secured,
  summary: 'The history of one item, newest first (company admins only)',
  description: 'Everything logged about the item, and about what belongs to it (a task\'s notes and tags, a scene\'s shots and notes, a shoot day\'s schedule and calls). '
    + 'For `kind=person`, `id` is the person\'s id: their membership, roles, profile, contacts, calls and sign-ins.',
  request: { query: AuditItemQuery },
  responses: { 200: ok(z.array(AuditEntry)), 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db, userId } = await authed(c);
  const { kind, id, company_id } = c.req.valid('query');
  await mustBeAdmin(db, userId, company_id);
  if (!/^[0-9a-f:-]+$/i.test(id) || !/^[a-z_]+$/.test(kind)) throw new HTTPException(400, { message: 'Unknown item' });
  let q = db.from('audit_log').select('*');
  q = kind === 'person'
    ? q.eq('subject_user_id', id).or(`company_id.eq.${company_id},company_id.is.null`)
    : q.eq('company_id', company_id).or(`and(table_name.eq.${kind},row_key.eq.${id}),and(parent_table.eq.${kind},parent_key.eq.${id})`);
  const rows = must<Row[]>(await q.order('id', { ascending: false }).limit(500));
  return send(c, await present(db, rows), 200);
});

audit.openapi(createRoute({
  method: 'post', path: '/companies/{id}/activity/cleanup', tags, security: secured,
  summary: 'Remove activity log entries (company admins only, temporary)',
  description: 'Removes the company\'s entries that match every filter given (none = all of them); with no project, the company\'s people\'s sign-ins and profile changes too. '
    + 'Each clean-up adds its own entry saying who removed how many, and those are never removed. This tool will be switched off once the log is in real use.',
  request: { params: IdParam, ...body(AuditCleanupInput) },
  responses: { 200: ok(AuditCleanupResult), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const b = c.req.valid('json');
  const r = await db.rpc('audit_cleanup', {
    company: c.req.valid('param').id, project: b.project_id ?? null, kind: b.kind ?? null, item: b.item_id ?? null,
    from_at: toTime(b.from ?? undefined, 'from'), to_at: toTime(b.to ?? undefined, 'to'),
  });
  if (r.error) fail(r.error);
  return send(c, { removed: r.data as number }, 200);
});

audit.openapi(createRoute({
  method: 'post', path: '/shoot-days/{id}/opened', tags: ['Call sheets'], security: secured,
  summary: 'Log that you opened a shoot day\'s call sheet page',
  description: 'Every opening is logged in the activity log (unlike /viewed, which records the first view of each sent version).',
  request: { params: IdParam },
  responses: { 204: { description: 'Logged' }, 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const r = await db.rpc('log_call_sheet_view', { day: c.req.valid('param').id });
  if (r.error) fail(r.error);
  return c.body(null, 204);
});
