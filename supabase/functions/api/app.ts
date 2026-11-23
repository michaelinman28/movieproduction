import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import type { ApiConfig, Env } from './context.ts';
import { auth } from './routes/auth.ts';
import { companies } from './routes/companies.ts';
import { projects } from './routes/projects.ts';
import { tasks } from './routes/tasks.ts';
import { labels } from './routes/labels.ts';

export const API_VERSION = '0.1.0';

/** The Movie Production API. Runs on Supabase Edge Functions (index.ts) or Node (api/server.ts). */
export function createApp(config: ApiConfig) {
  const api = new OpenAPIHono<Env>({
    // Report request validation problems as { error } like every other failure.
    defaultHook: (result, c) => {
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
        return c.json({ error: issues.join('; ') }, 400);
      }
    },
  });

  api.use('*', cors({ origin: '*', allowHeaders: ['Authorization', 'Content-Type'], allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
  api.use('*', async (c, next) => { c.set('config', config); await next(); });

  api.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Something went wrong on the server' }, 500);
  });
  api.notFound((c) => c.json({ error: `No endpoint ${c.req.method} ${c.req.path}` }, 404));

  api.route('/', auth);
  api.route('/', companies);
  api.route('/', projects);
  api.route('/', tasks);
  api.route('/', labels);

  api.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http', scheme: 'bearer', bearerFormat: 'JWT',
    description: 'The access_token from POST /auth/signin',
  });

  const base = config.basePath ?? '';
  // Where browsers reach the API; on Supabase that includes the /functions/v1 prefix.
  const publicBase = (c: { req: { url: string } }) => config.publicUrl ?? new URL(c.req.url).origin + base;
  api.doc31('/openapi.json', (c) => ({
    openapi: '3.1.0',
    info: {
      title: 'Movie Production API',
      version: API_VERSION,
      description: 'Companies, projects, people and roles for running a movie production.\n\n'
        + '**To try it:** create an account with `POST /auth/signup` (or use one you have), call `POST /auth/signin`, '
        + 'then click **Authorize** and paste the `access_token`.\n\n'
        + 'Every request runs as the signed-in person, and the database\'s security rules decide what they can see and change.',
    },
    servers: [{ url: publicBase(c) }],
    tags: [
      { name: 'Account', description: 'Sign up, sign in and your profile' },
      { name: 'Companies' }, { name: 'Company people' }, { name: 'Roles' },
      { name: 'Projects' }, { name: 'Project team' },
      { name: 'Tasks', description: 'Tasks and sub-tasks in a project' },
      { name: 'Task notes', description: 'Any number of notes on a task' },
      { name: 'Task categories', description: 'Each company\'s list of task categories, set up by its admins' },
      { name: 'Task tags', description: 'Free-form task tags, shared across a company' },
    ],
  }));
  const docsUrl = config.publicUrl ? `${config.publicUrl}/openapi.json` : `${base}/openapi.json`;
  api.get('/docs', swaggerUI({ url: docsUrl, version: '5.34.1', persistAuthorization: true, title: 'Movie Production API' }));
  api.get('/', (c) => c.redirect(config.publicUrl ? `${config.publicUrl}/docs` : `${base}/docs`));

  if (!base) return api;
  return new OpenAPIHono<Env>().route(base, api);
}
