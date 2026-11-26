import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Brings a row's form into view when it opens, on every page and screen size
 * (Michael, 2026-11-26). Forms open under their table, so on a phone or iPad they
 * would otherwise open off screen.
 *
 * It watches for a new `[data-form-for]` element in the page. Forms already there
 * when a page opens are left alone (an item link scrolls to its own form). While a
 * table cell is being edited, or a pick list is open, it waits until that's done, so
 * picking a value in another row isn't interrupted. A form already in view stays put.
 */
export function FormScroller() {
  const { pathname } = useLocation();
  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    const ids = () => new Set([...main.querySelectorAll<HTMLElement>('[data-form-for]')].map((el) => el.dataset.formFor ?? ''));
    let known = ids();
    let timer = 0;
    let waitUntil = 0;
    let pending: string | null = null;

    const busy = () =>
      !!document.querySelector('.lg-editing, .tag-menu') ||
      !!(document.activeElement as HTMLElement | null)?.closest?.('.lg-editor');

    const tryScroll = () => {
      timer = 0;
      if (!pending) return;
      if (busy() && Date.now() < waitUntil) { timer = window.setTimeout(tryScroll, 250); return; }
      const el = main.querySelector<HTMLElement>(`[data-form-for="${CSS.escape(pending)}"]`);
      pending = null;
      if (!el) return;
      const header = document.querySelector('body header')?.getBoundingClientRect().bottom ?? 0;
      const bar = document.querySelector('.pinned-action')?.getBoundingClientRect().height ?? 0;
      const top = el.getBoundingClientRect().top;
      // Already in view: its top is on screen, below the header and pinned bar.
      if (top >= header + bar && top <= window.innerHeight * 0.6) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const observer = new MutationObserver(() => {
      const now = ids();
      // The innermost new form wins (a shot's form inside a scene's form).
      const added = [...now].filter((id) => id && !known.has(id));
      known = now;
      if (!added.length) return;
      pending = added[added.length - 1];
      waitUntil = Date.now() + 15000;
      if (timer) clearTimeout(timer);
      // Let the grid finish the tap (and any pick list open) first.
      timer = window.setTimeout(tryScroll, 300);
    });
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-form-for'] });
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [pathname]);
  return null;
}
