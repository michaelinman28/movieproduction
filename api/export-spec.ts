// Write the OpenAPI spec to api/openapi.json: npm run api:spec
import { writeFileSync } from 'node:fs';
import { createApp } from '../supabase/functions/api/app.ts';

const app = createApp({ supabaseUrl: 'https://example.supabase.co', supabaseKey: 'unused' });
const res = await app.request('http://localhost:8787/openapi.json');
const spec = await res.json();
spec.servers = [
  { url: 'https://qixblelhruxdzxfaeamz.supabase.co/functions/v1/api', description: 'Live (Supabase Edge Function)' },
  { url: 'http://localhost:8787', description: 'Local (npm run api)' },
];
writeFileSync('api/openapi.json', JSON.stringify(spec, null, 2) + '\n');
console.log(`Wrote api/openapi.json (${Object.keys(spec.paths).length} paths)`);
