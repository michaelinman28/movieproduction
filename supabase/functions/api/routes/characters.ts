import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import {
  Character, CharacterInput, CharacterNote, CharacterUpdate, IdParam, IdsInput, LookNoteInput, SceneCharacterParams, TaskNoteInput,
} from '../schemas.ts';
import { body, errors, ok, router, secured, send, withAuthors } from './common.ts';

// A project's characters: basics, casting, look and continuity, the scenes they're
// in (one link that the scene and the character both edit), and notes. Everyone on
// the project adds and edits them; whoever added a character, or a company admin,
// deletes it.
export const characters = router();
const tags = ['Characters'];
const noteTags = ['Character notes'];

// deno-lint-ignore no-explicit-any
type Row = any;
// deno-lint-ignore no-explicit-any
type Db = any;

/** Blank strings are stored as null. */
const clean = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, v === '' ? null : v]));

/** Add each character's scenes (with look notes), in scene order. */
async function withScenes(db: Db, rows: Row[]) {
  if (!rows.length) return [];
  const links = must<Row[]>(await db.from('scene_characters').select('character_id, scene_id, look_note, scene:scenes(sort_order)').in('character_id', rows.map((r) => r.id)));
  links.sort((a, b) => (a.scene?.sort_order ?? 0) - (b.scene?.sort_order ?? 0));
  const map = new Map<string, { scene_id: string; look_note: string | null }[]>();
  for (const l of links) map.set(l.character_id, [...(map.get(l.character_id) ?? []), { scene_id: l.scene_id, look_note: l.look_note }]);
  return rows.map((r) => ({ ...r, scenes: map.get(r.id) ?? [] }));
}

async function one(db: Db, id: string) {
  return (await withScenes(db, [must<Row>(await db.from('characters').select('*').eq('id', id).single())]))[0];
}

/** Make the links between `key` (one scene or one character) and `ids` exactly those, keeping look notes on kept links. */
async function setLinks(db: Db, key: 'scene_id' | 'character_id', id: string, ids: string[]) {
  const other = key === 'scene_id' ? 'character_id' : 'scene_id';
  const have = new Set(must<Row[]>(await db.from('scene_characters').select(other).eq(key, id)).map((l) => l[other]));
  const want = new Set(ids);
  const remove = [...have].filter((x) => !want.has(x));
  const add = [...want].filter((x) => !have.has(x));
  if (remove.length) must(await db.from('scene_characters').delete().eq(key, id).in(other, remove));
  // project_id is filled in from the scene by the database.
  if (add.length) must(await db.from('scene_characters').insert(add.map((x) => ({ [key]: id, [other]: x, project_id: null }))));
}

characters.openapi(createRoute({
  method: 'get', path: '/projects/{id}/characters', tags, security: secured,
  summary: 'The project\'s characters, by cast number then name, with their scenes',
  request: { params: IdParam },
  responses: { 200: ok(z.array(Character)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const rows = must<Row[]>(await db.from('characters').select('*').eq('project_id', c.req.valid('param').id)
    .order('cast_number', { ascending: true, nullsFirst: false }).order('name'));
  return send(c, await withScenes(db, rows), 200);
});

characters.openapi(createRoute({
  method: 'post', path: '/projects/{id}/characters', tags, security: secured,
  summary: 'Add a character (anyone on the project)',
  request: { params: IdParam, ...body(CharacterInput) },
  responses: { 201: ok(Character, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const row = must<Row>(await db.from('characters').insert({ ...clean(c.req.valid('json')), project_id: c.req.valid('param').id }).select('*').single());
  return send(c, { ...row, scenes: [] }, 201);
});

characters.openapi(createRoute({
  method: 'patch', path: '/characters/{id}', tags, security: secured,
  summary: 'Change a character (anyone on the project)',
  description: 'The actor, stand-in and stunt double must be on the project\'s team. Picking an actor for a character that isn\'t cast yet marks it cast, unless casting_status is sent too.',
  request: { params: IdParam, ...body(CharacterUpdate) },
  responses: { 200: ok(Character), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must<Row[]>(await db.from('characters').update(clean(c.req.valid('json'))).eq('id', id).select('id')));
  return send(c, await one(db, id), 200);
});

characters.openapi(createRoute({
  method: 'delete', path: '/characters/{id}', tags, security: secured,
  summary: 'Delete a character, taking it out of its scenes (whoever added it, or a company admin)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('characters').delete().eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});

characters.openapi(createRoute({
  method: 'put', path: '/characters/{id}/scenes', tags, security: secured,
  summary: 'Set the scenes a character is in',
  request: { params: IdParam, ...body(IdsInput) },
  responses: { 200: ok(Character), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  await setLinks(db, 'character_id', id, c.req.valid('json').ids);
  return send(c, await one(db, id), 200);
});

characters.openapi(createRoute({
  method: 'put', path: '/scenes/{id}/characters', tags, security: secured,
  summary: 'Set the characters in a scene',
  request: { params: IdParam, ...body(IdsInput) },
  responses: { 204: { description: 'Saved' }, 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  await setLinks(db, 'scene_id', c.req.valid('param').id, c.req.valid('json').ids);
  return c.body(null, 204);
});

characters.openapi(createRoute({
  method: 'patch', path: '/scenes/{id}/characters/{characterId}', tags, security: secured,
  summary: 'Set how a character looks in one scene (the look note)',
  request: { params: SceneCharacterParams, ...body(LookNoteInput) },
  responses: { 204: { description: 'Saved' }, 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, characterId } = c.req.valid('param');
  found(must<Row[]>(await db.from('scene_characters').update({ look_note: c.req.valid('json').look_note || null })
    .eq('scene_id', id).eq('character_id', characterId).select('scene_id')));
  return c.body(null, 204);
});

// ---- Character notes ------------------------------------------------------------

characters.openapi(createRoute({
  method: 'get', path: '/characters/{id}/notes', tags: noteTags, security: secured,
  summary: 'Notes on a character, oldest first',
  request: { params: IdParam },
  responses: { 200: ok(z.array(CharacterNote)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const rows = must<Row[]>(await db.from('character_notes').select('*').eq('character_id', c.req.valid('param').id).order('created_at'));
  return send(c, await withAuthors(db, rows), 200);
});

characters.openapi(createRoute({
  method: 'post', path: '/characters/{id}/notes', tags: noteTags, security: secured,
  summary: 'Add a note to a character',
  request: { params: IdParam, ...body(TaskNoteInput) },
  responses: { 201: ok(CharacterNote, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const row = must<Row>(await db.from('character_notes').insert({ character_id: c.req.valid('param').id, body: c.req.valid('json').body }).select('*').single());
  return send(c, (await withAuthors(db, [row]))[0], 201);
});

characters.openapi(createRoute({
  method: 'patch', path: '/character-notes/{id}', tags: noteTags, security: secured,
  summary: 'Edit your own character note',
  request: { params: IdParam, ...body(TaskNoteInput) },
  responses: { 200: ok(CharacterNote), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const row = found(must<Row[]>(await db.from('character_notes').update({ body: c.req.valid('json').body }).eq('id', c.req.valid('param').id).select('*')));
  return send(c, (await withAuthors(db, [row]))[0], 200);
});

characters.openapi(createRoute({
  method: 'delete', path: '/character-notes/{id}', tags: noteTags, security: secured,
  summary: 'Delete a character note (its author, or a company admin)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('character_notes').delete().eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});
