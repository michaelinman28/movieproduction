import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import { IdParam, Task, TaskCreate, TaskNote, TaskNoteInput, TaskUpdate } from '../schemas.ts';
import { body, errors, ok, profileFields, router, secured, send } from './common.ts';

export const tasks = router();
const tags = ['Tasks'];

// deno-lint-ignore no-explicit-any
type Row = any;

// Leave out fields that weren't sent (and tag_ids, which live in their own table);
// turn empty strings into null.
const clean = (b: Record<string, unknown>) => {
  const patch: Row = {};
  for (const [k, v] of Object.entries(b)) if (v !== undefined && k !== 'tag_ids') patch[k] = v === '' ? null : v;
  return patch;
};

/** Add tag_ids to each task. */
// deno-lint-ignore no-explicit-any
async function withTags(db: any, rows: Row[]) {
  if (!rows.length) return rows;
  const links = must<{ task_id: string; tag_id: string }[]>(
    await db.from('task_tag_links').select('task_id, tag_id').in('task_id', rows.map((r) => r.id)));
  const map = new Map<string, string[]>();
  for (const l of links) map.set(l.task_id, [...(map.get(l.task_id) ?? []), l.tag_id]);
  return rows.map((r) => ({ ...r, tag_ids: map.get(r.id) ?? [] }));
}

/** Make a task's tags exactly tagIds. */
// deno-lint-ignore no-explicit-any
async function setTags(db: any, taskId: string, tagIds: string[]) {
  const have = new Set(must<{ tag_id: string }[]>(await db.from('task_tag_links').select('tag_id').eq('task_id', taskId)).map((l) => l.tag_id));
  const want = new Set(tagIds);
  const remove = [...have].filter((id) => !want.has(id));
  const add = [...want].filter((id) => !have.has(id));
  if (remove.length) must(await db.from('task_tag_links').delete().eq('task_id', taskId).in('tag_id', remove));
  if (add.length) must(await db.from('task_tag_links').insert(add.map((tag_id) => ({ task_id: taskId, tag_id }))));
}

tasks.openapi(createRoute({
  method: 'get', path: '/projects/{id}/tasks', tags, security: secured,
  summary: 'Tasks and sub-tasks in a project',
  description: 'A flat list. Sub-tasks point at their parent through `parent_id`. Anyone on the project, and admins of its company, can see and work on its tasks.',
  request: { params: IdParam },
  responses: { 200: ok(z.array(Task)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const rows = must<Row[]>(await db.from('tasks').select('*').eq('project_id', id).order('sort_order').order('created_at'));
  return send(c, await withTags(db, rows), 200);
});

tasks.openapi(createRoute({
  method: 'post', path: '/projects/{id}/tasks', tags, security: secured,
  summary: 'Add a task or sub-task',
  description: 'Give `parent_id` to add a sub-task. A sub-task stays in its parent\'s project, and tasks can only be assigned to people on the project.',
  request: { params: IdParam, ...body(TaskCreate) },
  responses: { 201: ok(Task, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');
  const row = must<Row>(await db.from('tasks').insert({ ...clean(input), project_id: id }).select('*').single());
  if (input.tag_ids?.length) await setTags(db, row.id, input.tag_ids);
  return send(c, (await withTags(db, [row]))[0], 201);
});

tasks.openapi(createRoute({
  method: 'get', path: '/tasks/{id}', tags, security: secured,
  summary: 'One task',
  request: { params: IdParam },
  responses: { 200: ok(Task), 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  return send(c, (await withTags(db, [must<Row>(await db.from('tasks').select('*').eq('id', id).single())]))[0], 200);
});

tasks.openapi(createRoute({
  method: 'patch', path: '/tasks/{id}', tags, security: secured,
  summary: 'Update a task',
  description: 'Send only the fields to change. Setting `parent_id` moves the task, and a task can\'t be moved under its own sub-tasks.',
  request: { params: IdParam, ...body(TaskUpdate) },
  responses: { 200: ok(Task), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');
  const patch = clean(input);
  const row = Object.keys(patch).length
    ? found(must<Row[]>(await db.from('tasks').update(patch).eq('id', id).select('*')))
    : must<Row>(await db.from('tasks').select('*').eq('id', id).single());
  if (input.tag_ids) await setTags(db, id, input.tag_ids);
  return send(c, (await withTags(db, [row]))[0], 200);
});

tasks.openapi(createRoute({
  method: 'delete', path: '/tasks/{id}', tags, security: secured,
  summary: 'Delete a task and its sub-tasks',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('tasks').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});

// ---- Notes ------------------------------------------------------------------

const notesTags = ['Task notes'];

/** Attach each note's author profile. */
// deno-lint-ignore no-explicit-any
async function withAuthors(db: any, notes: Row[]) {
  const ids = [...new Set(notes.map((n) => n.author_id))];
  const profiles = ids.length ? must<Row[]>(await db.from('profiles').select(profileFields).in('id', ids)) : [];
  const byId = new Map(profiles.map((p: Row) => [p.id, p]));
  return notes.map((n) => ({ ...n, author: byId.get(n.author_id) ?? { id: n.author_id, full_name: null, email: null, phone: null } }));
}

tasks.openapi(createRoute({
  method: 'get', path: '/tasks/{id}/notes', tags: notesTags, security: secured,
  summary: 'Notes on a task, oldest first',
  request: { params: IdParam },
  responses: { 200: ok(z.array(TaskNote)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const notes = must<Row[]>(await db.from('task_notes').select('*').eq('task_id', id).order('created_at'));
  return send(c, await withAuthors(db, notes), 200);
});

tasks.openapi(createRoute({
  method: 'post', path: '/tasks/{id}/notes', tags: notesTags, security: secured,
  summary: 'Add a note to a task',
  description: 'Anyone who can work on the task can add notes. The note is signed by the caller.',
  request: { params: IdParam, ...body(TaskNoteInput) },
  responses: { 201: ok(TaskNote, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const note = must<Row>(await db.from('task_notes').insert({ task_id: id, body: c.req.valid('json').body }).select('*').single());
  return send(c, (await withAuthors(db, [note]))[0], 201);
});

tasks.openapi(createRoute({
  method: 'patch', path: '/task-notes/{id}', tags: notesTags, security: secured,
  summary: 'Edit your own note',
  request: { params: IdParam, ...body(TaskNoteInput) },
  responses: { 200: ok(TaskNote), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const note = found(must<Row[]>(await db.from('task_notes').update({ body: c.req.valid('json').body }).eq('id', id).select('*')));
  return send(c, (await withAuthors(db, [note]))[0], 200);
});

tasks.openapi(createRoute({
  method: 'delete', path: '/task-notes/{id}', tags: notesTags, security: secured,
  summary: 'Delete a note (its author, or a company admin)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('task_notes').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});
