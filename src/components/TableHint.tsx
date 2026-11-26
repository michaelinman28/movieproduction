import { useState, type ReactNode } from 'react';

const KEY = 'mp-tips-open';

/**
 * A table's help: one short line above the table, with "More tips" for the rest.
 * Whether the tips are open is remembered on this device for every table.
 */
export function TableHint({ children, more, className = 'mb-2' }: { children: ReactNode; more?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } });
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* not kept; fine */ }
  };
  return (
    <div className={`hint ${className}`}>
      <p>
        {children}
        {more && <>{' '}<button type="button" className="hint-more" aria-expanded={open} onClick={toggle}>{open ? 'Fewer tips' : 'More tips'}</button></>}
      </p>
      {more && open && <p className="mt-1">{more}</p>}
    </div>
  );
}
