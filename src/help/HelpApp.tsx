import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { marked } from 'marked';
import { ThemeSwitch } from '../components/ThemeSwitch';
import { Section } from '../components/Section';
import { PreviewBanner } from '../components/PreviewBanner';
import { findPage, helpSections, readingOrder, searchHelp, type HelpPage } from './content';
import { BigPicture } from './BigPicture';

/** Blocks a help page can place with a line that is only `{{name}}`. */
const BLOCKS: Record<string, () => ReactNode> = {
  'big-picture': () => <BigPicture />,
};

const appHome = import.meta.env.BASE_URL;

/**
 * The Help pages at /help: public (no sign-in), with their own top bar, a sidebar of
 * sections and pages, and search. Content comes from the Markdown files in `help/`.
 */
export default function HelpApp({ signedIn }: { signedIn: boolean }) {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <PreviewBanner />
      <header className="no-print sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface px-4 py-1">
        <Link to="/help" className="mr-auto flex min-h-11 min-w-0 shrink items-center gap-2 font-bold text-fg no-underline">
          <span className="truncate">Movie Production</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-sm font-semibold text-accent-strong">Help</span>
        </Link>
        <a href={appHome} className="btn-link shrink-0 whitespace-nowrap text-sm">{signedIn ? 'Back to the app' : 'Sign in'}</a>
        <ThemeSwitch />
      </header>
      <ScrollToTarget />
      <div className="mx-auto flex w-full max-w-screen-xl flex-col gap-6 px-4 py-6 md:flex-row md:py-8">
        <HelpNav />
        <main className="min-w-0 flex-1">
          <Routes>
            <Route path="/help" element={<HelpHome />} />
            <Route path="/help/:section/:slug" element={<HelpPageView />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

/** Opens at the top of a new page, or at the section a link points to. */
function ScrollToTarget() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }));
  }, [pathname, hash]);
  return null;
}

