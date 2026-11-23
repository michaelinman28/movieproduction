import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import { IdParam, Task, TaskCreate, TaskUpdate } from '../schemas.ts';
import { body, errors, ok, router, secured, send } from './common.ts';

export const tasks = router();
const tags = ['Tasks'];

// deno-lint-ignore no-explicit-any
type Row = any;

// Leave out fields that weren't sent; turn empty strings into null.
const clean = (b: Record<string, unknown>) => {
  const patch: Row = {};
  for (const [k, v] of Object.entries(b)) if (v !== undefined) patch[k] = v === '' ? null : v;
  return patch;
};

tasks.openapi(createRoute({
  method: 'get', path: '/projects/{id}/tasks', tags, security: secured,
  summary: 'Tasks and sub-tasks in a project',
  description: 'A flat list. Sub-tasks point at their parent through `parent_id`. Anyone on the project, and admins of its company, can see and work on its tasks.',
  request: { params: IdParam },
  responses: { 200: ok(z.array(Task)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  return send(c, must(await db.from('tasks').select('*').eq('project_id', id).order('sort_order').order('created_at')), 200);
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
  return send(c, must(await db.from('tasks').insert({ ...clean(c.req.valid('json')), project_id: id }).select('*').single()), 201);
});

tasks.openapi(createRoute({
  method: 'get', path: '/tasks/{id}', tags, security: secured,
  summary: 'One task',
  request: { params: IdParam },
  responses: { 200: ok(Task), 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  return send(c, must(await db.from('tasks').select('*').eq('id', id).single()), 200);
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
  return send(c, found(must<Row[]>(await db.from('tasks').update(clean(c.req.valid('json'))).eq('id', id).select('*'))), 200);
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
