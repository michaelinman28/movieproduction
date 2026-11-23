import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import { IdParam, Location, LocationInput, LocationUpdate } from '../schemas.ts';
import { body, errors, ok, router, secured, send } from './common.ts';

// A project's locations. Everyone on the project can add and edit them; the person
// who added one or a company admin can delete it.
export const locations = router();
const tags = ['Locations'];

// deno-lint-ignore no-explicit-any
type Row = any;

/** How many tasks are at each location of a project. */
// deno-lint-ignore no-explicit-any
async function usage(db: any, projectId: string) {
  const rows = must<{ location_id: string | null }[]>(
    await db.from('tasks').select('location_id').eq('project_id', projectId).not('location_id', 'is', null));
  const n = new Map<string, number>();
  for (const r of rows) if (r.location_id) n.set(r.location_id, (n.get(r.location_id) ?? 0) + 1);
  return n;
}

/** Blank strings are stored as null. */
const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]));

locations.openapi(createRoute({
  method: 'get', path: '/projects/{id}/locations', tags, security: secured,
  summary: 'The project\'s locations, A to Z',
  request: { params: IdParam },
  responses: { 200: ok(z.array(Location)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const [rows, used] = await Promise.all([
    db.from('project_locations').select('*').eq('project_id', id).order('name'),
    usage(db, id),
  ]);
  return send(c, must<Row[]>(rows).map((r) => ({ ...r, tasks: used.get(r.id) ?? 0 })), 200);
});

locations.openapi(createRoute({
  method: 'post', path: '/projects/{id}/locations', tags, security: secured,
  summary: 'Add a location (anyone on the project)',
  request: { params: IdParam, ...body(LocationInput) },
  responses: { 201: ok(Location, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const row = must<Row>(await db.from('project_locations').insert({ ...clean(c.req.valid('json')), project_id: id }).select('*').single());
  return send(c, { ...row, tasks: 0 }, 201);
});

locations.openapi(createRoute({
  method: 'patch', path: '/locations/{id}', tags, security: secured,
  summary: 'Change a location (anyone on the project)',
  request: { params: IdParam, ...body(LocationUpdate) },
  responses: { 200: ok(Location), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const row = found(must<Row[]>(await db.from('project_locations').update(clean(c.req.valid('json'))).eq('id', id).select('*')));
  return send(c, { ...row, tasks: (await usage(db, row.project_id)).get(row.id) ?? 0 }, 200);
});

locations.openapi(createRoute({
  method: 'delete', path: '/locations/{id}', tags, security: secured,
  summary: 'Delete a location (whoever added it, or a company admin)',
  description: 'Tasks at this location are left without one.',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('project_locations').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});
