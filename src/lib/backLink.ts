import type { NavigateFunction } from 'react-router-dom';

/**
 * "Back to …" after following an item link (see itemPath in src/lib/links.ts).
 *
 * When an item link is followed (a scene on a shoot day, a character on a scene, a
 * location on a task…), the page it came from is remembered in the new page's history
 * state: its address, the item whose form was open there, and a label ("Scene 3").
 * BackLink (src/components/BackLink.tsx) shows "‹ Back to Scene 3" at the top of the
 * page, and going back (that link or the browser's Back) reopens the form that was open.
 * History state survives a reload, and each step keeps the one before it, so a chain of
 * link-outs walks back one step at a time.
 *
 * Pages take part by marking their item form with data-form-for="<id>" and
 * data-form-label="<what to call it>"; useOpenFromLink (src/lib/reveal.ts) reopens it.
 * A page with no form open is named by data-page-label, or by its address.
 */
export type BackTo = { url: string; label: string; idx?: number; back?: BackTo };
export type LinkState = { back?: BackTo; reopen?: string } | null | undefined;

const MAX_STEPS = 10;
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** An in-app address without the app's base path, e.g. "/projects/1/scenes?open=2". */
export function appRelative(href: string): string | null {
  let u: URL;
  try { u = new URL(href, window.location.href); } catch { return null; }
  if (u.origin !== window.location.origin) return null;
  const path = base && u.pathname.startsWith(base) ? u.pathname.slice(base.length) || '/' : u.pathname;
  return path + u.search + u.hash;
}

/** Links to an item's home page (itemPath) or a call sheet; plain page navigation isn't. */
export function isItemLink(to: string): boolean {
  const u = new URL(to, 'http://x');
  return u.searchParams.has('open') || u.searchParams.has('person') || /\/shoot-days\/[^/]+\/?$/.test(u.pathname);
}

const PAGE_NAMES: [RegExp, string][] = [
  [/^\/projects\/[^/]+\/tasks/, 'Tasks'],
  [/^\/projects\/[^/]+\/scenes/, 'Scenes'],
  [/^\/projects\/[^/]+\/characters/, 'Characters'],
  [/^\/projects\/[^/]+\/elements/, 'Elements'],
  [/^\/projects\/[^/]+\/shoot-days\/[^/]+/, 'Call sheet'],
  [/^\/projects\/[^/]+\/shoot-days/, 'Shoot days'],
  [/^\/projects\/[^/]+\/locations/, 'Locations'],
  [/^\/projects\/[^/]+\/team/, 'Team'],
  [/^\/projects\/[^/]+\/notes/, 'Project notes'],
  [/^\/projects\/[^/]+\/activity/, 'Activity'],
  [/^\/projects\/[^/]+\/?$/, 'Overview'],
  [/^\/companies\/[^/]+\/roles/, 'Roles'],
  [/^\/companies\/[^/]+\/task-settings/, 'Task settings'],
  [/^\/companies\/[^/]+\/activity/, 'Activity'],
  [/^\/companies\/[^/]+\/?$/, 'Company'],
  [/^\/profile/, 'Profile'],
  [/^\/?$/, 'Companies'],
];

function pageLabel(path: string) {
  const own = document.querySelector<HTMLElement>('[data-page-label]')?.dataset.pageLabel;
  return own || PAGE_NAMES.find(([re]) => re.test(path))?.[1] || 'previous page';
}

/** The item form a link sits in (outermost), else the page's open item form. */
function openForm(from: Element | null): HTMLElement | null {
  let el = from?.closest<HTMLElement>('[data-form-label]') ?? null;
  while (el?.parentElement?.closest('[data-form-label]')) el = el.parentElement.closest<HTMLElement>('[data-form-label]');
  return el ?? document.querySelector<HTMLElement>('main [data-form-label]');
}

type RouterHistoryState = { usr?: LinkState; idx?: number; key?: string } | null;

/** Follow an item link, remembering where it was followed from. */
export function linkOut(navigate: NavigateFunction, to: string, from: Element | null) {
  const hist = window.history.state as RouterHistoryState;
  const here = hist?.usr ?? null;
  const loc = window.location;
  const path = (base && loc.pathname.startsWith(base) ? loc.pathname.slice(base.length) : loc.pathname) || '/';
  const form = openForm(from);
  const id = form?.dataset.formFor;
  const params = new URLSearchParams(loc.search);
  params.delete('open');
  params.delete('person');
  if (id) params.set('open', id);
  const qs = params.toString();
  const back: BackTo = {
    url: path + (qs ? `?${qs}` : ''),
    label: form?.dataset.formLabel || pageLabel(path),
    idx: hist?.idx,
    back: trim(here?.back, MAX_STEPS - 1),
  };
  // Mark this history entry so the browser's Back button reopens the same form too.
  if (hist) window.history.replaceState({ ...hist, usr: { ...(here ?? {}), reopen: id } }, '');
  navigate(to, { state: { back } satisfies LinkState });
}

function trim(b: BackTo | undefined, steps: number): BackTo | undefined {
  if (!b || steps <= 0) return undefined;
  return { ...b, back: trim(b.back, steps - 1) };
}

/** Go back one step: the browser's own Back when that's where we came from, else to the address. */
export function goBack(navigate: NavigateFunction, back: BackTo) {
  const idx = (window.history.state as RouterHistoryState)?.idx;
  if (back.idx != null && idx === back.idx + 1) navigate(-1);
  else navigate(back.url, { state: { back: back.back } satisfies LinkState });
}
