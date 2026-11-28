/**
 * The Help pages. Each page is a Markdown file under `help/<section>/<page>.md` at the
 * top of the repository, with a small header:
 *
 *   ---
 *   title: Quick start for producers
 *   summary: One line shown in lists and search results.
 *   order: 2
 *   ---
 *
 * Its `## ` headings become collapsible sections. A line that is only `{{name}}` puts the
 * matching React block there (see BLOCKS in HelpApp.tsx), e.g. `{{big-picture}}`.
 */

export type HelpPart = { id: string; title: string; markdown: string; text: string };
export type HelpPage = {
  section: string; slug: string; path: string;
  title: string; summary: string; order: number;
  intro: string; introText: string; parts: HelpPart[];
};
export type HelpSection = { slug: string; title: string; summary: string; pages: HelpPage[] };

/** The sections, in the order the sidebar lists them. A section shows once it has a page. */
const SECTIONS: Omit<HelpSection, 'pages'>[] = [
  { slug: 'getting-started', title: 'Getting started', summary: 'What the app does and the first steps for each kind of person.' },
  { slug: 'how-it-fits', title: 'How it all fits together', summary: 'How the parts connect, from setting up a company to a sent call sheet.' },
  { slug: 'company', title: 'Your company', summary: 'People, roles, task categories and the activity log.' },
  { slug: 'project', title: 'Your project', summary: 'Every page of a project, from tasks to call sheets.' },
  { slug: 'working', title: 'Working in the app', summary: 'Tables, forms, links and using the app on a phone or iPad.' },
  { slug: 'permissions', title: 'Who can see and change what', summary: 'What admins, project members and link holders can do.' },
  { slug: 'reference', title: 'Reference', summary: 'Glossary, questions and fixes, and what’s new.' },
];

const files = import.meta.glob('../../help/*/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Markdown to plain words, for search and snippets. */
export const plainText = (md: string) =>
  md
    .replace(/^\{\{[\w -]+\}\}$/gm, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/gm, ' ')
    .replace(/[`*_]/g, '')
    .replace(/[>#|]/g, ' ')
    .replace(/^\s*[-+]\s+/gm, ' ')
    .replace(/^\s*\d+\.\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function parse(path: string, raw: string): HelpPage {
  const [, section, slug] = path.match(/help\/([^/]+)\/([^/]+)\.md$/)!;
  const meta: Record<string, string> = {};
  let body = raw.replace(/\r\n/g, '\n');
  const head = body.match(/^---\n([\s\S]*?)\n---\n/);
  if (head) {
    for (const line of head[1].split('\n')) {
      const m = line.match(/^(\w+):\s*(.*)$/);
      if (m) meta[m[1]] = m[2].trim();
    }
    body = body.slice(head[0].length);
  }
  const chunks = body.split(/^## /m);
  const intro = chunks.shift()!.trim();
  const used = new Set<string>();
  const parts = chunks.map((chunk) => {
    const nl = chunk.indexOf('\n');
    const title = (nl < 0 ? chunk : chunk.slice(0, nl)).trim();
    const markdown = nl < 0 ? '' : chunk.slice(nl + 1).trim();
    let id = slugify(title) || 'part';
    while (used.has(id)) id += '-2';
    used.add(id);
    return { id, title, markdown, text: plainText(markdown) };
  });
  return {
    section, slug, path: `/help/${section}/${slug}`,
    title: meta.title || slug, summary: meta.summary || '', order: Number(meta.order) || 99,
    intro, introText: plainText(intro), parts,
  };
}

export const helpPages: HelpPage[] = Object.entries(files)
  .map(([path, raw]) => parse(path, raw))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

export const helpSections: HelpSection[] = SECTIONS
  .map((s) => ({ ...s, pages: helpPages.filter((p) => p.section === s.slug) }))
  .filter((s) => s.pages.length > 0);

export const findPage = (section?: string, slug?: string) =>
  helpPages.find((p) => p.section === section && p.slug === slug);

/** The pages in reading order, for "Next" and "Previous" links. */
export const readingOrder: HelpPage[] = helpSections.flatMap((s) => s.pages);

// ---- Search -----------------------------------------------------------------

export type HelpHit = { page: HelpPage; part?: HelpPart; to: string; title: string; snippet: string; score: number };

const words = (q: string) => q.toLowerCase().split(/[^a-z0-9#]+/).filter((w) => w.length > 0);

/** How well `text` matches the words: whole-word matches count more than parts of words. */
function weigh(text: string, ws: string[]) {
  const t = text.toLowerCase();
  let score = 0;
  for (const w of ws) {
    if (new RegExp(`\\b${w}\\b`).test(t)) score += 2;
    else if (new RegExp(`\\b${w}`).test(t)) score += 1;
  }
  return score;
}

function snippet(text: string, ws: string[]) {
  const t = text.toLowerCase();
  const at = ws.map((w) => t.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 50)) + 1);
  const cut = text.slice(start, start + 160);
  return (start > 0 ? '…' : '') + cut + (start + 160 < text.length ? '…' : '');
}

/** Every page and section whose words hold all the search words, best first. */
export function searchHelp(query: string, limit = 10): HelpHit[] {
  const ws = words(query);
  if (!ws.length) return [];
  const hits: HelpHit[] = [];
  for (const page of helpPages) {
    const pageWords = `${page.title} ${page.summary} ${page.introText}`;
    const blocks = [
      { part: undefined as HelpPart | undefined, heading: page.title, text: `${page.summary} ${page.introText}` },
      ...page.parts.map((part) => ({ part, heading: part.title, text: part.text })),
    ];
    for (const b of blocks) {
      const all = `${page.title} ${b.heading} ${b.text}`.toLowerCase();
      if (!ws.every((w) => all.includes(w))) continue;
      const score = weigh(page.title, ws) * 6 + weigh(b.heading, ws) * 4 + weigh(b.text, ws) + (b.part ? 0 : weigh(pageWords, ws) * 0.5);
      hits.push({
        page, part: b.part,
        to: b.part ? `${page.path}#${b.part.id}` : page.path,
        title: b.part ? `${page.title} › ${b.part.title}` : page.title,
        snippet: snippet(b.text || page.summary, ws),
        score,
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
