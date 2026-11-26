import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { appRelative, goBack, isItemLink, linkOut, type BackTo as Back, type LinkState } from '../lib/backLink';

/**
 * "‹ Back to Scene 3" at the top of a page reached by an item link (see src/lib/backLink.ts).
 * Shown on every page, above its heading, only when there is somewhere to go back to.
 * Once it scrolls out of sight, PinnedAction keeps a copy in the bar under the header.
 */
export function BackLink() {
  const back = (useLocation().state as LinkState)?.back;
  if (!back) return null;
  return <p className="no-print -mt-2 mb-3 md:-mt-4"><BackTo back={back} /></p>;
}

/** The link itself; PinnedAction shows a copy in its bar once the page's one scrolls away. */
export function BackTo({ back, className = '' }: { back: Back; className?: string }) {
  const navigate = useNavigate();
  return (
    <Link to={back.url} data-back-link className={`inline-flex min-h-11 min-w-0 max-w-full items-center gap-1 text-sm sm:min-h-0 ${className}`}
      title={`Back to ${back.label}`}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        goBack(navigate, back);
      }}>
      <span aria-hidden="true">‹</span>
      <span className="truncate">Back to {back.label}</span>
    </Link>
  );
}

/**
 * Every item link in the app (a react-router Link or a plain <a>) remembers the page it
 * was followed from. Table links do the same in LatticeGrid. Render after UnsavedGuard,
 * so a declined "discard changes?" stops it.
 */
export function LinkOutTracker() {
  const navigate = useNavigate();
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest?.<HTMLAnchorElement>('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download') || a.dataset.to != null || a.hasAttribute('data-back-link')) return;
      const to = appRelative(a.href);
      if (!to || !isItemLink(to)) return;
      e.preventDefault();
      linkOut(navigate, to, a);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [navigate]);
  return null;
}
