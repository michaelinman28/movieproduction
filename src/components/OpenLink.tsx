import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * A link from a form to another item's home page (built with itemPath from
 * src/lib/links.ts), e.g. "Open Lakeside cabin" under a task's Location picker.
 */
export function OpenLink({ to, children, title }: { to: string; children: ReactNode; title?: string }) {
  return (
    <Link to={to} title={title} className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-normal sm:min-h-0">
      {children}<span aria-hidden="true">›</span>
    </Link>
  );
}
