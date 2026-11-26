import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import {
  Element, ElementCategory, ElementCategoryInput, ElementInput, ElementUpdate, IdParam, IdsInput, SceneElementNoteInput, SceneElementParams,
} from '../schemas.ts';
import { body, errors, ok, router, secured, send } from './common.ts';

// A project's elements (the script breakdown: props, wardrobe, vehicles, effects…),
// each linked to the scenes that use it (one link that the scene and the element both
// edit), and the company's list of element categories. Everyone on the project adds
// and edits elements; whoever added one, or a company admin, deletes it. Company
// admins manage the categories.
export const elements = router();
const tags = ['Elements'];
const catTags = ['Element categories'];

// deno-lint-ignore no-explicit-any
type Row = any;
// deno-lint-ignore no-explicit-any
type Db = any;

/** Blank strings are stored as null. */
const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v]));

/** Add each element's scenes (with their notes), in scene order. */
async function withScenes(db: Db, rows: Row[]) {
  if (!rows.length) return [];
  const links = must<Row[]>(await db.from('scene_elements').select('element_id, scene_id, note, scene:scenes(sort_order)').in('element_id', rows.map((r) => r.id)));
  links.sort((a, b) => (a.scene?.sort_order ?? 0) - (b.scene?.sort_order ?? 0));
  const map = new Map<string, { scene_id: string; note: string | null }[]>();
  for (const l of links) map.set(l.element_id, [...(map.get(l.element_id) ?? []), { scene_id: l.scene_id, note: l.note }]);
  return rows.map((r) => ({ ...r, scenes: map.get(r.id) ?? [] }));
}

async function one(db: Db, id: string) {
  return (await withScenes(db, [must<Row>(await db.from('elements').select('*').eq('id', id).single())]))[0];
}

/** Make the links between `key` (one scene or one element) and `ids` exactly those, keeping notes on kept links. */
async function setLinks(db: Db, key: 'scene_id' | 'element_id', id: string, ids: string[]) {
  const other = key === 'scene_id' ? 'element_id' : 'scene_id';
  const have = new Set(must<Row[]>(await db.from('scene_elements').select(other).eq(key, id)).map((l) => l[other]));
  const want = new Set(ids);
  const remove = [...have].filter((x) => !want.has(x));
  const add = [...want].filter((x) => !have.has(x));
  if (remove.length) must(await db.from('scene_elements').delete().eq(key, id).in(other, remove));
  // project_id is filled in from the scene by the database.
  if (add.length) must(await db.from('scene_elements').insert(add.map((x) => ({ [key]: id, [other]: x, project_id: null }))));
}

elements.openapi(createRoute({
  method: 'get', path: '/projects/{id}/elements', tags, security: secured,
  summary: 'The project\'s elements, by name, with their scenes',
  request: { params: IdParam },
  responses: { 200: ok(z.array(Element)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const rows = must<Row[]>(await db.from('elements').select('*').eq('project_id', c.req.valid('param').id).order('name'));
  return send(c, await withScenes(db, rows), 200);
});

elements.openapi(createRoute({
  method: 'post', path: '/projects/{id}/elements', tags, security: secured,
  summary: 'Add an element (anyone on the project)',
  request: { params: IdParam, ...body(ElementInput) },
  responses: { 201: ok(Element, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const row = must<Row>(await db.from('elements').insert({ ...clean(c.req.valid('json')), project_id: c.req.valid('param').id }).select('*').single());
  return send(c, { ...row, scenes: [] }, 201);
});

elements.openapi(createRoute({
  method: 'patch', path: '/elements/{id}', tags, security: secured,
  summary: 'Change an element (anyone on the project)',
  description: 'The category must be one of the company\'s, the owner someone on the project\'s team, and the character and location the project\'s.',
  request: { params: IdParam, ...body(ElementUpdate) },
  responses: { 200: ok(Element), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must<Row[]>(await db.from('elements').update(clean(c.req.valid('json'))).eq('id', id).select('id')));
  return send(c, await one(db, id), 200);
});

elements.openapi(createRoute({
  method: 'delete', path: '/elements/{id}', tags, security: secured,
  summary: 'Delete an element, taking it out of its scenes (whoever added it, or a company admin)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('elements').delete().eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});

elements.openapi(createRoute({
  method: 'put', path: '/elements/{id}/scenes', tags, security: secured,
  summary: 'Set the scenes an element is in',
  request: { params: IdParam, ...body(IdsInput) },
  responses: { 200: ok(Element), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  await setLinks(db, 'element_id', id, c.req.valid('json').ids);
  return send(c, await one(db, id), 200);
});

elements.openapi(createRoute({
  method: 'put', path: '/scenes/{id}/elements', tags, security: secured,
  summary: 'Set the elements in a scene',
  request: { params: IdParam, ...body(IdsInput) },
  responses: { 204: { description: 'Saved' }, 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  await setLinks(db, 'scene_id', c.req.valid('param').id, c.req.valid('json').ids);
  return c.body(null, 204);
});

elements.openapi(createRoute({
  method: 'patch', path: '/scenes/{id}/elements/{elementId}', tags, security: secured,
  summary: 'Set the note on an element in one scene',
  request: { params: SceneElementParams, ...body(SceneElementNoteInput) },
  responses: { 204: { description: 'Saved' }, 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, elementId } = c.req.valid('param');
  found(must<Row[]>(await db.from('scene_elements').update({ note: c.req.valid('json').note || null })
    .eq('scene_id', id).eq('element_id', elementId).select('scene_id')));
  return c.body(null, 204);
});

// ---- Categories ------------------------------------------------------------------

async function usage(db: Db, companyId: string) {
  const rows = must<Row[]>(await db.rpc('element_category_usage', { cid: companyId }));
  return new Map(rows.map((u) => [u.id, Number(u.elements)]));
}

elements.openapi(createRoute({
  method: 'get', path: '/companies/{id}/element-categories', tags: catTags, security: secured,
  summary: 'The company\'s element categories, in order, with how many elements use each',
  request: { params: IdParam },
  responses: { 200: ok(z.array(ElementCategory)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const [rows, used] = await Promise.all([
    db.from('element_categories').select('*').eq('company_id', id).order('sort_order').order('name'),
    usage(db, id),
  ]);
  return send(c, must<Row[]>(rows).map((r) => ({ ...r, elements: used.get(r.id) ?? 0 })), 200);
});

elements.openapi(createRoute({
  method: 'post', path: '/companies/{id}/element-categories', tags: catTags, security: secured,
  summary: 'Add an element category at the end of the list (company admins)',
  request: { params: IdParam, ...body(ElementCategoryInput) },
  responses: { 201: ok(ElementCategory, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const last = must<Row[]>(await db.from('element_categories').select('sort_order').eq('company_id', id).order('sort_order', { ascending: false }).limit(1));
  const row = must<Row>(await db.from('element_categories').insert({ company_id: id, name: c.req.valid('json').name, sort_order: (last[0]?.sort_order ?? 0) + 1 }).select('*').single());
  return send(c, { ...row, elements: 0 }, 201);
});

elements.openapi(createRoute({
  method: 'patch', path: '/element-categories/{id}', tags: catTags, security: secured,
  summary: 'Rename an element category (company admins)',
  request: { params: IdParam, ...body(ElementCategoryInput) },
  responses: { 204: { description: 'Renamed' }, 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('element_categories').update({ name: c.req.valid('json').name }).eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});

elements.openapi(createRoute({
  method: 'delete', path: '/element-categories/{id}', tags: catTags, security: secured,
  summary: 'Delete an element category (company admins); its elements stay, with no category',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('element_categories').delete().eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});
