import { createRoute, z } from '@hono/zod-openapi';
import { authed, fail, found, must } from '../context.ts';
import {
  AddPersonResult, Company, CompanyCreate, CompanyMember, CompanyMemberAdd, CompanyMemberUpdate, CompanyUpdate,
  IdParam, MemberParams, Role, RoleCreate, RoleIds, RoleUpdate, RoleWithUsage,
} from '../schemas.ts';
import { body, errors, ok, send, profileFields, rolesByUser, router, secured, setRoles } from './common.ts';

export const companies = router();
const tags = ['Companies'];
const people = ['Company people'];

// deno-lint-ignore no-explicit-any
async function adminCompanyIds(db: any, userId: string) {
  const rows = must<{ company_id: string; is_admin: boolean }[]>(
    await db.from('company_members').select('company_id, is_admin').eq('user_id', userId));
  return new Set(rows.filter((r) => r.is_admin).map((r) => r.company_id));
}

companies.openapi(createRoute({
  method: 'get', path: '/companies', tags, security: secured,
  summary: 'Companies you belong to',
  responses: { 200: ok(z.array(Company)), 401: errors[401] },
}), async (c) => {
  const { db, userId } = await authed(c);
  const [rows, admin] = await Promise.all([db.from('companies').select('*').order('name'), adminCompanyIds(db, userId)]);
  return send(c, must(rows)
    .map((r: { id: string }) => ({ ...r, is_admin: admin.has(r.id as string) })), 200);
});

