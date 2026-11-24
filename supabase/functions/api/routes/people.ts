import { createRoute, z } from '@hono/zod-openapi';
import { authed, found, must } from '../context.ts';
import { IdParam, PersonContact, PersonContactInput, PersonContactUpdate, Profile, ProfileUpdate } from '../schemas.ts';
import { body, errors, ok, profileFields, router, secured, send } from './common.ts';

// People's details. You change your own name and phone on /me; a company admin can
// change the name and phone of anyone in their company, and add more email addresses
// and phone numbers for them. Only you change your sign-in email (through sign-in).
export const people = router();
const tags = ['People'];

people.openapi(createRoute({
  method: 'patch', path: '/people/{id}', tags, security: secured,
  summary: 'Change someone\'s name or phone (you, or an admin of a company they\'re in)',
  description: 'Their sign-in email can\'t be changed here; only they can change it.',
  request: { params: IdParam, ...body(ProfileUpdate) },
  responses: { 200: ok(Profile), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const b = c.req.valid('json');
  const patch: Record<string, unknown> = {};
  if (b.full_name !== undefined) patch.full_name = b.full_name;
  if (b.phone !== undefined) patch.phone = b.phone || null;
  return send(c, found(must(await db.from('profiles').update(patch).eq('id', id).select(profileFields))), 200);
});

people.openapi(createRoute({
  method: 'get', path: '/people/{id}/contacts', tags, security: secured,
  summary: 'Someone\'s other email addresses and phone numbers',
  request: { params: IdParam },
  responses: { 200: ok(z.array(PersonContact)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  return send(c, must(await db.from('person_contacts').select('*').eq('user_id', id).order('kind').order('created_at')), 200);
});

people.openapi(createRoute({
  method: 'post', path: '/people/{id}/contacts', tags, security: secured,
  summary: 'Add an email address or phone number for someone (you, or their company admin)',
  request: { params: IdParam, ...body(PersonContactInput) },
  responses: { 201: ok(PersonContact, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const b = c.req.valid('json');
  return send(c, must(await db.from('person_contacts').insert({ ...b, label: b.label || null, user_id: id }).select('*').single()), 201);
});

people.openapi(createRoute({
  method: 'patch', path: '/contacts/{id}', tags, security: secured,
  summary: 'Change an extra email address or phone number',
  request: { params: IdParam, ...body(PersonContactUpdate) },
  responses: { 200: ok(PersonContact), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const b = c.req.valid('json');
  const patch: Record<string, unknown> = {};
  if (b.value !== undefined) patch.value = b.value;
  if (b.label !== undefined) patch.label = b.label || null;
  return send(c, found(must(await db.from('person_contacts').update(patch).eq('id', id).select('*'))), 200);
});

people.openapi(createRoute({
  method: 'delete', path: '/contacts/{id}', tags, security: secured,
  summary: 'Remove an extra email address or phone number',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('person_contacts').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});
