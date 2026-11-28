import { useEffect } from 'react';
import type { CallSheetLayout } from '../lib/api';

type Which = 'modern' | 'one_page';

// The one-page sheet prints with narrow margins (0.3in top and bottom, 0.4in sides; the modern
// layout keeps the wider @page margins in styles.css). Its height on a Letter page at 96px per
// inch, with a little to spare; .cs1 is 7.7in wide to match.
const ONE_PAGE_MARGINS = '0.3in 0.4in';
const PAGE_HEIGHT = (11 - 0.6) * 96 * 0.97;

/** Choose which layout goes to paper, with the one-page sheet's narrow margins when it's that one. */
function setPrintLayout(which: Which) {
  document.documentElement.dataset.print = which;
  let style = document.getElementById('cs1-page');
  if (!style) {
    style = document.createElement('style');
    style.id = 'cs1-page';
    document.head.appendChild(style);
  }
  style.textContent = which === 'one_page' ? `@page { margin: ${ONE_PAGE_MARGINS}; }` : '';
}

/** Which layouts a project prints (missing means modern). */
export const layoutsOf = (layout: CallSheetLayout | null | undefined): Which[] =>
  layout === 'both' ? ['modern', 'one_page'] : layout === 'one_page' ? ['one_page'] : ['modern'];

/**
 * Print (or save as PDF) the call sheet in one layout. The page holds both designs;
 * html[data-print] picks which one goes to paper. The one-page sheet is shrunk to fit
 * when a long day would run onto a second page.
 */
export function printSheet(which: Which) {
  setPrintLayout(which);
  fitOnePage();
  window.print();
}

/** Shrink the one-page sheet when a long day would run onto a second page (or undo it for the modern layout). */
function fitOnePage() {
  const one = document.querySelector<HTMLElement>('.cs1');
  if (!one) return;
  one.style.removeProperty('zoom');
  if (document.documentElement.dataset.print !== 'one_page') return;
  const h = one.scrollHeight;
  if (h > PAGE_HEIGHT) one.style.setProperty('zoom', String(Math.max(0.6, Math.floor((PAGE_HEIGHT / h) * 1000) / 1000)));
}

/**
 * The call sheet's print button: one for each layout the project prints. With both
 * layouts on there are two buttons, and each prints only its own layout.
 */
export function PrintButtons({ layout, short, className = 'btn btn-secondary sm:w-auto' }: {
  layout: CallSheetLayout | null | undefined;
  /** The small buttons in a link page's top bar. */
  short?: boolean;
  className?: string;
}) {
  const which = layoutsOf(layout);
  // The browser's own Print (Ctrl+P / ⌘P) uses the project's first layout.
  useEffect(() => {
    const reset = () => setPrintLayout(which[0]);
    reset();
    window.addEventListener('beforeprint', fitOnePage);
    window.addEventListener('afterprint', reset);
    return () => {
      window.removeEventListener('beforeprint', fitOnePage);
      window.removeEventListener('afterprint', reset);
      delete document.documentElement.dataset.print;
      document.getElementById('cs1-page')?.remove();
    };
  }, [which[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (w: Which) => {
    if (which.length === 1) return short ? 'Print or PDF' : 'Print or save as PDF';
    if (short) return w === 'modern' ? 'Print modern' : 'Print 1 page';
    return w === 'modern' ? 'Print modern layout' : 'Print one page';
  };
  const buttons = which.map((w) => (
    <button key={w} type="button" className={className} onClick={() => printSheet(w)}>{label(w)}</button>
  ));
  // In a link page's top bar, two buttons drop to a row of their own on phones.
  return short ? <span className={`sheet-link-print ${which.length > 1 ? 'sheet-link-print-2' : ''}`}>{buttons}</span> : <>{buttons}</>;
}
