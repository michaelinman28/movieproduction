import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import { IdParam, TaskCategory, TaskCategoryInput, TaskCategoryUpdate, TaskTag, TaskTagInput } from '../schemas.ts';
import { body, errors, ok, router, secured, send } from './common.ts';

// Task categories (a list company admins set up) and task tags (free-form, made by
// anyone in the company while tagging a task).
export const labels = router();
const catTags = ['Task categories'];
const tagTags = ['Task tags'];

// deno-lint-ignore no-explicit-any
type Row = any;

/** Usage counts per category or tag id for a company. */
// deno-lint-ignore no-explicit-any
async function usage(db: any, companyId: string, kind: 'category' | 'tag') {
  const rows = must<{ kind: string; id: string; tasks: number }[]>(await db.rpc('task_label_usage', { cid: companyId }));
  return new Map(rows.filter((r) => r.kind === kind).map((r) => [r.id, Number(r.tasks)]));
}

// ---- Categories -------------------------------------------------------------

labels.openapi(createRoute({
  method: 'get', path: '/companies/{id}/task-categories', tags: catTags, security: secured,
  summary: 'The company\'s task categories, in order',
  request: { params: IdParam },
  responses: { 200: ok(z.array(TaskCategory)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const [rows, used] = await Promise.all([
    db.from('task_categories').select('*').eq('company_id', id).order('sort_order').order('name'),
    usage(db, id, 'category'),
  ]);
  return send(c, must<Row[]>(rows).map((r) => ({ ...r, tasks: used.get(r.id) ?? 0 })), 200);
});

labels.openapi(createRoute({
  method: 'post', path: '/companies/{id}/task-categories', tags: catTags, security: secured,
  summary: 'Add a task category (admins)',
  description: 'Without `sort_order` it goes at the end of the list.',
  request: { params: IdParam, ...body(TaskCategoryInput) },
  responses: { 201: ok(TaskCategory, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');
  let sort = input.sort_order;
  if (sort === undefined) {
    const last = must<{ sort_order: number }[]>(await db.from('task_categories').select('sort_order').eq('company_id', id).order('sort_order', { ascending: false }).limit(1));
    sort = (last[0]?.sort_order ?? 0) + 1;
  }
  const row = must<Row>(await db.from('task_categories').insert({ company_id: id, name: input.name, sort_order: sort }).select('*').single());
  return send(c, { ...row, tasks: 0 }, 201);
});

labels.openapi(createRoute({
  method: 'patch', path: '/task-categories/{id}', tags: catTags, security: secured,
  summary: 'Rename or reorder a task category (admins)',
  request: { params: IdParam, ...body(TaskCategoryUpdate) },
  responses: { 200: ok(TaskCategory), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const row = found(must<Row[]>(await db.from('task_categories').update(c.req.valid('json')).eq('id', id).select('*')));
  return send(c, { ...row, tasks: (await usage(db, row.company_id, 'category')).get(row.id) ?? 0 }, 200);
});

labels.openapi(createRoute({
  method: 'delete', path: '/task-categories/{id}', tags: catTags, security: secured,
  summary: 'Delete a task category (admins)',
  description: 'Tasks in it are left without a category.',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('task_categories').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});

// ---- Tags -------------------------------------------------------------------

labels.openapi(createRoute({
  method: 'get', path: '/companies/{id}/task-tags', tags: tagTags, security: secured,
  summary: 'The company\'s task tags, A to Z',
  request: { params: IdParam },
  responses: { 200: ok(z.array(TaskTag)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const [rows, used] = await Promise.all([
    db.from('task_tags').select('id, company_id, name').eq('company_id', id).order('name'),
    usage(db, id, 'tag'),
  ]);
  return send(c, must<Row[]>(rows).map((r) => ({ ...r, tasks: used.get(r.id) ?? 0 })), 200);
});

labels.openapi(createRoute({
  method: 'post', path: '/companies/{id}/task-tags', tags: tagTags, security: secured,
  summary: 'Create a tag (anyone in the company)',
  description: 'If the company already has a tag with this name (ignoring case), that tag is returned with 200 instead.',
  request: { params: IdParam, ...body(TaskTagInput) },
  responses: { 200: ok(TaskTag, 'Already existed'), 201: ok(TaskTag, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const { name } = c.req.valid('json');
  const existing = must<Row[]>(await db.from('task_tags').select('id, company_id, name').eq('company_id', id).ilike('name', name.replace(/[\\%_]/g, '\\$&')));
  if (existing.length) return send(c, { ...existing[0], tasks: (await usage(db, id, 'tag')).get(existing[0].id) ?? 0 }, 200);
  const row = must<Row>(await db.from('task_tags').insert({ company_id: id, name }).select('id, company_id, name').single());
  return send(c, { ...row, tasks: 0 }, 201);
});

labels.openapi(createRoute({
  method: 'patch', path: '/task-tags/{id}', tags: tagTags, security: secured,
  summary: 'Rename a tag (admins)',
  request: { params: IdParam, ...body(TaskTagInput) },
  responses: { 200: ok(TaskTag), 400: errors[400], 401: errors[401], 404: errors[404], 409: { ...errors[400], description: 'The company already has a tag with that name' } },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const row = found(must<Row[]>(await db.from('task_tags').update(c.req.valid('json')).eq('id', id).select('id, company_id, name')));
  return send(c, { ...row, tasks: (await usage(db, row.company_id, 'tag')).get(row.id) ?? 0 }, 200);
});

labels.openapi(createRoute({
  method: 'delete', path: '/task-tags/{id}', tags: tagTags, security: secured,
  summary: 'Delete a tag (admins)',
  description: 'It is removed from every task that has it.',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('task_tags').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});
