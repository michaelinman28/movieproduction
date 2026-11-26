import { useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import type { LinkState } from './backLink';

/**
 * After adding something, its form opens; bring it into view. On a phone (one column)
 * the form sits below the table, so scroll down to its top; on wider screens it's beside
 * the table, so scroll only as far as needed. Panels mark themselves with data-form-for="<id>".
 */
export function scrollToForm(id: string) {
  setTimeout(() => {
    const el = document.querySelector(`[data-form-for="${CSS.escape(id)}"]`);
    if (!el) return;
    const wide = window.matchMedia('(min-width: 1024px)').matches;
    el.scrollIntoView({ behavior: 'smooth', block: wide ? 'nearest' : 'start' });
  }, 150);
}

/**
 * Opens the item a link points at (?open=<id>, see itemPath in src/lib/links.ts) once
 * it has loaded: `has` says whether the page has that item yet, `open` selects it,
 * highlights its row and opens its form (as after adding it). The parameter is then
 * taken off the address, so reloading doesn't reopen it. Going back to a page an item
 * link was followed from reopens the form that was open there (`reopen` in the history
 * state, set by linkOut in src/lib/backLink.ts); the rest of the history state, such as
 * the page's own "Back to …", is kept.
 */
export function useOpenFromLink(has: (id: string) => boolean, open: (id: string) => void, param = 'open') {
  const [params, setParams] = useSearchParams();
  const state = useLocation().state as LinkState;
  const id = params.get(param) ?? (param === 'open' ? state?.reopen ?? null : null);
  const ready = !!id && has(id);
  useEffect(() => {
    if (!id || !ready) return;
    open(id);
    const next = new URLSearchParams(params);
    next.delete(param);
    setParams(next, { replace: true, state: state ? { ...state, reopen: undefined } : state });
  }, [id, ready]); // eslint-disable-line react-hooks/exhaustive-deps
}
