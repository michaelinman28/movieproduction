import { createRoute, z } from '@hono/zod-openapi';
import { authed, fail, found, must } from '../context.ts';
import {
  IdParam, MemberParams, Project, ProjectCreate, ProjectDetail, ProjectMember, ProjectMemberAdd, ProjectUpdate, RoleIds,
} from '../schemas.ts';
import { body, errors, ok, send, profileFields, rolesByUser, router, secured, setRoles } from './common.ts';

export const projects = router();
const tags = ['Projects'];
const team = ['Project team'];

// deno-lint-ignore no-explicit-any
type Row = any;

const clean = (b: z.infer<typeof ProjectUpdate>) => {
  const patch: Row = {};
  for (const [k, v] of Object.entries(b)) if (v !== undefined) patch[k] = typeof v === 'string' && v === '' ? null : v;
  return patch;
};

projects.openapi(createRoute({
  method: 'get', path: '/companies/{id}/projects', tags, security: secured,
  summary: 'Projects in a company',
  description: 'Admins see every project; other people see the projects they are assigned to.',
  request: { params: IdParam },
  responses: { 200: ok(z.array(Project)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  return send(c, must(await db.from('projects').select('*').eq('company_id', id).order('created_at')), 200);
});

projects.openapi(createRoute({
  method: 'post', path: '/companies/{id}/projects', tags, security: secured,
  summary: 'Create a project (admins)',
  request: { params: IdParam, ...body(ProjectCreate) },
  responses: { 201: ok(Project, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const row = must(await db.from('projects').insert({ ...clean(c.req.valid('json')), company_id: id }).select('*').single());
  return send(c, row, 201);
});

projects.openapi(createRoute({
  method: 'get', path: '/projects/{id}', tags, security: secured,
  summary: 'One project',
  request: { params: IdParam },
  responses: { 200: ok(ProjectDetail), 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db, userId } = await authed(c);
  const { id } = c.req.valid('param');
  const p = must<Row & { company_id: string }>(await db.from('projects').select('*').eq('id', id).single());
  const [co, me] = await Promise.all([
    db.from('companies').select('id, name').eq('id', p.company_id).single(),
    db.from('company_members').select('is_admin').match({ company_id: p.company_id, user_id: userId }).maybeSingle(),
  ]);
  return send(c, { ...p, company: must(co), can_manage: Boolean(must<{ is_admin: boolean } | null>(me)?.is_admin) }, 200);
});

projects.openapi(createRoute({
  method: 'patch', path: '/projects/{id}', tags, security: secured,
  summary: 'Update a project (admins)',
  request: { params: IdParam, ...body(ProjectUpdate) },
  responses: { 200: ok(Project), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  return send(c, found(must<Row[]>(await db.from('projects').update(clean(c.req.valid('json'))).eq('id', id).select('*'))), 200);
});

projects.openapi(createRoute({
  method: 'delete', path: '/projects/{id}', tags, security: secured,
  summary: 'Delete a project with its tasks and journal (admins)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('projects').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});

// ---- Team -------------------------------------------------------------------

projects.openapi(createRoute({
  method: 'get', path: '/projects/{id}/members', tags: team, security: secured,
  summary: 'People assigned to a project',
  request: { params: IdParam },
  responses: { 200: ok(z.array(ProjectMember)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const [m, r] = await Promise.all([
    db.from('project_members').select('user_id, joined_at').eq('project_id', id),
    db.from('project_member_roles').select('user_id, role_id').eq('project_id', id),
  ]);
  const members = must<{ user_id: string; joined_at: string }[]>(m);
  const roles = rolesByUser(must(r));
  const ids = members.map((x) => x.user_id);
  const profiles = ids.length ? must<{ id: string }[]>(await db.from('profiles').select(profileFields).in('id', ids)) : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return send(c, members.map((x) => ({
    ...x, profile: byId.get(x.user_id) ?? { id: x.user_id, full_name: null, email: null, phone: null },
    role_ids: roles.get(x.user_id) ?? [],
  })), 200);
});

projects.openapi(createRoute({
  method: 'post', path: '/projects/{id}/members', tags: team, security: secured,
  summary: 'Assign a company member to a project (admins)',
  request: { params: IdParam, ...body(ProjectMemberAdd) },
  responses: { 201: ok(z.object({ user_id: z.uuid(), joined_at: z.string() }), 'Assigned'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const { user_id } = c.req.valid('json');
  return send(c, must(await db.from('project_members').insert({ project_id: id, user_id }).select('user_id, joined_at').single()), 201);
});

projects.openapi(createRoute({
  method: 'delete', path: '/projects/{id}/members/{userId}', tags: team, security: secured,
  summary: 'Remove someone from a project (admins)',
  description: 'They stay in the company.',
  request: { params: MemberParams },
  responses: { 204: { description: 'Removed' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, userId } = c.req.valid('param');
  found(must(await db.from('project_members').delete().match({ project_id: id, user_id: userId }).select('user_id')));
  return c.body(null, 204);
});

projects.openapi(createRoute({
  method: 'put', path: '/projects/{id}/members/{userId}/roles', tags: team, security: secured,
  summary: 'Set someone\'s project roles (admins)',
  description: 'Replaces their project roles with exactly this list.',
  request: { params: MemberParams, ...body(RoleIds) },
  responses: { 200: ok(RoleIds), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, userId } = c.req.valid('param');
  const { role_ids } = c.req.valid('json');
  const error = await setRoles(db, 'project_member_roles', { project_id: id, user_id: userId }, role_ids);
  if (error) fail(error);
  return send(c, { role_ids }, 200);
});
