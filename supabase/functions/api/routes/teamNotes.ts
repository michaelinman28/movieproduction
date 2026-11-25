import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import { IdParam, MemberParams, TeamNote, TeamNoteInput, TeamNoteType, TeamNoteTypeInput, TeamNoteUpdate } from '../schemas.ts';
import { body, errors, ok, router, secured, send, withAuthors } from './common.ts';

// Team member notes: dated notes about a person on a project, each with a type from
// the company's list. Only company admins and the person a note is about see them;
// admins add notes about anyone, people add notes about themselves.
export const teamNotes = router();
const tags = ['Team member notes'];
const typeTags = ['Team note types'];

// deno-lint-ignore no-explicit-any
type Row = any;

// ---- Note types -------------------------------------------------------------------

teamNotes.openapi(createRoute({
  method: 'get', path: '/companies/{id}/team-note-types', tags: typeTags, security: secured,
  summary: 'The company\'s team note types, in order, with how many notes use each (admins)',
  request: { params: IdParam },
  responses: { 200: ok(z.array(TeamNoteType)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const [types, usage] = await Promise.all([
    db.from('team_note_types').select('*').eq('company_id', id).order('sort_order').order('name'),
    db.rpc('team_note_type_usage', { cid: id }),
  ]);
  const counts = new Map(must<Row[]>(usage).map((u) => [u.id, Number(u.notes)]));
  return send(c, must<Row[]>(types).map((t) => ({ ...t, notes: counts.get(t.id) ?? 0 })), 200);
});

teamNotes.openapi(createRoute({
  method: 'post', path: '/companies/{id}/team-note-types', tags: typeTags, security: secured,
  summary: 'Add a team note type (company admins)',
  request: { params: IdParam, ...body(TeamNoteTypeInput) },
  responses: { 201: ok(TeamNoteType, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const last = must<Row[]>(await db.from('team_note_types').select('sort_order').eq('company_id', id).order('sort_order', { ascending: false }).limit(1));
  const row = must<Row>(await db.from('team_note_types').insert({ company_id: id, name: c.req.valid('json').name, sort_order: (last[0]?.sort_order ?? 0) + 1 }).select('*').single());
  return send(c, { ...row, notes: 0 }, 201);
});

teamNotes.openapi(createRoute({
  method: 'patch', path: '/team-note-types/{id}', tags: typeTags, security: secured,
  summary: 'Rename a team note type (company admins)',
  request: { params: IdParam, ...body(TeamNoteTypeInput) },
  responses: { 204: { description: 'Renamed' }, 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('team_note_types').update({ name: c.req.valid('json').name }).eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});

teamNotes.openapi(createRoute({
  method: 'delete', path: '/team-note-types/{id}', tags: typeTags, security: secured,
  summary: 'Delete a team note type (company admins); its notes stay, with no type',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('team_note_types').delete().eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});

// ---- Notes ------------------------------------------------------------------------

teamNotes.openapi(createRoute({
  method: 'get', path: '/projects/{id}/members/{userId}/notes', tags, security: secured,
  summary: 'Notes about someone on a project, oldest first (company admins and that person)',
  request: { params: MemberParams },
  responses: { 200: ok(z.array(TeamNote)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, userId } = c.req.valid('param');
  const rows = must<Row[]>(await db.from('team_notes').select('*').eq('project_id', id).eq('user_id', userId).order('created_at'));
  return send(c, await withAuthors(db, rows), 200);
});

teamNotes.openapi(createRoute({
  method: 'post', path: '/projects/{id}/members/{userId}/notes', tags, security: secured,
  summary: 'Add a note about someone on a project (company admins, or the person about themselves)',
  request: { params: MemberParams, ...body(TeamNoteInput) },
  responses: { 201: ok(TeamNote, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, userId } = c.req.valid('param');
  const b = c.req.valid('json');
  const row = must<Row>(await db.from('team_notes').insert({ project_id: id, user_id: userId, body: b.body, type_id: b.type_id ?? null }).select('*').single());
  return send(c, (await withAuthors(db, [row]))[0], 201);
});

teamNotes.openapi(createRoute({
  method: 'patch', path: '/team-notes/{id}', tags, security: secured,
  summary: 'Edit your own team note, or change its type',
  request: { params: IdParam, ...body(TeamNoteUpdate) },
  responses: { 200: ok(TeamNote), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const b = c.req.valid('json');
  const patch = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
  const row = found(must<Row[]>(await db.from('team_notes').update(patch).eq('id', c.req.valid('param').id).select('*')));
  return send(c, (await withAuthors(db, [row]))[0], 200);
});

teamNotes.openapi(createRoute({
  method: 'delete', path: '/team-notes/{id}', tags, security: secured,
  summary: 'Delete a team note (its author, or a company admin)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  found(must(await db.from('team_notes').delete().eq('id', c.req.valid('param').id).select('id')));
  return c.body(null, 204);
});