companies.openapi(createRoute({
  method: 'post', path: '/companies', tags, security: secured,
  summary: 'Create a company',
  description: 'You become its first admin.',
  request: body(CompanyCreate),
  responses: { 201: ok(Company, 'Created'), 400: errors[400], 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const b = c.req.valid('json');
  const row = must(await db.from('companies')
    .insert({ name: b.name, description: b.description || null }).select('*').single());
  return send(c, { ...row, is_admin: true }, 201);
});

companies.openapi(createRoute({
  method: 'get', path: '/companies/{id}', tags, security: secured,
  summary: 'One company',
  request: { params: IdParam },
  responses: { 200: ok(Company), 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db, userId } = await authed(c);
  const { id } = c.req.valid('param');
  const [row, admin] = await Promise.all([db.from('companies').select('*').eq('id', id).single(), adminCompanyIds(db, userId)]);
  return send(c, { ...must<object>(row), is_admin: admin.has(id) }, 200);
});

companies.openapi(createRoute({
  method: 'patch', path: '/companies/{id}', tags, security: secured,
  summary: 'Rename or describe a company (admins)',
  request: { params: IdParam, ...body(CompanyUpdate) },
  responses: { 200: ok(Company), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const b = c.req.valid('json');
  const patch: Record<string, unknown> = {};
  if (b.name !== undefined) patch.name = b.name;
  if (b.description !== undefined) patch.description = b.description || null;
  const row = found(must(await db.from('companies').update(patch).eq('id', id).select('*')));
  return send(c, { ...row, is_admin: true }, 200);
});

companies.openapi(createRoute({
  method: 'delete', path: '/companies/{id}', tags, security: secured,
  summary: 'Delete a company and everything in it (admins)',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('companies').delete().eq('id', id).select('id')));
  return c.body(null, 204);
});

companies.openapi(createRoute({
  method: 'get', path: '/companies/{id}/roles', tags: ['Roles'], security: secured,
  summary: 'Roles available in a company',
  description: 'The standard film roles plus the company\'s custom roles, standard ones first, each with how many people hold it.',
  request: { params: IdParam },
  responses: { 200: ok(z.array(RoleWithUsage)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const [r, u] = await Promise.all([
    db.from('roles').select('*').or(`company_id.is.null,company_id.eq.${id}`),
    db.rpc('role_usage', { cid: id }),
  ]);
  const rows = must<{ id: string; company_id: string | null; sort_order: number; name: string }[]>(r);
  const usage = new Map(must<{ role_id: string; people: number }[]>(u).map((x) => [x.role_id, Number(x.people)]));
  rows.sort((a, b) => a.company_id === b.company_id
    ? a.sort_order - b.sort_order || a.name.localeCompare(b.name)
    : a.company_id === null ? -1 : 1);
  return send(c, rows.map((x) => ({ ...x, is_custom: x.company_id !== null, people: usage.get(x.id) ?? 0 })), 200);
});

companies.openapi(createRoute({
  method: 'post', path: '/companies/{id}/roles', tags: ['Roles'], security: secured,
  summary: 'Add a custom role (admins)',
  description: 'Custom roles sit alongside the standard film roles. The name must not match a standard role or another custom role in the company.',
  request: { params: IdParam, ...body(RoleCreate) },
  responses: { 201: ok(RoleWithUsage, 'Created'), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const b = c.req.valid('json');
  const row = must<object>(await db.from('roles')
    .insert({ company_id: id, name: b.name, department: b.department ?? null, description: b.description ?? null })
    .select('*').single());
  return send(c, { ...row, is_custom: true, people: 0 }, 201);
});

companies.openapi(createRoute({
  method: 'patch', path: '/roles/{id}', tags: ['Roles'], security: secured,
  summary: 'Rename or describe a custom role (admins)',
  description: 'Standard roles can\'t be changed.',
  request: { params: IdParam, ...body(RoleUpdate) },
  responses: { 200: ok(Role), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const b = c.req.valid('json');
  const patch: Record<string, unknown> = {};
  for (const k of ['name', 'department', 'description'] as const) if (b[k] !== undefined) patch[k] = b[k];
  return send(c, found(must(await db.from('roles').update(patch).eq('id', id).not('company_id', 'is', null).select('*'))), 200);
});

companies.openapi(createRoute({
  method: 'delete', path: '/roles/{id}', tags: ['Roles'], security: secured,
  summary: 'Delete a custom role (admins)',
  description: 'Also removes the role from everyone who holds it, in the company and on its projects. Standard roles can\'t be deleted.',
  request: { params: IdParam },
  responses: { 204: { description: 'Deleted' }, 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  found(must(await db.from('roles').delete().eq('id', id).not('company_id', 'is', null).select('id')));
  return c.body(null, 204);
});

// ---- People -----------------------------------------------------------------

companies.openapi(createRoute({
  method: 'get', path: '/companies/{id}/members', tags: people, security: secured,
  summary: 'People in a company',
  request: { params: IdParam },
  responses: { 200: ok(z.array(CompanyMember)), 401: errors[401] },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const [m, r] = await Promise.all([
    db.from('company_members').select('*').eq('company_id', id),
    db.from('company_member_roles').select('user_id, role_id').eq('company_id', id),
  ]);
  const members = must<{ user_id: string }[]>(m);
  const roles = rolesByUser(must(r));
  const ids = members.map((x) => x.user_id);
  const profiles = ids.length ? must<{ id: string }[]>(await db.from('profiles').select(profileFields).in('id', ids)) : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return send(c, members.map(({ user_id, ...rest }) => ({
    user_id, ...rest, profile: byId.get(user_id) ?? { id: user_id, full_name: null, nickname: null, email: null, phone: null, has_account: true },
    role_ids: roles.get(user_id) ?? [],
  })), 200);
});

companies.openapi(createRoute({
  method: 'post', path: '/companies/{id}/members', tags: people, security: secured,
  summary: 'Add someone to a company by email (admins)',
  description: 'Someone with an account is added straight away. For an email nobody has signed up with yet, give their name (and phone): they are added now, without an account, and join when they sign up with that email.',
  request: { params: IdParam, ...body(CompanyMemberAdd) },
  responses: {
    201: ok(AddPersonResult, 'Added, invited (no account yet), or already a member'),
    400: errors[400], 401: errors[401],
  },
}), async (c) => {
  const { db } = await authed(c);
  const { id } = c.req.valid('param');
  const b = c.req.valid('json');
  const { data, error } = await db.rpc('add_company_person', {
    cid: id, member_email: b.email, member_name: b.name ?? null, member_phone: b.phone ?? null,
    make_admin: b.is_admin ?? false, member_title: b.title ?? null,
  });
  if (error) fail({ ...error, code: 'P0001' });
  return send(c, data as z.infer<typeof AddPersonResult>, 201);
});

companies.openapi(createRoute({
  method: 'patch', path: '/companies/{id}/members/{userId}', tags: people, security: secured,
  summary: 'Change someone\'s title or admin rights (admins)',
  request: { params: MemberParams, ...body(CompanyMemberUpdate) },
  responses: { 200: ok(z.object({ user_id: z.uuid(), is_admin: z.boolean(), title: z.string().nullable() })), 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, userId } = c.req.valid('param');
  const b = c.req.valid('json');
  const patch: Record<string, unknown> = {};
  if (b.is_admin !== undefined) patch.is_admin = b.is_admin;
  if (b.title !== undefined) patch.title = b.title || null;
  const row = found(must<{ user_id: string; is_admin: boolean; title: string | null }[]>(await db.from('company_members')
    .update(patch).match({ company_id: id, user_id: userId }).select('user_id, is_admin, title')));
  return send(c, row, 200);
});

companies.openapi(createRoute({
  method: 'delete', path: '/companies/{id}/members/{userId}', tags: people, security: secured,
  summary: 'Remove someone from a company (admins), or leave it yourself',
  description: 'They are also removed from all of the company\'s projects.',
  request: { params: MemberParams },
  responses: { 204: { description: 'Removed' }, 400: errors[400], 401: errors[401], 404: errors[404] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, userId } = c.req.valid('param');
  found(must(await db.from('company_members').delete().match({ company_id: id, user_id: userId }).select('user_id')));
  return c.body(null, 204);
});

companies.openapi(createRoute({
  method: 'put', path: '/companies/{id}/members/{userId}/roles', tags: people, security: secured,
  summary: 'Set someone\'s company roles (admins)',
  description: 'Replaces their company roles with exactly this list.',
  request: { params: MemberParams, ...body(RoleIds) },
  responses: { 200: ok(RoleIds), 400: errors[400], 401: errors[401], 403: errors[403] },
}), async (c) => {
  const { db } = await authed(c);
  const { id, userId } = c.req.valid('param');
  const { role_ids } = c.req.valid('json');
  const error = await setRoles(db, 'company_member_roles', { company_id: id, user_id: userId }, role_ids);
  if (error) fail(error);
  return send(c, { role_ids }, 200);
});

