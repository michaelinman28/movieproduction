// Run the API locally on Node: npm run api   (Swagger at http://localhost:8787/docs)
import { serve } from '@hono/node-server';
import { loadEnv } from 'vite';
import { createApp } from '../supabase/functions/api/app.ts';

const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const supabaseKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local (see .env.example).');
  process.exit(1);
}

const port = Number(env.API_PORT || 8787);
serve({ fetch: createApp({ supabaseUrl, supabaseKey }).fetch, port }, () => {
  console.log(`Movie Production API on http://localhost:${port}  (Swagger: http://localhost:${port}/docs)`);
});
