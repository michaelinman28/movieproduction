import { useEffect } from 'react';
import type { CallSheetLayout } from '../lib/api';

type Which = 'modern' | 'one_page';

// A Letter page at 96px per inch, less the print margins (@page in styles.css), with a little to spare.
const PAGE_HEIGHT = (11 - 0.9) * 96 * 0.97;

/** Which layouts a project prints (missing means modern). */
export const layoutsOf = (layout: CallSheetLayout | null | undefined): Which[] =>
  layout === 'both' ? ['modern', 'one_page'] : layout === 'one_page' ? ['one_page'] : ['modern'];

/**
 * Print (or save as PDF) the call sheet in one layout. The page holds both designs;
 * html[data-print] picks which one goes to paper. The one-page sheet is shrunk to fit
 * when a long day would run onto a second page.
 */
export function printSheet(which: Which) {
  document.documentElement.dataset.print = which;
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
    const reset = () => { document.documentElement.dataset.print = which[0]; };
    reset();
    window.addEventListener('beforeprint', fitOnePage);
    window.addEventListener('afterprint', reset);
    return () => {
      window.removeEventListener('beforeprint', fitOnePage);
      window.removeEventListener('afterprint', reset);
      delete document.documentElement.dataset.print;
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
