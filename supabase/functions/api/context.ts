import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';

export interface ApiConfig {
  /** Path the API is mounted under, e.g. '/api' on Supabase Edge Functions. */
  basePath?: string;
  /** Public address of the API, when it differs from the request URL (e.g. behind
   * Supabase's /functions/v1 prefix). Used for Swagger links and the spec's server. */
  publicUrl?: string;
  supabaseUrl: string;
  /** The project's publishable (anon) key. Never the secret key: the database's
   * row-level security decides what each caller can see and change. */
  supabaseKey: string;
}

export type Env = { Variables: { config: ApiConfig } };

/** A Supabase client with no signed-in user, for the sign-in endpoints. */
export function anonClient(c: Context<Env>): SupabaseClient {
  const { supabaseUrl, supabaseKey } = c.get('config');
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The caller's Supabase client and user id, from their Bearer access token. */
export async function authed(c: Context<Env>) {
  const header = c.req.header('Authorization') ?? '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HTTPException(401, { message: 'Sign in first: send an access token as "Authorization: Bearer <token>".' });
  const { supabaseUrl, supabaseKey } = c.get('config');
  const db = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HTTPException(401, { message: 'Your session has expired. Sign in again.' });
  return { db, userId: data.user.id };
}

interface DbError { message: string; code?: string; details?: string | null }

/** Turn a Supabase/Postgres error into an HTTP error with a sensible status. */
export function fail(error: DbError): never {
  const status =
    error.code === 'PGRST116' ? 404 // .single() found nothing
    : error.code === '42501' ? 403 // row-level security refused
    : error.code === '23505' ? 409 // duplicate
    : error.code === 'P0001' || error.code?.startsWith('22') || error.code?.startsWith('23') ? 400
    : 500;
  const message = status === 404 ? 'Not found, or you do not have access to it.'
    : status === 403 ? 'You do not have permission to do that.'
    : error.message;
  throw new HTTPException(status, { message });
}

/** Unwrap a Supabase result, failing on error. Rows are untyped here; the route's
 * OpenAPI response schema documents their shape. */
// deno-lint-ignore no-explicit-any
export function must<T = any>(res: { data: unknown; error: DbError | null }): T {
  if (res.error) fail(res.error);
  return res.data as T;
}

/** Fail with 404 when a row we expected isn't visible (e.g. update matched nothing). */
// deno-lint-ignore no-explicit-any
export function found<T = any>(rows: T[] | null): T {
  if (!rows || rows.length === 0) throw new HTTPException(404, { message: 'Not found, or you do not have permission to change it.' });
  return rows[0];
}