/** Sections and pages: a sidebar from iPad width up, a menu that opens on phones. */
function HelpNav() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const current = readingOrder.find((p) => p.path === pathname);
  const list = (
    <nav aria-label="Help pages" className="flex flex-col gap-4">
      <NavLink to="/help" end className={({ isActive }) => `help-nav-link font-semibold ${isActive ? 'help-nav-active' : ''}`}>Help home</NavLink>
      {helpSections.map((s) => (
        <div key={s.slug}>
          <p className="m-0 mb-1 px-2 text-xs font-semibold tracking-wide text-muted uppercase">{s.title}</p>
          <ul className="m-0 flex list-none flex-col p-0">
            {s.pages.map((p) => (
              <li key={p.slug}>
                <NavLink to={p.path} className={({ isActive }) => `help-nav-link ${isActive ? 'help-nav-active' : ''}`}>{p.title}</NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
  return (
    <aside className="no-print md:sticky md:top-20 md:max-h-[calc(100dvh-6rem)] md:w-60 md:shrink-0 md:overflow-y-auto">
      <div className="md:hidden">
        <button type="button" className="btn btn-secondary flex w-full items-center justify-between" aria-expanded={open} onClick={() => setOpen(!open)}>
          <span className="truncate">{current ? current.title : 'Help pages'}</span>
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {open && <div className="mt-2 rounded-xl border border-line bg-surface p-3">{list}</div>}
      </div>
      <div className="hidden md:block">{list}</div>
    </aside>
  );
}

/** The search box: results list under it as you type; Enter opens the best one. */
function HelpSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const navigate = useNavigate();
  const hits = useMemo(() => searchHelp(q, 8), [q]);
  const go = (to: string) => { setQ(''); navigate(to); };
  return (
    <div className="relative" role="search">
      <label className="label">
        <span className="sr-only">Search help</span>
        <input
          className="field" type="search" placeholder="Search help, e.g. call sheet link" value={q} autoFocus={autoFocus}
          aria-controls="help-search-results" aria-autocomplete="list"
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); go(hits[active].to); }
            else if (e.key === 'Escape') setQ('');
          }}
        />
      </label>
      {q.trim() && (
        <div id="help-search-results" className="help-results">
          {hits.length === 0 ? (
            <p className="m-0 p-3 text-sm text-muted">Nothing found for “{q.trim()}”. Try a shorter word, such as “call” or “invite”.</p>
          ) : (
            <ul className="m-0 list-none p-1">
              {hits.map((h, i) => (
                <li key={h.to}>
                  <Link to={h.to} onClick={() => setQ('')} className={`help-result ${i === active ? 'help-result-active' : ''}`} onMouseEnter={() => setActive(i)}>
                    <span className="font-semibold text-fg">{h.title}</span>
                    <span className="text-sm text-muted">{h.snippet}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function HelpHome() {
  useTitle('Help');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1>Help</h1>
        <p className="text-muted">How every part of Movie Production works, and how the parts work together. Start with the guide for you, or search.</p>
      </div>
      <HelpSearch autoFocus={window.matchMedia?.('(pointer: fine)').matches} />
      <div className="grid gap-3 sm:grid-cols-2">
        <StartCard to="/help/getting-started/quick-start-producers" title="I run a production" text="Set up your company, people and first project, then send a call sheet." />
        <StartCard to="/help/getting-started/quick-start-crew" title="I’m on the crew" text="Find your tasks, your scenes and your call for each day." />
        <StartCard to="/help/getting-started/your-call-sheet-link" title="I got a call sheet link" text="Read your call sheet, confirm it, and print it. No account needed." />
        <StartCard to="/help/getting-started/joining-a-production" title="I was invited" text="Create your account with the email you were invited at." />
      </div>
      {helpSections.map((s) => (
        <Section key={s.slug} id={`help.home.${s.slug}`} title={s.title} summary={`${s.pages.length} ${s.pages.length === 1 ? 'page' : 'pages'}`}>
          <p className="mt-0 mb-2 text-muted">{s.summary}</p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {s.pages.map((p) => (
              <li key={p.slug}><Link to={p.path} className="font-semibold">{p.title}</Link>{p.summary && <span className="text-muted"> · {p.summary}</span>}</li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

function StartCard({ to, title, text }: { to: string; title: string; text: string }) {
  return (
    <Link to={to} className="card no-underline hover:border-accent">
      <span className="text-lg font-semibold text-fg">{title}</span>
      <span className="text-muted">{text}</span>
    </Link>
  );
}

function HelpPageView() {
  const { section, slug } = useParams();
  const page = findPage(section, slug);
  const { hash } = useLocation();
  useTitle(page ? page.title : 'Page not found');
  if (!page) return <NotFound />;
  // A link to one section opens it, even if it was closed on this device.
  const target = hash.slice(1);
  if (target) { try { localStorage.removeItem(`mp-collapsed:help.${page.section}.${page.slug}.${target}`); } catch { /* storage unavailable */ } }
  const sectionTitle = helpSections.find((s) => s.slug === page.section)?.title;
  const i = readingOrder.indexOf(page);
  const prev = readingOrder[i - 1], next = readingOrder[i + 1];
  return (
    <article key={page.path + hash} className="flex flex-col gap-4">
      <div className="no-print"><HelpSearch /></div>
      <div>
        <p className="m-0 text-sm text-muted">{sectionTitle}</p>
        <h1 className="mt-1">{page.title}</h1>
      </div>
      {page.intro && <Markdown source={page.intro} />}
      {page.parts.map((part) => (
        <div key={part.id} id={part.id} className="scroll-mt-20">
          <Section id={`help.${page.section}.${page.slug}.${part.id}`} title={part.title}>
            <Markdown source={part.markdown} />
          </Section>
        </div>
      ))}
      <nav aria-label="More help" className="no-print mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        {prev ? <PageLink page={prev} label="Previous" /> : <span />}
        {next && <PageLink page={next} label="Next" alignEnd />}
      </nav>
    </article>
  );
}

function PageLink({ page, label, alignEnd = false }: { page: HelpPage; label: string; alignEnd?: boolean }) {
  return (
    <Link to={page.path} className={`card gap-1 no-underline hover:border-accent ${alignEnd ? 'sm:text-right' : ''}`}>
      <span className="text-sm text-muted">{label}</span>
      <span className="font-semibold">{page.title}</span>
    </Link>
  );
}

/**
 * Markdown from the help files. Links inside /help move without reloading; links into
 * the app (any other path on this site) open it in the same tab; links to other sites
 * open in a new tab.
 */
function Markdown({ source }: { source: string }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const chunks = useMemo(() => source.split(/^\{\{([\w-]+)\}\}$/m), [source]);
  useEffect(() => {
    ref.current?.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => {
      if (a.origin !== window.location.origin) { a.target = '_blank'; a.rel = 'noopener'; }
    });
  }, [chunks]);
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('/help')) { e.preventDefault(); navigate(href); }
  };
  return (
    <div ref={ref} className="help-prose" onClick={onClick}>
      {chunks.map((c, i) => {
        if (i % 2 === 1) return BLOCKS[c] ? <div key={i} className="my-4">{BLOCKS[c]()}</div> : null;
        return c.trim() ? <div key={i} dangerouslySetInnerHTML={{ __html: marked.parse(c, { async: false }) as string }} /> : null;
      })}
    </div>
  );
}

function NotFound() {
  useTitle('Page not found');
  return (
    <div className="card max-w-lg">
      <h1 className="text-xl">That help page isn’t here</h1>
      <p className="m-0 text-muted">It may have moved. Search for it, or start from the Help home page.</p>
      <HelpSearch />
      <p className="m-0"><Link to="/help">Help home</Link></p>
    </div>
  );
}

function useTitle(title: string) {
  useEffect(() => { document.title = `${title} · Movie Production Help`; }, [title]);
}
