// Supabase Edge Function entry point. Deployed as the function "api", so requests
// arrive with paths like /api/companies.
import { createApp } from './app.ts';

const app = createApp({
  basePath: '/api',
  supabaseUrl: Deno.env.get('SUPABASE_URL')!,
  supabaseKey: Deno.env.get('SUPABASE_ANON_KEY')!,
});

Deno.serve(app.fetch);
