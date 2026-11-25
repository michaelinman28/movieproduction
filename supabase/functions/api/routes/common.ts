import { OpenAPIHono, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { must, type Env } from '../context.ts';
import { Error } from '../schemas.ts';

export const router = () => new OpenAPIHono<Env>();

export const body = <T extends z.ZodType>(schema: T) => ({
  body: { required: true, content: { 'application/json': { schema } } },
});

export const ok = <T extends z.ZodType>(schema: T, description = 'OK') => ({
  content: { 'application/json': { schema } },
  description,
});

const err = (description: string) => ({ content: { 'application/json': { schema: Error } }, description });

export const errors = {
  400: err('Invalid request, or a rule in the database refused it'),
  401: err('Missing or expired access token'),
  403: err('You do not have permission'),
  404: err('Not found, or you do not have access'),
};

export const secured = [{ bearerAuth: [] }];

/** Group role ids by user id from *_member_roles rows. */
export function rolesByUser(rows: { user_id: string; role_id: string }[] | null) {
  const map = new Map<string, string[]>();
  for (const r of rows ?? []) map.set(r.user_id, [...(map.get(r.user_id) ?? []), r.role_id]);
  return map;
}

export const profileFields = 'id, full_name, nickname, email, phone, has_account';

/** Attach each note's author profile (from author_id). */
// deno-lint-ignore no-explicit-any
export async function withAuthors<T extends { author_id: string }>(db: any, notes: T[]) {
  const ids = [...new Set(notes.map((n) => n.author_id))];
  // deno-lint-ignore no-explicit-any
  const profiles: any[] = ids.length ? must(await db.from('profiles').select(profileFields).in('id', ids)) : [];
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return notes.map((n) => ({ ...n, author: byId.get(n.author_id) ?? { id: n.author_id, full_name: null, nickname: null, email: null, phone: null, has_account: true } }));
}

/** Replace the role set of a member: deletes the ones not listed and inserts the new ones. */
export async function setRoles(
  // deno-lint-ignore no-explicit-any
  db: any, table: 'company_member_roles' | 'project_member_roles', key: Record<string, string>, roleIds: string[],
) {
  const current = await db.from(table).select('role_id').match(key);
  if (current.error) return current.error;
  const have = new Set<string>(current.data.map((r: { role_id: string }) => r.role_id));
  const want = new Set(roleIds);
  const remove = [...have].filter((id) => !want.has(id));
  const add = [...want].filter((id) => !have.has(id));
  if (remove.length) {
    const r = await db.from(table).delete().match(key).in('role_id', remove);
    if (r.error) return r.error;
  }
  if (add.length) {
    const r = await db.from(table).insert(add.map((role_id) => ({ ...key, role_id })));
    if (r.error) return r.error;
  }
  return null;
}

/** Send JSON. The route's OpenAPI schema documents the shape; rows from the
 * untyped Supabase client can't be checked against it at compile time. */
// deno-lint-ignore no-explicit-any
export const send = (c: Context, data: unknown, status: 200 | 201 = 200): any => c.json(data as never, status);
