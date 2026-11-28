import { useEffect } from 'react';
import type { CallSheetLayout } from '../lib/api';

type Which = 'modern' | 'one_page';

// Both printed sheets print with no page margin at all, so the browser has no room to add its
// own header and footer (date, page title, web address); the sheets keep their own space
// (styles.css). The one-page sheet's height on a Letter page at 96px per inch, with a
// little to spare; .cs1 is 7.7in wide to match (8.5in less 0.4in each side).
const PAGE_HEIGHT = (11 - 0.6) * 96 * 0.97;

/** Choose which layout goes to paper, on a page with no margin (each sheet keeps its own space). */
function setPrintLayout(which: Which) {
  document.documentElement.dataset.print = which;
  let style = document.getElementById('cs1-page');
  if (!style) {
    style = document.createElement('style');
    style.id = 'cs1-page';
    document.head.appendChild(style);
  }
  style.textContent = '@page { margin: 0; }';
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

/** Fit a long day on one page: first the bottom sections go into one row, then the sheet shrinks (undone for the modern layout). */
function fitOnePage() {
  const one = document.querySelector<HTMLElement>('.cs1-one');
  if (!one) return;
  one.style.removeProperty('zoom');
  one.classList.remove('cs1-tight');
  if (document.documentElement.dataset.print !== 'one_page') return;
  // Too long with notes on a row of their own: put notes, elements and the advance
  // schedule side by side (notes first) before shrinking anything.
  if (one.scrollHeight > PAGE_HEIGHT) one.classList.add('cs1-tight');
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
