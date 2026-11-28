// Checks the Help pages: every /help link and every {{shots}} screenshot points at something that exists.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
const root = new URL('../help/', import.meta.url);
const pages = readdirSync(root).flatMap((s) => readdirSync(new URL(`${s}/`, root)).filter((f) => f.endsWith('.md')).map((f) => `${s}/${f}`));
const slug = (t) => t.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const anchors = Object.fromEntries(pages.map((p) => [p.replace(/\.md$/, ''), (readFileSync(new URL(p, root), 'utf8').match(/^## (.+)$/gm) ?? []).map((h) => slug(h.slice(3)))]));
const problems = [];
for (const p of pages) {
  const md = readFileSync(new URL(p, root), 'utf8');
  if (!/^---\ntitle: .+\nsummary: .+\norder: \d+\n---\n/.test(md)) problems.push(`${p}: header needs title, summary and order`);
  for (const [, link] of md.matchAll(/\]\((\/help[^)\s]*)\)/g)) {
    const [path, hash] = link.split('#');
    if (path === '/help') continue;
    const key = path.replace(/^\/help\//, '');
    if (!anchors[key]) problems.push(`${p}: link to missing page ${link}`);
    else if (hash && !anchors[key].includes(hash)) problems.push(`${p}: link to missing section ${link}`);
  }
  for (const [, name] of md.matchAll(/^\{\{shots ([\w-]+)\}\}$/gm))
    for (const d of ['ipad', 'phone'])
      if (!existsSync(new URL(`../public/help/img/${name}-${d}.jpg`, import.meta.url))) problems.push(`${p}: missing screenshot ${name}-${d}.jpg`);
}
for (const [, page] of readFileSync(new URL('../src/help/BigPicture.tsx', import.meta.url), 'utf8').matchAll(/page: '([^']+)'/g))
  if (!anchors[page]) problems.push(`BigPicture.tsx: box links to missing page ${page}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`Help: ${pages.length} pages, links and screenshots OK`);
