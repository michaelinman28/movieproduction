import { useEffect } from 'react';
import { confirmDiscard, hasUnsaved } from '../lib/unsaved';

/** Asks before leaving a page (a link, reload or closing the tab) with unsaved form changes. */
export function UnsavedGuard() {
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (hasUnsaved()) e.preventDefault(); };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.('a[href]');
      if (!a || a.getAttribute('target') === '_blank' || /^(mailto|tel):/.test(a.getAttribute('href') ?? '')) return;
      if (!confirmDiscard()) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, []);
  return null;
}
