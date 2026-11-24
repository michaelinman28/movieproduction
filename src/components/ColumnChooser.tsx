import { useEffect, useId, useRef, useState } from 'react';

export interface ChooserColumn { id: string; header: string; hidden: boolean }

/**
 * The "Columns" button above a table: tick the columns to show. LatticeGrid saves the
 * choice for the rest of the browser session (see src/lib/gridColumns.ts).
 */
export function ColumnChooser({ columns, onToggle, onShowAll }: {
  columns: ChooserColumn[];
  onToggle: (id: string, visible: boolean) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!columns.length) return null;
  const hidden = columns.filter((c) => c.hidden).length;
  const shown = columns.length - hidden;

  return (
    <div ref={box} className="relative flex justify-end">
      <button type="button" className="btn-link text-sm" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(!open)}>
        Columns{hidden ? ` (${hidden} hidden)` : ''} <span aria-hidden="true" className="ml-1">▾</span>
      </button>
      {open && (
        <div id={menuId} role="group" aria-label="Columns to show"
          className="absolute right-0 top-full z-30 flex max-h-[60vh] w-64 max-w-[calc(100vw-2rem)] flex-col overflow-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
          {columns.map((c) => (
            <label key={c.id} className="check rounded-md px-2 text-base hover:bg-accent-soft">
              <input type="checkbox" checked={!c.hidden}
                // Keep at least one column showing.
                disabled={!c.hidden && shown === 1}
                onChange={(e) => onToggle(c.id, e.target.checked)} />
              {c.header}
            </label>
          ))}
          {hidden > 0 && (
            <button type="button" className="btn-link justify-center border-t border-line text-sm" onClick={onShowAll}>Show all columns</button>
          )}
        </div>
      )}
    </div>
  );
}
