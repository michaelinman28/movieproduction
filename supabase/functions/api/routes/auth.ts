import { createRoute } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import { anonClient, authed, must } from '../context.ts';
import { Profile, ProfileUpdate, Session, SignIn, SignUp } from '../schemas.ts';
import { body, errors, ok, send, profileFields, router, secured } from './common.ts';
import { z } from '@hono/zod-openapi';

export const auth = router();

const toSession = (s: { access_token: string; refresh_token: string; expires_at?: number; user: { id: string; email?: string } }) => ({
  access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at,
  user: { id: s.user.id, email: s.user.email ?? null },
});

auth.openapi(createRoute({
  method: 'post', path: '/auth/signup', tags: ['Account'],
  summary: 'Create an account',
  description: 'People create their own account. A confirmation email is sent; they can sign in once they confirm it. A company admin then adds them to the company by this email.',
  request: body(SignUp),
  responses: { 201: ok(z.object({ user_id: z.uuid(), confirmation_required: z.boolean(), session: Session.nullable() }), 'Account created'), 400: errors[400] },
}), async (c) => {
  const b = c.req.valid('json');
  const { data, error } = await anonClient(c).auth.signUp({
    email: b.email, password: b.password,
    options: { data: { full_name: b.full_name, phone: b.phone ?? '' }, emailRedirectTo: b.redirect_to },
  });
  if (error) throw new HTTPException(400, { message: error.message });
  return send(c, {
    user_id: data.user!.id,
    confirmation_required: !data.session,
    session: data.session ? toSession(data.session) : null,
  }, 201);
});

auth.openapi(createRoute({
  method: 'post', path: '/auth/signin', tags: ['Account'],
  summary: 'Sign in with email and password',
  description: 'Returns an access token. In Swagger, click Authorize and paste the access_token to try the other endpoints.',
  request: body(SignIn),
  responses: { 200: ok(Session), 401: errors[401] },
}), async (c) => {
  const b = c.req.valid('json');
  const { data, error } = await anonClient(c).auth.signInWithPassword(b);
  if (error || !data.session) throw new HTTPException(401, { message: error?.message ?? 'Sign-in failed' });
  return send(c, toSession(data.session), 200);
});

auth.openapi(createRoute({
  method: 'post', path: '/auth/refresh', tags: ['Account'],
  summary: 'Get a new access token from a refresh token',
  request: body(z.object({ refresh_token: z.string() }).openapi('RefreshRequest')),
  responses: { 200: ok(Session), 401: errors[401] },
}), async (c) => {
  const { refresh_token } = c.req.valid('json');
  const { data, error } = await anonClient(c).auth.refreshSession({ refresh_token });
  if (error || !data.session) throw new HTTPException(401, { message: error?.message ?? 'Refresh failed' });
  return send(c, toSession(data.session), 200);
});

auth.openapi(createRoute({
  method: 'get', path: '/me', tags: ['Account'], security: secured,
  summary: 'Your profile',
  responses: { 200: ok(Profile), 401: errors[401] },
}), async (c) => {
  const { db, userId } = await authed(c);
  return send(c, must(await db.from('profiles').select(profileFields).eq('id', userId).single()), 200);
});

auth.openapi(createRoute({
  method: 'patch', path: '/me', tags: ['Account'], security: secured,
  summary: 'Update your name or phone number',
  request: body(ProfileUpdate),
  responses: { 200: ok(Profile), 400: errors[400], 401: errors[401] },
}), async (c) => {
  const { db, userId } = await authed(c);
  const b = c.req.valid('json');
  const patch: Record<string, unknown> = {};
  if (b.full_name !== undefined) patch.full_name = b.full_name;
  if (b.phone !== undefined) patch.phone = b.phone || null;
  return send(c, must(await db.from('profiles').update(patch).eq('id', userId).select(profileFields).single()), 200);
});
