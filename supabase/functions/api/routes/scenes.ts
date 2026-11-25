import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import { IdParam, OrderInput, Scene, SceneInput, SceneUpdate, Shot, ShotInput, ShotUpdate } from '../schemas.ts';
import { body, errors, ok, router, secured, send } from './common.ts';

// A project's scenes and each scene's shot list. Everyone on the project can add,
// edit and reorder them; whoever added a scene, or a company admin, deletes it (with
// its shots); anyone on the project deletes a shot.
export const scenes = router();
const sceneTags = ['Scenes'];
const shotTags = ['Shots'];

// deno-lint-ignore no-explicit-any
type Row = any;
// deno-lint-ignore no-explicit-any
type Db = any;

/** Blank strings are stored as null. */
const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]));

/** Shot counts and estimated minutes per scene, for the given scenes. */
async function shotTotals(db: Db, sceneIds: string[]) {
  const totals = new Map<string, { shots: number; shots_done: number; est_minutes: number }>();
  if (!sceneIds.length) return totals;
  const rows = must<{ scene_id: string; done: boolean; est_minutes: number | null }[]>(
    await db.from('shots').select('scene_id, done, est_minutes').in('scene_id', sceneIds));
  for (const r of rows) {
    const t = totals.get(r.scene_id) ?? { shots: 0, shots_done: 0, est_minutes: 0 };
    t.shots++;
    if (r.done) t.shots_done++;
    t.est_minutes += r.est_minutes ?? 0;
    totals.set(r.scene_id, t);
  }
  return totals;
}

async function withTotals(db: Db, rows: Row[]) {
  const totals = await shotTotals(db, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, ...(totals.get(r.id) ?? { shots: 0, shots_done: 0, est_minutes: 0 }) }));
}

/** Set sort_order 1, 2, 3… in the order given. Every id must be in the list being ordered. */
async function reorder(db: Db, table: 'scenes' | 'shots', key: Record<string, string>, ids: string[]) {
  const have = must<{ id: string }[]>(await db.from(table).select('id').match(key));
  const known = new Set(have.map((r) => r.id));
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
    return 'List every one of them exactly once, in the new order.';
  }
  for (const [i, id] of ids.entries()) must(await db.from(table).update({ sort_order: i + 1 }).eq('id', id).select('id'));
  return null;
}

// ---- Scenes -----------------------------------------------------------------

scenes.openapi(createRoute({
  method: 'get', path: '/projects/{id}/scenes', tags: sceneTags, security: secured,
  summary: 'The project\'s scenes, in order, with shot counts',
  request: { params: IdParam },
  responses: { 200: ok(z.array(Scene)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const rows = must<Row[]>(await db.from('scenes').select('*').eq('project_id', id).order('sort_order').order('created_at'));
  return send(c, await withTotals(db, rows), 200);
});

scenes.openapi(createRoute({
  method: 'post', path: '/projects/{id}/scenes', tags: sceneTags, security: secured,
  summary: 'Add a scene at the end of the list (anyone on the project)',
  request: { params: IdParam, ...body(SceneInput) },
  responses: { 201: ok(Scene, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const row = must<Row>(await db.from('scenes').insert({ ...clean(c.req.valid('json')), project_id: id }).select('*').single());
  return send(c, { ...row, shots: 0, shots_done: 0, est_minutes: 0 }, 201);
});

scenes.openapi(createRoute({
  method: 'put', path: '/projects/{id}/scene-order', tags: sceneTags, security: secured,
  summary: 'Put the project\'s scenes in a new order',
  request: { params: IdParam, ...body(OrderInput) },
  responses: { 204: { description: 'Reordered' }, 400: errors[400], 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const problem = await reorder(db, 'scenes', { project_id: id }, c.req.valid('json').ids);
  if (problem) return c.json({ error: problem }, 400);
  return c.body(null, 204);
});

scenes.openapi(createRoute({
  method: 'patch', path: '/scenes/{id}', tags: sceneTags, security: secured,
  summary: 'Change a scene (anyone on the project)',
  request: { params: IdParam, ...body(SceneUpdate) },
  responses: { 200: ok(Scene), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const row = found(must<Row[]>(await db.from('scenes').update(clean(c.req.valid('json'))).eq('id', id).select('*')));
  return send(c, (await withTotals(db, [row]))[0], 200);
});

scenes.openapi(createRoute({
  method: 'delete', path: '/scenes/{id}', tags: sceneTags, security: secured,
  summary: 'Delete a scene and its shots (whoever added it, or a company admin)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('scenes').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});

// ---- Shots ------------------------------------------------------------------

scenes.openapi(createRoute({
  method: 'get', path: '/projects/{id}/shots', tags: shotTags, security: secured,
  summary: 'Every shot in the project, by scene and shot order',
  request: { params: IdParam },
  responses: { 200: ok(z.array(Shot)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const rows = must<Row[]>(await db.from('shots').select('*').eq('project_id', id).order('sort_order'));
  return send(c, rows, 200);
});

scenes.openapi(createRoute({
  method: 'get', path: '/scenes/{id}/shots', tags: shotTags, security: secured,
  summary: 'A scene\'s shot list, in order',
  request: { params: IdParam },
  responses: { 200: ok(z.array(Shot)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  return send(c, must<Row[]>(await db.from('shots').select('*').eq('scene_id', id).order('sort_order').order('created_at')), 200);
});

scenes.openapi(createRoute({
  method: 'post', path: '/scenes/{id}/shots', tags: shotTags, security: secured,
  summary: 'Add a shot at the end of the scene\'s list (anyone on the project)',
  request: { params: IdParam, ...body(ShotInput) },
  responses: { 201: ok(Shot, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const row = must<Row>(await db.from('shots').insert({ ...clean(c.req.valid('json')), scene_id: id }).select('*').single());
  return send(c, row, 201);
});

scenes.openapi(createRoute({
  method: 'put', path: '/scenes/{id}/shot-order', tags: shotTags, security: secured,
  summary: 'Put a scene\'s shots in a new order',
  request: { params: IdParam, ...body(OrderInput) },
  responses: { 204: { description: 'Reordered' }, 400: errors[400], 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const problem = await reorder(db, 'shots', { scene_id: id }, c.req.valid('json').ids);
  if (problem) return c.json({ error: problem }, 400);
  return c.body(null, 204);
});

scenes.openapi(createRoute({
  method: 'patch', path: '/shots/{id}', tags: shotTags, security: secured,
  summary: 'Change a shot, or tick it done (anyone on the project)',
  request: { params: IdParam, ...body(ShotUpdate) },
  responses: { 200: ok(Shot), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  return send(c, found(must<Row[]>(await db.from('shots').update(clean(c.req.valid('json'))).eq('id', id).select('*'))), 200);
});

scenes.openapi(createRoute({
  method: 'delete', path: '/shots/{id}', tags: shotTags, security: secured,
  summary: 'Delete a shot (anyone on the project)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('shots').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});
